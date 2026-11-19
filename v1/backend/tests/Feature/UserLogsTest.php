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

    public function test_user_can_search_visible_log_text_with_literal_wildcards(): void
    {
        $actor = $this->user(['role' => 'instructor']);

        foreach ([
            ['action' => 'REVIEW_COMPLETED', 'entity_type' => 'research_document', 'entity_id' => '101', 'description' => 'Reviewed proposal_% details.'],
            ['action' => 'REVIEW_STARTED', 'entity_type' => 'research_document', 'entity_id' => '202', 'description' => 'Reviewed proposal ABC details.'],
        ] as $log) {
            AuditLog::query()->create(array_merge($log, [
                AuditLog::column('user_id') => $actor->id,
                'created_at' => now(),
            ]));
        }

        $response = $this->as($actor)->getJson('/api/user-logs?search=proposal_%25');

        $response
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.action', 'REVIEW_COMPLETED');

        $this->as($actor)
            ->getJson('/api/user-logs?search=review%20completed')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.action', 'REVIEW_COMPLETED');
    }

    public function test_user_can_filter_logs_by_an_inclusive_date_range(): void
    {
        $actor = $this->user(['role' => 'instructor']);

        foreach ([
            ['action' => 'BEFORE_RANGE', 'created_at' => '2026-09-09 23:59:59'],
            ['action' => 'IN_RANGE', 'created_at' => '2026-09-10 12:00:00'],
            ['action' => 'AFTER_RANGE', 'created_at' => '2026-09-11 00:00:00'],
        ] as $log) {
            AuditLog::query()->forceCreate(array_merge($log, [
                AuditLog::column('user_id') => $actor->id,
                'entity_type' => 'research_document',
                'entity_id' => '101',
                'description' => 'Dated activity',
            ]));
        }

        $response = $this->as($actor)->getJson(
            '/api/user-logs?created_from=2026-09-10&created_to=2026-09-10',
        );

        $response
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.action', 'IN_RANGE');
    }

    public function test_search_parameters_remain_on_paginated_user_log_links(): void
    {
        $actor = $this->user(['role' => 'instructor']);

        foreach (range(1, 26) as $index) {
            AuditLog::query()->create([
                AuditLog::column('user_id') => $actor->id,
                'action' => 'MATCHING_EVENT',
                'entity_type' => 'research_document',
                'entity_id' => (string) $index,
                'description' => 'Matching activity',
                'created_at' => now()->subSeconds($index),
            ]);
        }

        $response = $this->as($actor)->getJson('/api/user-logs?search=matching&page=2');

        $response
            ->assertOk()
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonCount(1, 'data');

        $this->assertStringContainsString('search=matching', $response->json('links.first'));
    }

    public function test_user_log_filters_are_validated(): void
    {
        $actor = $this->user(['role' => 'instructor']);

        $this->as($actor)
            ->getJson('/api/user-logs?created_to=2026-09-10')
            ->assertOk();

        $this->as($actor)
            ->getJson('/api/user-logs?search='.str_repeat('x', 201))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('search');

        $this->as($actor)
            ->getJson('/api/user-logs?created_from=2026-09-11&created_to=2026-09-10')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('created_to');
    }

    public function test_user_can_clear_visible_logs(): void
    {
        $actor = $this->user(['role' => 'instructor']);

        AuditLog::query()->create([
            AuditLog::column('user_id') => $actor->id,
            'action' => 'OLD_EVENT',
            'entity_type' => 'research_document',
            'entity_id' => '101',
            'description' => 'Old visible activity',
            'created_at' => now()->subMinute(),
        ]);

        $this->as($actor)
            ->postJson(
                '/api/user-logs/clear',
                [],
                ['Origin' => 'http://localhost:5173'],
            )
            ->assertNoContent();

        $this->assertSame(1, AuditLog::query()->count());

        $this->as($actor)
            ->getJson('/api/user-logs')
            ->assertOk()
            ->assertJsonCount(0, 'data');
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
