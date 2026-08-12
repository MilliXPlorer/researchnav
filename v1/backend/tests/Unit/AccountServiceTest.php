<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\AccountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class AccountServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_google_resolution_activates_an_invited_account_and_binds_its_subject(): void
    {
        $invited = $this->user(['access_status' => 'invited']);

        $resolved = app(AccountService::class)->resolveGoogleUser(strtoupper($invited->email), 'subject-1');

        $this->assertSame($invited->id, $resolved->id);
        $this->assertSame('subject-1', $resolved->google_sub);
        $this->assertSame('active', $resolved->access_status);
        $this->assertNotNull($resolved->confirmed_at);
        $this->assertNotNull($resolved->last_login_at);
    }

    public function test_google_subject_cannot_be_relinked_to_a_different_email(): void
    {
        $user = $this->user(['google_sub' => 'subject-1']);

        $this->expectException(RuntimeException::class);
        app(AccountService::class)->resolveGoogleUser('other@example.edu', $user->google_sub);
    }

    public function test_database_default_blocks_users_when_status_is_not_provided(): void
    {
        $user = User::query()->create([
            'email' => 'default-status@example.edu',
            'role' => 'researcher',
            'is_admin' => false,
        ]);

        $this->assertSame('blocked', $user->fresh()->access_status);
        $this->assertNotNull($user->fresh()->created_at);
        $this->assertNotNull($user->fresh()->updated_at);
    }

    public function test_provisioning_preserves_the_existing_policy_semantics(): void
    {
        $researcher = $this->user(['access_status' => 'blocked']);
        $result = app(AccountService::class)->provisionUser($researcher->email, 'coordinator', $researcher->id);

        $this->assertSame('coordinator', $result->role);
        $this->assertSame('invited', $result->access_status);

        $this->expectException(RuntimeException::class);
        app(AccountService::class)->provisionUser($result->email, 'instructor', $researcher->id);
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
