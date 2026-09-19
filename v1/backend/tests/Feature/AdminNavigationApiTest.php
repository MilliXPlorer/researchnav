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

    public function test_users_listing_can_sort_by_email_ascending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'sorttest-charlie@example.edu',
        ]);

        $this->user([
            'email' => 'sorttest-alpha@example.edu',
        ]);

        $this->user([
            'email' => 'sorttest-bravo@example.edu',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=sorttest&sort=email&direction=asc'
        );

        $response->assertOk();

        $this->assertSame([
            'sorttest-alpha@example.edu',
            'sorttest-bravo@example.edu',
            'sorttest-charlie@example.edu',
        ], $response->json('data.*.email'));
    }

    public function test_users_listing_can_sort_by_email_descending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user(['email' => 'sorttest-alpha@example.edu']);
        $this->user(['email' => 'sorttest-bravo@example.edu']);
        $this->user(['email' => 'sorttest-charlie@example.edu']);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=sorttest&sort=email&direction=desc'
        );

        $response->assertOk();

        $this->assertSame([
            'sorttest-charlie@example.edu',
            'sorttest-bravo@example.edu',
            'sorttest-alpha@example.edu',
        ], $response->json('data.*.email'));
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

    public function test_administrator_can_soft_delete_users_but_not_their_own_account(): void
    {
        $actor = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $target = $this->user(['role' => 'panel', 'access_status' => 'active']);

        $this->as($actor)->deleteJson('/api/admin/users/'.$target->id, [], $this->origin())->assertNoContent();

        $this->assertSoftDeleted('users', ['id' => $target->id]);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $actor->id,
            'action' => 'ADMIN_USER_DELETED',
            'entity_id' => $target->id,
        ]);

        $this->as($actor)->deleteJson('/api/admin/users/'.$actor->id, [], $this->origin())
            ->assertConflict()
            ->assertExactJson(['error' => 'SELF_MODIFICATION_NOT_ALLOWED']);
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

    public function test_users_listing_can_sort_by_last_name_ascending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'name-sort-c@example.edu',
            'first_name' => 'Anna',
            'last_name' => 'Santos',
        ]);

        $this->user([
            'email' => 'name-sort-a@example.edu',
            'first_name' => 'Bea',
            'last_name' => 'Cruz',
        ]);

        $this->user([
            'email' => 'name-sort-b@example.edu',
            'first_name' => 'Carlo',
            'last_name' => 'Reyes',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=name-sort&sort=last_name&direction=asc'
        );

        $response->assertOk();

        $this->assertSame([
            'Cruz',
            'Reyes',
            'Santos',
        ], $response->json('data.*.names.last_name'));
    }

    public function test_users_listing_can_sort_by_last_name_descending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'name-sort-a@example.edu',
            'first_name' => 'Anna',
            'last_name' => 'Cruz',
        ]);

        $this->user([
            'email' => 'name-sort-b@example.edu',
            'first_name' => 'Bea',
            'last_name' => 'Reyes',
        ]);

        $this->user([
            'email' => 'name-sort-c@example.edu',
            'first_name' => 'Carlo',
            'last_name' => 'Santos',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=name-sort&sort=last_name&direction=desc'
        );

        $response->assertOk();

        $this->assertSame([
            'Santos',
            'Reyes',
            'Cruz',
        ], $response->json('data.*.names.last_name'));
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

        UserRole::query()->firstOrCreate(
            ['slug' => UserRole::RESEARCH_EDITOR],
            ['name' => 'Research Editor', 'description' => 'Editorial reviewer.', 'is_active' => true],
        );
        $this->as($admin)->postJson('/api/admin/accounts', [
            'email' => 'editor@example.edu',
            'role' => 'research_editor',
        ], $this->origin())
            ->assertCreated()
            ->assertJsonPath('user.role', 'research_editor');

        $this->assertDatabaseHas('users', [
            'email' => 'editor@example.edu',
            'role' => 'research_editor',
            'role_id' => UserRole::query()->where('slug', UserRole::RESEARCH_EDITOR)->value('id'),
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

    public function test_users_listing_can_sort_by_role_ascending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'role-sort-c@example.edu',
            'role' => 'researcher',
        ]);

        $this->user([
            'email' => 'role-sort-a@example.edu',
            'role' => 'adviser',
        ]);

        $this->user([
            'email' => 'role-sort-b@example.edu',
            'role' => 'panel',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=role-sort&sort=role&direction=asc'
        );

        $response->assertOk();

        $this->assertSame([
            'adviser',
            'panel',
            'researcher',
        ], $response->json('data.*.role'));
    }

    public function test_users_listing_can_sort_by_role_descending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'role-sort-a@example.edu',
            'role' => 'adviser',
        ]);

        $this->user([
            'email' => 'role-sort-b@example.edu',
            'role' => 'panel',
        ]);

        $this->user([
            'email' => 'role-sort-c@example.edu',
            'role' => 'researcher',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=role-sort&sort=role&direction=desc'
        );

        $response->assertOk();

        $this->assertSame([
            'researcher',
            'panel',
            'adviser',
        ], $response->json('data.*.role'));
    }
    public function test_users_listing_can_sort_by_access_status_ascending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'access-sort-c@example.edu',
            'access_status' => 'invited',
        ]);

        $this->user([
            'email' => 'access-sort-a@example.edu',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'access-sort-b@example.edu',
            'access_status' => 'blocked',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=access-sort&sort=access_status&direction=asc'
        );

        $response->assertOk();

        $this->assertSame([
            'active',
            'blocked',
            'invited',
        ], $response->json('data.*.access_status'));
    }

    public function test_users_listing_can_sort_by_access_status_descending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'access-sort-a@example.edu',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'access-sort-b@example.edu',
            'access_status' => 'blocked',
        ]);

        $this->user([
            'email' => 'access-sort-c@example.edu',
            'access_status' => 'invited',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=access-sort&sort=access_status&direction=desc'
        );

        $response->assertOk();

        $this->assertSame([
            'invited',
            'blocked',
            'active',
        ], $response->json('data.*.access_status'));
    }

    public function test_users_listing_can_sort_by_created_at_ascending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $newest = $this->user([
            'email' => 'created-sort-newest@example.edu',
        ]);
        $newest->forceFill([
            'created_at' => '2026-09-03 08:00:00',
        ])->save();

        $oldest = $this->user([
            'email' => 'created-sort-oldest@example.edu',
        ]);
        $oldest->forceFill([
            'created_at' => '2026-09-01 08:00:00',
        ])->save();

        $middle = $this->user([
            'email' => 'created-sort-middle@example.edu',
        ]);
        $middle->forceFill([
            'created_at' => '2026-09-02 08:00:00',
        ])->save();

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=created-sort&sort=created_at&direction=asc'
        );

        $response->assertOk();

        $this->assertSame([
            'created-sort-oldest@example.edu',
            'created-sort-middle@example.edu',
            'created-sort-newest@example.edu',
        ], $response->json('data.*.email'));
    }

    public function test_users_listing_can_sort_by_created_at_descending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $oldest = $this->user([
            'email' => 'created-sort-oldest@example.edu',
        ]);
        $oldest->forceFill([
            'created_at' => '2026-09-01 08:00:00',
        ])->save();

        $middle = $this->user([
            'email' => 'created-sort-middle@example.edu',
        ]);
        $middle->forceFill([
            'created_at' => '2026-09-02 08:00:00',
        ])->save();

        $newest = $this->user([
            'email' => 'created-sort-newest@example.edu',
        ]);
        $newest->forceFill([
            'created_at' => '2026-09-03 08:00:00',
        ])->save();

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=created-sort&sort=created_at&direction=desc'
        );

        $response->assertOk();

        $this->assertSame([
            'created-sort-newest@example.edu',
            'created-sort-middle@example.edu',
            'created-sort-oldest@example.edu',
        ], $response->json('data.*.email'));
    }

    public function test_users_listing_can_sort_by_last_login_at_ascending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'login-sort-newest@example.edu',
            'last_login_at' => '2026-09-03 08:00:00',
        ]);

        $this->user([
            'email' => 'login-sort-oldest@example.edu',
            'last_login_at' => '2026-09-01 08:00:00',
        ]);

        $this->user([
            'email' => 'login-sort-middle@example.edu',
            'last_login_at' => '2026-09-02 08:00:00',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=login-sort&sort=last_login_at&direction=asc'
        );

        $response->assertOk();

        $this->assertSame([
            'login-sort-oldest@example.edu',
            'login-sort-middle@example.edu',
            'login-sort-newest@example.edu',
        ], $response->json('data.*.email'));
    }

    public function test_users_listing_can_sort_by_last_login_at_descending(): void
    {
        $admin = $this->user([
            'role' => 'admin',
            'access_status' => 'active',
        ]);

        $this->user([
            'email' => 'login-sort-oldest@example.edu',
            'last_login_at' => '2026-09-01 08:00:00',
        ]);

        $this->user([
            'email' => 'login-sort-middle@example.edu',
            'last_login_at' => '2026-09-02 08:00:00',
        ]);

        $this->user([
            'email' => 'login-sort-newest@example.edu',
            'last_login_at' => '2026-09-03 08:00:00',
        ]);

        $response = $this->as($admin)->getJson(
            '/api/admin/users?search=login-sort&sort=last_login_at&direction=desc'
        );

        $response->assertOk();

        $this->assertSame([
            'login-sort-newest@example.edu',
            'login-sort-middle@example.edu',
            'login-sort-oldest@example.edu',
        ], $response->json('data.*.email'));
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
