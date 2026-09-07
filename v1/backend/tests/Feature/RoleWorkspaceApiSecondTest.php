<?php

namespace Tests\Feature;

use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\SavedLibraryItem;
use App\Models\SimilarityResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class RoleWorkspaceApiSecondTest extends TestCase
{
    use RefreshDatabase;

    public function test_librarian_archiving_queue_metadata_and_retention_logs(): void
    {
        $librarian = $this->user(['role' => 'librarian']);
        $owner = $this->user(['role' => 'researcher']);
        $approved = $this->document('approved', $owner);
        ResearchAuthor::query()->create(['research_document_id' => $approved->id, 'author_name' => 'Filjoy Santos', 'author_order' => 1]);
        $this->document('draft', $owner);

        $this->as($librarian)->getJson('/api/librarian/archiving-queue')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.metadata_completeness.title', true)
            ->assertJsonPath('data.0.metadata_completeness.authors', true);
        $this->as($librarian)->getJson('/api/librarian/catalog')->assertOk();
        $this->as($librarian)->getJson('/api/librarian/metadata-standards')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->as($librarian)->putJson('/api/librarian/metadata/'.$approved->id, [
            'title_complete' => true, 'abstract_complete' => true, 'authors_complete' => true,
            'keywords_complete' => false, 'category_complete' => true, 'review_status' => 'complete',
        ], $this->origin())->assertOk()->assertJsonPath('data.review_status', 'complete');
        $this->assertDatabaseHas('audit_logs', ['action' => 'METADATA_REVIEWED']);

        $this->as($librarian)->postJson('/api/librarian/retention-logs', [
            'research_document_id' => $approved->id,
            'action' => 'final_archived',
            'remarks' => 'Final manuscript retained.',
        ], $this->origin())->assertCreated();
        $this->assertDatabaseHas('audit_logs', ['action' => 'RETENTION_LOGGED']);
        $this->as($librarian)->postJson('/api/librarian/retention-logs', ['action' => 'not-a-real-action'], $this->origin())
            ->assertUnprocessable();
        $this->as($librarian)->getJson('/api/librarian/retention-logs')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_office_compliance_user_management_reports_and_privacy_logs(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $owner = $this->user(['role' => 'researcher']);
        $approved = $this->document('approved', $owner, 'pending_archiving');
        $this->document('draft', $owner);

        $this->as($office)->getJson('/api/office/compliance')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.submission_status', 'approved');
        $this->as($office)->putJson('/api/office/compliance/'.$approved->id, [
            'format_compliant' => true, 'attachments_compliant' => true, 'consent_forms_compliant' => true,
            'review_status' => 'endorsed',
        ], $this->origin())->assertOk()->assertJsonPath('data.review_status', 'endorsed');
        $this->as($office)->putJson('/api/office/compliance/'.$approved->id, ['review_status' => 'pending'], $this->origin())
            ->assertUnprocessable();

        $this->as($office)->getJson('/api/office/users')->assertOk()->assertJsonCount(2, 'data.data');
        $this->as($office)->patchJson('/api/office/users/'.$owner->id, ['access_status' => 'blocked'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.access_status', 'blocked');
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $this->as($office)->patchJson('/api/office/users/'.$admin->id, ['access_status' => 'blocked'], $this->origin())
            ->assertConflict()
            ->assertExactJson(['error' => 'ACCOUNT_MUTATION_NOT_ALLOWED']);

        $this->as($office)->getJson('/api/office/reports')
            ->assertOk()
            ->assertJsonPath('data.counts.total_users', 3)
            ->assertJsonPath('data.counts.pending_archiving', 1);

        $this->as($office)->postJson('/api/office/privacy-logs', [
            'user_id' => $owner->id, 'action' => 'consent_recorded', 'details' => 'Consent form received.',
        ], $this->origin())->assertCreated();
        $this->assertDatabaseHas('audit_logs', ['action' => 'PRIVACY_LOGGED']);
        $this->as($office)->postJson('/api/office/privacy-logs', ['action' => 'bad-action'], $this->origin())
            ->assertUnprocessable();
        $this->as($office)->getJson('/api/office/privacy-logs')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_academics_library_categories_and_recommendations(): void
    {
        $academic = $this->user(['role' => 'academics']);
        $owner = $this->user(['role' => 'researcher']);
        $archived = $this->document('archived', $owner, 'archived');
        $this->document('archived', $owner, 'archived');
        $draft = $this->document('draft', $owner);

        $this->as($academic)->getJson('/api/academics/library')->assertOk()->assertJsonCount(0, 'data');
        $this->as($academic)->postJson('/api/academics/library', ['research_document_id' => $archived->id], $this->origin())
            ->assertCreated()
            ->assertJsonPath('data.title', $archived->title);
        $this->as($academic)->postJson('/api/academics/library', ['research_document_id' => $draft->id], $this->origin())
            ->assertUnprocessable();
        $item = SavedLibraryItem::query()->firstOrFail();
        $this->as($academic)->getJson('/api/academics/library')->assertOk()->assertJsonCount(1, 'data');
        $this->as($academic)->getJson('/api/academics/categories')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.records_count', 2);

        $this->as($academic)->deleteJson('/api/academics/library/'.$item->id, [], $this->origin())->assertNoContent();
        $this->assertDatabaseCount('saved_library_items', 0);
        $this->as($academic)->getJson('/api/academics/recommendations')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_academics_recommendations_are_similarity_based_and_exclude_saved(): void
    {
        $academic = $this->user(['role' => 'academics']);
        $owner = $this->user(['role' => 'researcher']);
        $saved = $this->document('archived', $owner, 'archived');
        $candidate = $this->document('archived', $owner, 'archived');
        SimilarityResult::query()->create([
            'source_research_id' => $saved->id,
            'matched_research_id' => $candidate->id,
            'source_title' => $saved->title,
            'matched_title' => $candidate->title,
            'title_similarity_score' => '0.610000000000',
            'content_similarity_score' => '0.610000000000',
            'algorithm_version' => 'title-content-weighted-v1',
            'analysis_type' => 'search_retrieval',
            'analyzed_at' => now(),
        ]);
        SavedLibraryItem::query()->create(['user_id' => $academic->id, 'research_document_id' => $saved->id]);

        $this->as($academic)->getJson('/api/academics/recommendations')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $candidate->id)
            ->assertJsonPath('data.0.overall_similarity_score', '0.610000000000')
            ->assertJsonPath('data.0.adviser_review_required', false);
    }

    public function test_reviewer_assignments_accept_panel_and_statistician_roles(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $panelist = $this->user(['role' => 'panel']);
        $statistician = $this->user(['role' => 'statistician']);
        $document = $this->document('submitted');

        $this->as($office)->putJson('/api/research/'.$document->id.'/reviewers', [
            'reviewers' => [
                ['reviewer_id' => $panelist->id, 'review_role' => 'panel'],
                ['reviewer_id' => $statistician->id, 'review_role' => 'statistician'],
            ],
        ], $this->origin())->assertOk();

        $this->assertDatabaseHas('research_review_assignments', ['research_document_id' => $document->id, 'reviewer_id' => $panelist->id, 'review_role' => 'panel', 'is_active' => true]);
        $this->assertDatabaseHas('research_review_assignments', ['research_document_id' => $document->id, 'reviewer_id' => $statistician->id, 'review_role' => 'statistician', 'is_active' => true]);

        $coordinator = $this->user(['role' => 'coordinator']);
        $this->as($coordinator)->putJson('/api/research/'.$document->id.'/reviewers', [
            'reviewers' => [['reviewer_id' => $panelist->id, 'review_role' => 'panel']],
        ], $this->origin())->assertForbidden();

        $researcher = $this->user(['role' => 'researcher']);
        $this->as($researcher)->putJson('/api/research/'.$document->id.'/reviewers', [
            'reviewers' => [['reviewer_id' => $panelist->id, 'review_role' => 'panel']],
        ], $this->origin())->assertForbidden();
    }

    public function test_research_index_mine_filter_returns_only_own_submissions(): void
    {
        $researcher = $this->user(['role' => 'researcher']);
        $other = $this->user(['role' => 'researcher']);
        $own = $this->document('draft', $researcher);
        $this->document('draft', $other);

        $response = $this->as($researcher)->getJson('/api/research?mine=1');
        $response->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $own->id);
    }

    private function document(string $status, ?User $owner = null, string $archive = 'not_archived'): ResearchDocument
    {
        return ResearchDocument::factory()->create([
            'submitted_by' => $owner?->id ?? $this->user()->id,
            'submission_status' => $status,
            'archive_status' => $archive,
            'visibility' => $status === 'archived' ? 'public' : 'private',
        ]);
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
