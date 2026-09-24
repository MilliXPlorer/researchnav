<?php

namespace Tests\Feature;

use App\Models\Institute;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class InstituteManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_migration_creates_the_table_and_seeds_default_institutes(): void
    {
        Schema::dropIfExists('institutes');
        $migration = require database_path('migrations/2026_09_25_000055_create_institutes_table.php');
        $migration->up();

        $this->assertTrue(Schema::hasTable('institutes'));
        $this->assertSame(
            ResearchDocument::INSTITUTES,
            Institute::query()->orderBy('id')->pluck('name')->all(),
        );
    }

    public function test_migration_is_safe_when_the_table_already_exists(): void
    {
        Institute::query()->create(['name' => 'Institute of Engineering']);
        $migration = require database_path('migrations/2026_09_25_000055_create_institutes_table.php');
        $migration->up();
        $migration->up();

        $this->assertSame(7, Institute::query()->count());
        $this->assertSame(1, Institute::query()->where('name', 'Institute of Engineering')->count());
        foreach (ResearchDocument::INSTITUTES as $institute) {
            $this->assertSame(1, Institute::query()->where('name', $institute)->count());
        }
    }

    public function test_admin_can_add_and_remove_an_unused_custom_institute(): void
    {
        $admin = $this->user(['role' => 'admin', 'is_admin' => true]);

        $this->as($admin)->postJson('/api/admin/institutes', ['name' => 'Institute of Engineering'], ['Origin' => 'http://localhost:5173'])
            ->assertCreated()->assertJsonPath('data', 'Institute of Engineering');
        $this->assertDatabaseHas('institutes', ['name' => 'Institute of Engineering']);

        $this->as($admin)->deleteJson('/api/admin/institutes/'.rawurlencode('Institute of Engineering'), [], ['Origin' => 'http://localhost:5173'])
            ->assertOk()->assertJsonPath('data.removed', true);
        $this->assertDatabaseMissing('institutes', ['name' => 'Institute of Engineering']);
    }

    public function test_admin_cannot_add_a_duplicate_institute(): void
    {
        $admin = $this->user(['role' => 'admin', 'is_admin' => true]);

        $this->as($admin)->postJson('/api/admin/institutes', ['name' => 'institute of computer studies'], ['Origin' => 'http://localhost:5173'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->as($admin)->postJson('/api/admin/institutes', ['name' => '  Institute of Engineering  '], ['Origin' => 'http://localhost:5173'])
            ->assertCreated()->assertJsonPath('data', 'Institute of Engineering');
        $this->as($admin)->postJson('/api/admin/institutes', ['name' => 'Institute of Engineering'], ['Origin' => 'http://localhost:5173'])
            ->assertUnprocessable()->assertJsonValidationErrors('name');
    }

    public function test_admin_cannot_delete_an_institute_assigned_to_a_user(): void
    {
        $admin = $this->user(['role' => 'admin', 'is_admin' => true]);
        $this->user(['role' => 'coordinator', 'institute' => 'Institute of Computer Studies']);

        $this->as($admin)->deleteJson('/api/admin/institutes/'.rawurlencode('Institute of Computer Studies'), [], ['Origin' => 'http://localhost:5173'])
            ->assertStatus(409)->assertJsonPath('error', 'INSTITUTE_IN_USE');
        $this->assertDatabaseHas('institutes', ['name' => 'Institute of Computer Studies']);
    }

    public function test_admin_cannot_delete_an_institute_used_by_research(): void
    {
        $admin = $this->user(['role' => 'admin', 'is_admin' => true]);
        ResearchDocument::factory()->create(['institute' => 'Institute of Health Sciences']);

        $this->as($admin)->deleteJson('/api/admin/institutes/'.rawurlencode('Institute of Health Sciences'), [], ['Origin' => 'http://localhost:5173'])
            ->assertStatus(409)->assertJsonPath('error', 'INSTITUTE_IN_USE');
        $this->assertDatabaseHas('institutes', ['name' => 'Institute of Health Sciences']);
    }

    public function test_non_admins_cannot_add_or_delete_institutes(): void
    {
        $researcher = $this->user(['role' => 'researcher']);

        $this->as($researcher)->postJson('/api/admin/institutes', ['name' => 'Institute of Engineering'], ['Origin' => 'http://localhost:5173'])
            ->assertForbidden();
        $this->as($researcher)->deleteJson('/api/admin/institutes/'.rawurlencode('Institute of Engineering'), [], ['Origin' => 'http://localhost:5173'])
            ->assertForbidden();
    }

    private function user(array $attributes = []): User
    {
        $role = $attributes['role'] ?? 'researcher';
        $roleDefinition = UserRole::query()->firstOrCreate(
            ['slug' => User::canonicalSlugForLegacyRole($role)],
            ['name' => ucfirst(str_replace(['_', '-'], ' ', $role)), 'is_active' => true],
        );

        return User::factory()->create(array_merge([
            'id' => (string) Str::uuid(),
            'role' => $role,
            'role_id' => $roleDefinition->id,
            'access_status' => 'active',
            'account_status' => 'active',
        ], $attributes));
    }

    private function as(User $user): static
    {
        return $this->withSession(['user_id' => $user->id]);
    }
}
