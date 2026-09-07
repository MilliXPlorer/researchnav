<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

class AdminNavigationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_navigation_requires_an_active_administrator_with_an_active_canonical_role(): void
    {
        $this->getJson('/api/admin/users')
            ->assertUnauthorized()
            ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);

        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $this->as($admin)->getJson('/api/admin/users')->assertOk();

        $this->as($this->user())->getJson('/api/admin/users')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
        $this->as($this->user(['role' => 'admin', 'access_status' => 'invited']))->getJson('/api/admin/users')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);

        UserRole::query()->where('slug', UserRole::ADMINISTRATOR)->update(['is_active' => false]);
        $this->as($admin)->getJson('/api/admin/users')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
    }

    public function test_users_listing_has_a_safe_exact_baseline_and_filters_pagination(): void
    {
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $matching = $this->user([
            'email' => 'anna.admin@example.edu',
            'student_employee_id' => 'S_%100',
            'first_name' => 'Anna',
            'last_name' => 'Admin',
            'role' => 'adviser',
            'access_status' => 'blocked',
        ]);
        $this->user(['email' => 'other@example.edu', 'role' => 'researcher', 'access_status' => 'active']);

        $response = $this->as($admin)->getJson('/api/admin/users?search=S_%&role=adviser&access_status=blocked&per_page=10');
        $response->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('meta.per_page', 10)
            ->assertJsonPath('data.0.id', $matching->id)
            ->assertJsonPath('data.0.names.first_name', 'Anna');

        $entry = $response->json('data.0');
        $this->assertSame([
            'id', 'email', 'student_employee_id', 'names', 'role', 'access_status', 'is_admin',
            'invitation_sent_at', 'confirmed_at', 'last_login_at', 'created_at', 'updated_at',
        ], array_keys($entry));
        $this->assertArrayNotHasKey('google_sub', $entry);
        $this->assertArrayNotHasKey('account_status', $entry);
        $this->assertArrayNotHasKey('password', $entry);

        $this->as($admin)->getJson('/api/admin/users?role=invalid')->assertUnprocessable();
        $this->as($admin)->getJson('/api/admin/users?search='.str_repeat('x', 201))->assertUnprocessable();
    }

    public function test_user_updates_sync_canonical_fields_audit_changes_and_reject_invalid_transitions(): void
    {
        $actor = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $otherAdmin = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $target = $this->user(['role' => 'researcher', 'access_status' => 'blocked']);

        $this->as($actor)->patchJson('/api/admin/users/'.$target->id, [
            'role' => 'admin',
            'access_status' => 'active',
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.role', 'admin')
            ->assertJsonPath('data.access_status', 'active')
            ->assertJsonPath('data.is_admin', true);

        $target->refresh();
        $this->assertSame(UserRole::ADMINISTRATOR, $target->roleDefinition->slug);
        $this->assertTrue($target->is_admin);
        $this->assertSame('active', $target->account_status);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $actor->id, 'action' => 'ADMIN_USER_UPDATED', 'entity_id' => $target->id]);

        $auditCount = AuditLog::query()->count();
        $this->as($actor)->patchJson('/api/admin/users/'.$target->id, ['role' => 'admin'], $this->origin())->assertOk();
        $this->assertDatabaseCount('audit_logs', $auditCount);

        $this->as($actor)->patchJson('/api/admin/users/'.$actor->id, ['access_status' => 'blocked'], $this->origin())
            ->assertConflict()
            ->assertExactJson(['error' => 'SELF_MODIFICATION_NOT_ALLOWED']);
        $this->as($actor)->patchJson('/api/admin/users/'.$target->id, ['email' => 'not-allowed@example.edu'], $this->origin())
            ->assertUnprocessable();
        $this->as($actor)->patchJson('/api/admin/users/'.$target->id, [], $this->origin())
            ->assertUnprocessable();

        $confirmed = $this->user(['confirmed_at' => now(), 'access_status' => 'active']);
        $this->as($actor)->patchJson('/api/admin/users/'.$confirmed->id, ['access_status' => 'invited'], $this->origin())
            ->assertConflict()
            ->assertExactJson(['error' => 'INVALID_ACCESS_TRANSITION']);

        // The acting administrator itself is an eligible second active administrator.
        $this->as($actor)->patchJson('/api/admin/users/'.$otherAdmin->id, ['access_status' => 'blocked'], $this->origin())->assertOk();
    }

    public function test_audit_logs_are_filtered_without_transport_or_raw_class_metadata(): void
    {
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $subject = $this->user();
        AuditLog::query()->create([
            'user_id' => $admin->id,
            'action' => 'ADMIN_USER_UPDATED',
            'entity_type' => User::class,
            'entity_id' => $subject->id,
            'description' => 'Administrator updated user role=researcher.',
            'ip_address' => '192.0.2.10',
            'user_agent' => 'secret-test-agent',
            'created_at' => now()->subDay(),
        ]);
        AuditLog::query()->create(['user_id' => $subject->id, 'action' => 'OTHER_EVENT', 'created_at' => now()]);

        $response = $this->as($admin)->getJson('/api/admin/audit-logs?action=ADMIN_USER_UPDATED&actor_id='.$admin->id.'&created_from='.now()->subDays(2)->toDateString());
        $response->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.actor.id', $admin->id)
            ->assertJsonPath('data.0.subject.type', 'user');
        $entry = $response->json('data.0');
        $this->assertSame(['id', 'action', 'actor', 'subject', 'description', 'created_at'], array_keys($entry));
        $this->assertStringNotContainsString('192.0.2.10', json_encode($entry, JSON_THROW_ON_ERROR));
        $this->assertStringNotContainsString(User::class, json_encode($entry, JSON_THROW_ON_ERROR));

        $this->as($admin)->getJson('/api/admin/audit-logs?action=not safe!')->assertUnprocessable();
    }

    public function test_system_status_reports_seeded_live_counts_without_configuration_secrets(): void
    {
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $owner = $this->user(['access_status' => 'invited']);
        $research = ResearchDocument::factory()->create(['submitted_by' => $owner->id]);
        DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'attachment',
            'version_number' => 1,
            'original_filename' => 'safe.pdf',
            'stored_filename' => 'safe.pdf',
            'file_path' => 'research/safe.pdf',
            'file_size' => 42,
            'uploaded_at' => now(),
        ]);
        DB::table('notifications')->insert([
            'id' => (string) Str::uuid(),
            'type' => 'test',
            'notifiable_type' => User::class,
            'notifiable_id' => $owner->id,
            'data' => '{}',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->as($admin)->getJson('/api/admin/system-status');
        $response->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.schema_version', 1)
            ->assertJsonPath('data.database.counts.users.total', 2)
            ->assertJsonPath('data.database.counts.users.access_statuses.active', 1)
            ->assertJsonPath('data.database.counts.users.access_statuses.invited', 1)
            ->assertJsonPath('data.database.counts.research_documents', 1)
            ->assertJsonPath('data.database.counts.notifications', 1)
            ->assertJsonPath('data.database.counts.document_files', 1)
            ->assertJsonPath('data.database.counts.document_file_bytes', 42)
            ->assertJsonPath('data.storage.private.disk', 'researchnav_private');
        $this->assertStringNotContainsString('storage/app/private', $response->getContent());
        $this->assertStringNotContainsString('AWS_SECRET_ACCESS_KEY', $response->getContent());
    }

    public function test_system_status_measures_private_storage_capabilities_and_removes_its_probe(): void
    {
        Storage::fake('researchnav_private');
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);

        $this->as($admin)->getJson('/api/admin/system-status')
            ->assertOk()
            ->assertJsonPath('data.storage.private.status', 'operational')
            ->assertJsonPath('data.storage.private.capabilities.read', true)
            ->assertJsonPath('data.storage.private.capabilities.write', true)
            ->assertJsonPath('data.storage.private.capabilities.delete', true);

        $this->assertSame([], Storage::disk('researchnav_private')->allFiles());
    }

    public function test_system_status_does_not_report_failed_private_storage_writes_as_operational(): void
    {
        $storage = Mockery::mock();
        $storage->shouldReceive('put')->once()->andReturnFalse();
        $storage->shouldReceive('delete')->once()->andReturnTrue();
        Storage::shouldReceive('disk')->once()->with('researchnav_private')->andReturn($storage);
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);

        $response = $this->as($admin)->getJson('/api/admin/system-status');

        $response->assertOk()
            ->assertJsonPath('data.storage.private.status', 'unavailable')
            ->assertJsonPath('data.storage.private.capabilities', null)
            ->assertJsonPath('data.issues', ['storage.researchnav_private_unavailable']);
        $this->assertStringNotContainsString('.researchnav-status-', $response->getContent());
    }

    public function test_coordinator_listing_and_provisioning_remain_private_and_audited(): void
    {
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $this->as($admin)->getJson('/api/admin/coordinators')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertExactJson(['users' => []]);

        $this->as($admin)->postJson('/api/admin/coordinators', ['email' => 'coordinator@example.edu'], $this->origin())
            ->assertCreated()
            ->assertJsonPath('user.role', 'coordinator');
        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'COORDINATOR_PROVISIONED']);
    }

    public function test_administrator_can_provision_and_list_supported_account_roles(): void
    {
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);

        $this->as($admin)->postJson('/api/admin/accounts', [
            'email' => 'librarian@example.edu',
            'role' => 'librarian',
        ], $this->origin())
            ->assertCreated()
            ->assertJsonPath('user.role', 'librarian')
            ->assertJsonPath('user.accessStatus', 'invited');

        $this->as($admin)->getJson('/api/admin/accounts')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('users.0.email', 'librarian@example.edu')
            ->assertJsonPath('users.0.role', 'librarian');

        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $admin->id,
            'action' => 'LIBRARIAN_PROVISIONED',
        ]);
    }

    public function test_account_provisioning_rejects_unsupported_or_administrator_roles(): void
    {
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);

        foreach (['admin', 'unknown'] as $role) {
            $this->as($admin)->postJson('/api/admin/accounts', [
                'email' => $role.'@example.edu',
                'role' => $role,
            ], $this->origin())->assertBadRequest();
        }
    }

    private function user(array $attributes = []): User
    {
        return User::query()->create(array_merge([
            'id' => (string) Str::uuid(),
            'email' => Str::lower(Str::random(16)).'@example.edu',
            'role' => 'researcher',
            'access_status' => 'active',
        ], $attributes));
    }

    private function as(User $user): static
    {
        return $this->withSession(['user_id' => $user->id]);
    }

    /** @return array<string, string> */
    private function origin(): array
    {
        return ['Origin' => 'http://localhost:5173'];
    }
}
