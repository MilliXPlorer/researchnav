<?php

namespace Tests\Feature;

use App\Models\AccessRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessRequestTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_requests_require_authentication(): void
    {
        $this->postJson('/api/access-requests', ['requested_role' => 'researcher'])
            ->assertUnauthorized()
            ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);

        $this->getJson('/api/access-requests/mine')->assertUnauthorized();
    }

    public function test_a_blocked_account_can_submit_one_request_and_read_it_back(): void
    {
        $applicant = $this->user('researcher', 'blocked');

        $this->submit($applicant, [
            'requested_role' => 'researcher',
            'full_name' => 'Filjoy Adala',
            'program' => 'BS Computer Science',
            'justification' => 'I am starting my capstone.',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.requested_role', 'researcher')
            ->assertJsonPath('data.email', $applicant->email);

        $this->actingAs($applicant)->getJson('/api/access-requests/mine')
            ->assertOk()
            ->assertJsonPath('data.status', 'pending');

        // A second open request is refused so the queue cannot be flooded.
        $this->submit($applicant, ['requested_role' => 'adviser'])
            ->assertStatus(409)
            ->assertExactJson(['error' => 'REQUEST_ALREADY_PENDING']);

        $this->assertSame(1, AccessRequest::query()->count());
    }

    public function test_an_active_account_has_nothing_to_request(): void
    {
        $this->submit($this->user('researcher'), ['requested_role' => 'researcher'])
            ->assertStatus(409)
            ->assertExactJson(['error' => 'ACCESS_ALREADY_GRANTED']);
    }

    public function test_administrator_role_can_never_be_self_requested(): void
    {
        $this->submit($this->user('researcher', 'blocked'), ['requested_role' => 'admin'])
            ->assertStatus(422);
    }

    public function test_only_active_administrators_may_read_or_decide_requests(): void
    {
        $applicant = $this->user('researcher', 'blocked');
        $request = $this->pendingRequest($applicant);

        foreach (['researcher', 'adviser', 'coordinator', 'research-office'] as $role) {
            $this->withSession(['user_id' => $this->user($role)->id])
                ->getJson('/api/admin/access-requests')
                ->assertForbidden();
        }

        $this->decide($this->user('researcher'), $request->id, ['decision' => 'approve'])
            ->assertForbidden();

        $this->assertSame('pending', $request->fresh()->status);
    }

    public function test_approval_assigns_the_role_activates_access_and_notifies_the_applicant(): void
    {
        $applicant = $this->user('researcher', 'blocked');
        $request = $this->pendingRequest($applicant, 'instructor');
        $admin = $this->admin();

        $this->decide($admin, $request->id, [
            'decision' => 'approve',
            'decision_remarks' => 'Confirmed with the department.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.requested_role', 'instructor')
            ->assertJsonPath('data.decided_by_email', $admin->email);

        $applicant->refresh();
        $this->assertSame('instructor', $applicant->role);
        $this->assertSame('active', $applicant->access_status);
        $this->assertSame('active', $applicant->account_status);
        $this->assertNotNull($applicant->confirmed_at);

        $this->assertSame(1, $applicant->notifications()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'ACCESS_REQUEST_APPROVED']);
    }

    public function test_an_administrator_may_grant_a_different_role_than_requested(): void
    {
        $applicant = $this->user('researcher', 'blocked');
        $request = $this->pendingRequest($applicant, 'coordinator');

        $this->decide($this->admin(), $request->id, [
            'decision' => 'approve',
            'granted_role' => 'librarian',
        ])
            ->assertOk()
            ->assertJsonPath('data.requested_role', 'librarian');

        $this->assertSame('librarian', $applicant->fresh()->role);
    }

    public function test_rejection_records_the_decision_and_leaves_the_account_without_access(): void
    {
        $applicant = $this->user('researcher', 'blocked');
        $request = $this->pendingRequest($applicant);

        $this->decide($this->admin(), $request->id, [
            'decision' => 'reject',
            'decision_remarks' => 'Not enrolled this term.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        $applicant->refresh();
        $this->assertSame('blocked', $applicant->access_status);
        $this->assertSame(1, $applicant->notifications()->count());
        $this->assertDatabaseHas('audit_logs', ['action' => 'ACCESS_REQUEST_REJECTED']);
    }

    public function test_a_decided_request_cannot_be_decided_again(): void
    {
        $applicant = $this->user('researcher', 'blocked');
        $request = $this->pendingRequest($applicant);
        $admin = $this->admin();

        $this->decide($admin, $request->id, ['decision' => 'approve'])
            ->assertOk();

        $this->decide($admin, $request->id, ['decision' => 'reject'])
            ->assertStatus(409)
            ->assertExactJson(['error' => 'REQUEST_ALREADY_DECIDED']);
    }

    public function test_administrator_access_is_never_granted_through_a_request(): void
    {
        $applicant = $this->user('researcher', 'blocked');
        $request = AccessRequest::query()->create([
            'user_id' => $applicant->id,
            'requested_role' => 'admin',
            'status' => 'pending',
            'requested_at' => now(),
        ]);

        $this->decide($this->admin(), $request->id, ['decision' => 'approve'])
            ->assertStatus(409)
            ->assertExactJson(['error' => 'ROLE_NOT_GRANTABLE']);

        $this->assertSame('blocked', $applicant->fresh()->access_status);
    }

    public function test_the_queue_lists_pending_requests_first_and_can_filter_by_status(): void
    {
        $pending = $this->pendingRequest($this->user('researcher', 'blocked'));
        AccessRequest::query()->create([
            'user_id' => $this->user('researcher', 'blocked')->id,
            'requested_role' => 'adviser',
            'status' => 'rejected',
            'requested_at' => now()->addMinute(),
            'decided_at' => now()->addMinute(),
        ]);

        $admin = $this->admin();

        $response = $this->withSession(['user_id' => $admin->id])
            ->getJson('/api/admin/access-requests')
            ->assertOk();
        $this->assertSame($pending->id, $response->json('data.0.id'));

        $filtered = $this->withSession(['user_id' => $admin->id])
            ->getJson('/api/admin/access-requests?status=rejected')
            ->assertOk();
        $this->assertSame(['rejected'], array_column($filtered->json('data'), 'status'));
    }

    private function submit(User $applicant, array $payload)
    {
        return $this->withSession(['user_id' => $applicant->id])
            ->postJson('/api/access-requests', $payload, $this->origin());
    }

    /** Mutating routes require an allowed browser origin. */
    private function origin(): array
    {
        return ['Origin' => 'http://localhost:5173'];
    }

    private function decide(User $admin, int|string $requestId, array $payload)
    {
        return $this->withSession(['user_id' => $admin->id])
            ->patchJson("/api/admin/access-requests/{$requestId}", $payload, $this->origin());
    }

    private function pendingRequest(User $applicant, string $role = 'researcher'): AccessRequest
    {
        return AccessRequest::query()->create([
            'user_id' => $applicant->id,
            'requested_role' => $role,
            'status' => 'pending',
            'requested_at' => now(),
        ]);
    }

    private function admin(): User
    {
        return User::factory()->create([
            'role' => 'admin',
            'access_status' => 'active',
            'is_admin' => true,
        ]);
    }

    private function user(string $role, string $accessStatus = 'active'): User
    {
        return User::factory()->create(['role' => $role, 'access_status' => $accessStatus]);
    }
}
