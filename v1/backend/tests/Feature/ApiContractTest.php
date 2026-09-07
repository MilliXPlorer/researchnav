<?php

namespace Tests\Feature;

use App\Contracts\GoogleIdTokenVerifier;
use App\Data\GoogleIdentity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class ApiContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_session_cookie_name_is_php_sapi_safe(): void
    {
        $this->assertSame('researchnav_sid', config('session.cookie'));
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]+$/', (string) config('session.cookie'));
    }

    public function test_health_is_public_and_does_not_start_a_session(): void
    {
        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson(['status' => 'ok'])
            ->assertCookieMissing('researchnav_sid');
    }

    public function test_session_requires_authentication_and_google_input_has_contract_validation_error(): void
    {
        config()->set('session.driver', 'database');

        $this->getJson('/api/auth/session')
            ->assertUnauthorized()
            ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED'])
            ->assertCookieMissing('researchnav_sid')
            ->assertHeaderMissing('Access-Control-Allow-Origin');

        $this->assertDatabaseCount('sessions', 0);

        $this->postJson('/api/auth/google', [], ['Origin' => 'http://localhost:5173'])
            ->assertStatus(400)
            ->assertJsonPath('error', 'INVALID_REQUEST')
            ->assertJsonPath('details.formErrors', [])
            ->assertJsonStructure(['details' => ['fieldErrors' => ['credential']]]);
    }

    public function test_google_login_uses_the_verifier_contract_and_creates_a_session(): void
    {
        $this->app->instance(GoogleIdTokenVerifier::class, new class implements GoogleIdTokenVerifier
        {
            public function verify(string $credential): GoogleIdentity
            {
                return new GoogleIdentity('google-subject-1', 'Researcher@Example.edu', true);
            }
        });

        $this->postJson('/api/auth/google', ['credential' => 'fake-token'], ['Origin' => 'http://localhost:5173'])
            ->assertOk()
            ->assertExactJson(['user' => [
                'email' => 'researcher@example.edu',
                'role' => 'researcher',
                'accessStatus' => 'blocked',
                'isAdmin' => false,
                'firstName' => null,
                'middleName' => null,
                'lastName' => null,
                'studentEmployeeId' => null,
                'displayName' => 'researcher@example.edu',
                'profilePhotoUrl' => null,
            ]])
            ->assertCookie('researchnav_sid')
            ->assertCookieExpired('researchnav.sid');

        $this->assertDatabaseHas('users', [
            'email' => 'researcher@example.edu',
            'google_sub' => 'google-subject-1',
            'access_status' => 'blocked',
        ]);
    }

    public function test_google_login_replaces_the_session_and_persists_the_guard_user_id(): void
    {
        config()->set('session.driver', 'database');
        $this->app->instance(GoogleIdTokenVerifier::class, new class implements GoogleIdTokenVerifier
        {
            public function verify(string $credential): GoogleIdentity
            {
                return new GoogleIdentity('google-subject-2', 'session@example.edu', true);
            }
        });

        $this->withSession(['legacy' => true])
            ->postJson('/api/auth/google', ['credential' => 'fake-token'], ['Origin' => 'http://localhost:5173'])
            ->assertOk();

        $userId = User::query()->where('email', 'session@example.edu')->value('id');
        $this->assertDatabaseHas('sessions', ['user_id' => $userId]);
        $this->assertSame(1, DB::table('sessions')->where('user_id', $userId)->count());
    }

    public function test_mutations_require_an_exact_allowed_origin(): void
    {
        $this->postJson('/api/auth/google', ['credential' => 'fake-token'], ['Origin' => 'http://evil.example'])
            ->assertForbidden()
            ->assertExactJson(['error' => 'ORIGIN_NOT_ALLOWED']);
    }

    public function test_oversized_bodies_return_a_stable_payload_too_large_error(): void
    {
        $this->postJson('/api/auth/google', ['credential' => str_repeat('a', 32 * 1024)], ['Origin' => 'http://localhost:5173'])
            ->assertStatus(413)
            ->assertExactJson(['error' => 'PAYLOAD_TOO_LARGE']);
    }

    public function test_active_and_role_guards_match_the_api_contract(): void
    {
        $invited = $this->user(['access_status' => 'invited']);
        $this->withSession(['user_id' => $invited->id])->getJson('/api/admin/coordinators')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);

        $researcher = $this->user(['access_status' => 'active']);
        $this->withSession(['user_id' => $researcher->id])->getJson('/api/admin/coordinators')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);

        $admin = $this->user(['role' => 'admin', 'is_admin' => true, 'access_status' => 'active']);
        $this->withSession(['user_id' => $admin->id])->getJson('/api/admin/coordinators')
            ->assertOk()
            ->assertExactJson(['users' => []]);

        $this->withSession(['user_id' => $admin->id])->getJson('/api/coordinator/instructors')
            ->assertOk()
            ->assertExactJson(['users' => []]);

        $researchOffice = $this->user(['role' => 'research-office', 'access_status' => 'active']);
        $this->withSession(['user_id' => $researchOffice->id])->getJson('/api/coordinator/instructors')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
    }

    public function test_provisioning_returns_the_session_shape_and_logout_invalidates_the_session(): void
    {
        Mail::fake();
        $admin = $this->user(['role' => 'admin', 'is_admin' => true, 'access_status' => 'active']);

        $this->withSession(['user_id' => $admin->id])
            ->postJson('/api/admin/coordinators', ['email' => 'Coordinator@Example.edu'], ['Origin' => 'http://localhost:5173'])
            ->assertCreated()
            ->assertExactJson(['user' => [
                'email' => 'coordinator@example.edu',
                'role' => 'coordinator',
                'accessStatus' => 'invited',
                'isAdmin' => false,
                'firstName' => null,
                'middleName' => null,
                'lastName' => null,
                'studentEmployeeId' => null,
                'displayName' => 'coordinator@example.edu',
                'profilePhotoUrl' => null,
            ]]);

        $this->withSession(['user_id' => $admin->id])
            ->postJson('/api/auth/logout', [], ['Origin' => 'http://localhost:5173'])
            ->assertNoContent()
            ->assertCookieExpired('researchnav_sid')
            ->assertCookieExpired('researchnav.sid');
    }

    public function test_logout_succeeds_when_the_session_is_already_missing(): void
    {
        $this->postJson('/api/auth/logout', [], ['Origin' => 'http://localhost:5173'])
            ->assertNoContent()
            ->assertCookieExpired('researchnav_sid')
            ->assertCookieExpired('researchnav.sid');
    }

    private function user(array $attributes = []): User
    {
        return User::query()->create(array_merge([
            'id' => (string) Str::uuid(),
            'email' => Str::lower(Str::random(12)).'@example.edu',
            'role' => 'researcher',
            'access_status' => 'blocked',
            'is_admin' => false,
        ], $attributes));
    }
}
