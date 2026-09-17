<?php

namespace Tests\Feature;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class UserLogsTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_staff_user_only_sees_their_own_logs(): void
    {
        $actor = $this->user(['role' => 'instructor']);
        $other = $this->user(['role' => 'adviser']);

        AuditLog::query()->create([
            AuditLog::column('user_id') => $actor->id,
            'action' => 'OWN_EVENT',
            'entity_type' => 'research_document',
            'entity_id' => '101',
            'description' => 'Own activity',
            'created_at' => now(),
        ]);

        AuditLog::query()->create([
            AuditLog::column('user_id') => $other->id,
            'action' => 'OTHER_EVENT',
            'entity_type' => 'research_document',
            'entity_id' => '202',
            'description' => 'Other user activity',
            'created_at' => now(),
        ]);

        $response = $this->as($actor)->getJson('/api/user-logs');

        $response
            ->assertOk()
            ->assertJsonPath('data.0.action', 'OWN_EVENT')
            ->assertJsonMissing(['action' => 'OTHER_EVENT']);
    }

    public function test_supported_staff_roles_can_access_user_logs(): void
    {
        foreach ([
            'instructor',
            'adviser',
            'panel',
            'statistician',
            'librarian',
            'research_editor',
        ] as $role) {
            $user = $this->user(['role' => $role]);

            $this->as($user)
                ->getJson('/api/user-logs')
                ->assertOk();
        }
    }

    /** @param array<string, mixed> $attributes */
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
}