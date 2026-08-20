<?php

namespace Tests\Feature;

use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The pre-submission duplicate check scores a typed title or keywords from the
 * search bar. It must not require an existing research record and must not
 * write anything.
 */
class SimilarityQueryTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('researchnav.similarity.python_binary', PHP_BINARY);
        config()->set('researchnav.similarity.cli_path', base_path('tests/Fixtures/similarity_worker.php'));
    }

    public function test_it_requires_an_authenticated_active_account(): void
    {
        $this->postJson('/api/similarity/query', ['q' => 'inventory system'], $this->origin())
            ->assertUnauthorized()
            ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);

        $blocked = User::factory()->create(['role' => 'researcher', 'access_status' => 'blocked']);
        $this->as($blocked)
            ->postJson('/api/similarity/query', ['q' => 'inventory system'], $this->origin())
            ->assertForbidden()
            ->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);
    }

    public function test_it_scores_a_typed_query_without_any_research_record(): void
    {
        $archived = $this->archived('INVENTORY MANAGEMENT SYSTEM FOR SMALL BUSINESS');
        $researcher = $this->researcher();

        $this->assertSame(0, ResearchDocument::query()->where('submitted_by', $researcher->id)->count());

        $response = $this->as($researcher)
            ->postJson('/api/similarity/query', ['q' => 'inventory management system'], $this->origin())
            ->assertOk();

        $response->assertJsonPath('data.0.id', $archived->id);
        $response->assertJsonPath('data.0.query_similarity_score', '0.000000');
        $response->assertJsonPath('data.0.query_similarity_percentage', '0.000000');
        $response->assertJsonPath('data.0.fasttext_support_score', null);
        $this->assertNotNull($response->json('data.0.title'));
    }

    public function test_it_never_writes_a_similarity_result_audit_entry_or_notification(): void
    {
        $this->archived('INVENTORY MANAGEMENT SYSTEM FOR SMALL BUSINESS');
        $researcher = $this->researcher();

        $this->as($researcher)
            ->postJson('/api/similarity/query', ['q' => 'inventory management system'], $this->origin())
            ->assertOk();

        $this->assertDatabaseCount('similarity_results', 0);
        $this->assertDatabaseCount('notifications', 0);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'SIMILARITY_CHECK_COMPLETED']);
    }

    public function test_it_rejects_a_missing_short_or_overlong_query(): void
    {
        $researcher = $this->researcher();

        foreach ([[], ['q' => 'a'], ['q' => str_repeat('x', 201)]] as $payload) {
            $this->as($researcher)
                ->postJson('/api/similarity/query', $payload, $this->origin())
                ->assertStatus(422);
        }
    }

    public function test_it_rejects_extra_body_keys(): void
    {
        $this->as($this->researcher())
            ->postJson('/api/similarity/query', ['q' => 'inventory', 'extra' => 1], $this->origin())
            ->assertStatus(422);
    }

    public function test_it_requires_an_allowed_origin(): void
    {
        $this->as($this->researcher())
            ->postJson('/api/similarity/query', ['q' => 'inventory management system'])
            ->assertForbidden()
            ->assertExactJson(['error' => 'ORIGIN_NOT_ALLOWED']);
    }

    public function test_every_role_with_an_active_account_may_check_a_proposed_title(): void
    {
        $this->archived('INVENTORY MANAGEMENT SYSTEM FOR SMALL BUSINESS');

        foreach (['researcher', 'adviser', 'instructor', 'coordinator', 'librarian', 'research-office', 'academics'] as $role) {
            $user = User::factory()->create(['role' => $role, 'access_status' => 'active']);
            $this->as($user)
                ->postJson('/api/similarity/query', ['q' => 'inventory management system'], $this->origin())
                ->assertOk();
        }
    }

    public function test_it_reports_an_unavailable_worker_without_pretending_to_score(): void
    {
        $this->archived('INVENTORY MANAGEMENT SYSTEM FOR SMALL BUSINESS');
        config()->set('researchnav.similarity.cli_path', base_path('tests/Fixtures/does_not_exist.php'));

        $this->as($this->researcher())
            ->postJson('/api/similarity/query', ['q' => 'inventory management system'], $this->origin())
            ->assertStatus(502)
            ->assertExactJson(['error' => 'SIMILARITY_PROCESS_FAILED']);

        $this->assertDatabaseCount('similarity_results', 0);
    }

    private function archived(string $title): ResearchDocument
    {
        return ResearchDocument::factory()->create([
            'title' => $title,
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
        ]);
    }

    private function researcher(): User
    {
        return User::factory()->create(['role' => 'researcher', 'access_status' => 'active']);
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
