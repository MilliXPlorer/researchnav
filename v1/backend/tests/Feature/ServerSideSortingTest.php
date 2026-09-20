<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Category;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ServerSideSortingTest extends TestCase
{
    use RefreshDatabase;

    public function test_audit_logs_sort_by_actor_ascending_by_default_and_retain_filters_in_pagination_links(): void
    {
        $admin = $this->user(['role' => 'admin']);
        $zulu = $this->user(['email' => 'zulu@example.edu']);
        $alpha = $this->user(['email' => 'alpha@example.edu']);

        foreach ([$zulu, $alpha] as $actor) {
            AuditLog::query()->forceCreate([
                'user_id' => $actor->id,
                'action' => 'SORTED_EVENT',
                'entity_type' => 'research_document',
                'entity_id' => '1',
                'description' => 'Audit event',
                'created_at' => $actor->is($zulu) ? now() : now()->subMinute(),
            ]);
        }

        $response = $this->as($admin)->getJson('/api/admin/audit-logs?action=SORTED_EVENT&sort=actor');

        $response->assertOk();
        $this->assertSame(['alpha@example.edu', 'zulu@example.edu'], $response->json('data.*.actor.email'));
        $this->assertStringContainsString('action=SORTED_EVENT', $response->json('links.first'));
        $this->assertStringContainsString('sort=actor', $response->json('links.first'));
    }

    public function test_audit_actor_sort_includes_soft_deleted_users_and_keeps_missing_actors_last(): void
    {
        $admin = $this->user(['role' => 'admin']);
        $zulu = $this->user(['email' => 'zulu@example.edu']);
        $alpha = $this->user(['email' => 'alpha@example.edu']);

        $logs = collect([$alpha, $zulu])->map(fn (User $actor) => AuditLog::query()->forceCreate([
            'user_id' => $actor->id,
            'action' => 'ACTOR_SORTED_EVENT',
            'entity_type' => 'research_document',
            'entity_id' => '1',
            'description' => 'Audit event',
            'created_at' => now(),
        ]));
        $system = AuditLog::query()->forceCreate([
            'user_id' => null,
            'action' => 'ACTOR_SORTED_EVENT',
            'entity_type' => 'research_document',
            'entity_id' => '1',
            'description' => 'System audit event',
            'created_at' => now(),
        ]);
        $zulu->delete();

        $ascending = $this->as($admin)->getJson('/api/admin/audit-logs?action=ACTOR_SORTED_EVENT&sort=actor');
        $ascending->assertOk()->assertJsonPath('data.1.actor.email', 'zulu@example.edu');
        $this->assertSame([$logs[0]->id, $logs[1]->id, $system->id], $ascending->json('data.*.id'));

        $descending = $this->as($admin)->getJson('/api/admin/audit-logs?action=ACTOR_SORTED_EVENT&sort=actor&direction=desc');
        $descending->assertOk();
        $this->assertSame([$logs[1]->id, $logs[0]->id, $system->id], $descending->json('data.*.id'));
    }

    public function test_user_logs_sort_by_action_with_a_deterministic_id_tie_breaker(): void
    {
        $actor = $this->user(['role' => 'instructor']);
        $later = AuditLog::query()->create([
            'user_id' => $actor->id,
            'action' => 'SAME_ACTION',
            'entity_type' => 'research_document',
            'entity_id' => '2',
            'description' => 'Later id',
        ]);
        $earlier = AuditLog::query()->create([
            'user_id' => $actor->id,
            'action' => 'SAME_ACTION',
            'entity_type' => 'research_document',
            'entity_id' => '1',
            'description' => 'Earlier id',
        ]);

        $response = $this->as($actor)->getJson('/api/user-logs?sort=action&direction=asc');

        $response->assertOk();
        $this->assertSame([$later->id, $earlier->id], $response->json('data.*.id'));
    }

    public function test_librarian_catalog_sorts_by_category_name(): void
    {
        $librarian = $this->user(['role' => 'librarian']);
        $zulu = Category::query()->create(['name' => 'Zulu', 'slug' => 'zulu']);
        $alpha = Category::query()->create(['name' => 'Alpha', 'slug' => 'alpha']);
        $this->document(['title' => 'Zulu study', 'category_id' => $zulu->id]);
        $this->document(['title' => 'Alpha study', 'category_id' => $alpha->id]);

        $response = $this->as($librarian)->getJson('/api/librarian/catalog?sort=category&direction=asc');

        $response->assertOk();
        $this->assertSame(['Alpha study', 'Zulu study'], $response->json('data.data.*.title'));
    }

    public function test_office_users_sort_by_last_name(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $this->user(['email' => 'office-zulu@example.edu', 'last_name' => 'Zulu']);
        $this->user(['email' => 'office-alpha@example.edu', 'last_name' => 'Alpha']);

        $response = $this->as($office)->getJson('/api/office/users?search=office-&sort=last_name');

        $response->assertOk();
        $this->assertSame(['Alpha', 'Zulu'], $response->json('data.data.*.last_name'));
    }

    public function test_research_sort_honors_validated_per_page_for_related_studies(): void
    {
        $researcher = $this->user(['role' => 'researcher']);
        $zulu = $this->document(['submitted_by' => $researcher->id, 'title' => 'Zulu study']);
        $alpha = $this->document(['submitted_by' => $researcher->id, 'title' => 'Alpha study']);
        $this->assignResearcherToDocument($researcher, $zulu);
        $this->assignResearcherToDocument($researcher, $alpha);

        $response = $this->as($researcher)->getJson('/api/research?mine=1&sort=title&per_page=1');

        $response->assertOk()
            ->assertJsonPath('meta.per_page', 1)
            ->assertJsonPath('data.0.title', 'Alpha study')
            ->assertJsonStructure(['data' => [['updated_at']]]);
        $this->assertStringContainsString('mine=1', $response->json('links.next'));
        $this->assertStringContainsString('sort=title', $response->json('links.next'));
        $this->assertStringContainsString('per_page=1', $response->json('links.next'));
    }

    public function test_sorting_parameters_reject_unsupported_fields_and_directions(): void
    {
        $admin = $this->user(['role' => 'admin']);
        $instructor = $this->user(['role' => 'instructor']);
        $librarian = $this->user(['role' => 'librarian']);
        $office = $this->user(['role' => 'research-office']);
        $researcher = $this->user(['role' => 'researcher']);

        $this->as($admin)->getJson('/api/admin/audit-logs?sort=description')->assertUnprocessable()->assertJsonValidationErrors('sort');
        $this->as($instructor)->getJson('/api/user-logs?sort=description')->assertUnprocessable()->assertJsonValidationErrors('sort');
        $this->as($librarian)->getJson('/api/librarian/catalog?sort=description')->assertUnprocessable()->assertJsonValidationErrors('sort');
        $this->as($office)->getJson('/api/office/users?direction=sideways')->assertUnprocessable()->assertJsonValidationErrors('direction');
        $this->as($researcher)->getJson('/api/research?sort=description')->assertUnprocessable()->assertJsonValidationErrors('sort');
        $this->as($researcher)->getJson('/api/research?per_page=101')->assertUnprocessable()->assertJsonValidationErrors('per_page');
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

    /** @param array<string, mixed> $attributes */
    private function document(array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create(array_merge([
            'submission_status' => 'approved',
            'archive_status' => 'archived',
            'visibility' => 'public',
        ], $attributes));
    }

    private function as(User $user): static
    {
        return $this->withSession(['user_id' => $user->id]);
    }
}
