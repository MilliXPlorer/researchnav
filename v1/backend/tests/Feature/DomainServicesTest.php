<?php

namespace Tests\Feature;

use App\Http\Resources\DocumentFileResource;
use App\Models\Category;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Services\DocumentService;
use App\Services\FeedbackService;
use App\Services\PublicRepositoryService;
use App\Services\ResearchService;
use App\Services\RevisionService;
use App\Services\SimilarityService;
use App\Services\TitleValidationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class DomainServicesTest extends TestCase
{
    use RefreshDatabase;

    public function test_draft_creation_orders_historical_authors_and_records_audit_and_monitoring(): void
    {
        $actor = User::factory()->create();
        $category = $this->category();
        $research = app(ResearchService::class)->createDraft($actor, $this->metadata($category), [
            ['user_id' => $actor->id, 'author_name' => 'Current Author', 'is_corresponding_author' => true],
            ['author_name' => 'Historical Author'],
        ]);

        $this->assertSame('draft', $research->submission_status);
        $this->assertDatabaseHas('research_authors', ['research_document_id' => $research->id, 'author_name' => 'Historical Author', 'author_order' => 2]);
        $this->assertDatabaseHas('monitoring_logs', ['research_document_id' => $research->id, 'activity_type' => 'RESEARCH_CREATED']);
        $this->assertDatabaseHas('audit_logs', ['entity_id' => (string) $research->id, 'action' => 'RESEARCH_CREATED']);
    }

    public function test_draft_transaction_rolls_back_when_author_insert_fails(): void
    {
        $actor = User::factory()->create();
        $category = $this->category();
        try {
            app(ResearchService::class)->createDraft($actor, $this->metadata($category), [['author_name' => 'Duplicate'], ['author_name' => 'Duplicate']]);
            $this->fail('Expected unique-author insert failure.');
        } catch (\Throwable) {
            $this->assertDatabaseCount('research_documents', 0);
            $this->assertDatabaseCount('research_authors', 0);
        }
    }

    public function test_generic_transition_matrix_excludes_owner_submission_and_revision_workflow_bypasses(): void
    {
        [$actor, $research] = $this->research();
        $service = app(ResearchService::class);
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assignReviewer($research, $reviewer);

        try {
            $service->transition($reviewer, $research, 'submitted');
            $this->fail('The generic transition must not submit drafts.');
        } catch (ValidationException) {
            $this->assertSame('draft', $research->refresh()->submission_status);
        }
        $service->submit($actor, $research);
        $this->assertSame('submitted', $research->refresh()->submission_status);
        $service->transition($reviewer, $research, 'under_review');
        $this->assertSame('under_review', $research->refresh()->submission_status);
        try {
            $service->transition($reviewer, $research, 'revision_required');
            $this->fail('The generic transition must not request revisions.');
        } catch (ValidationException) {
            $this->assertSame('under_review', $research->refresh()->submission_status);
        }

        $revision = app(RevisionService::class)->request($reviewer, $research, ['revision_remarks' => 'Revise methodology.']);
        $this->assertSame('revision_required', $research->refresh()->submission_status);
        try {
            $service->submit($actor, $research);
            $this->fail('Only drafts may use the owner submission endpoint.');
        } catch (ValidationException) {
            $this->assertSame('revision_required', $research->refresh()->submission_status);
        }
        app(RevisionService::class)->resubmit($actor, $revision);
        $this->assertSame('under_review', $research->refresh()->submission_status);
        $service->transition($reviewer, $research, 'approved');
        $this->assertSame('approved', $research->refresh()->submission_status);
    }

    public function test_private_document_upload_versions_metadata_and_hides_the_storage_path(): void
    {
        Storage::fake('researchnav_private');
        [$actor, $research] = $this->research();
        $service = app(DocumentService::class);
        $first = $service->upload($actor, $research, UploadedFile::fake()->createWithContent('draft.pdf', '%PDF test'), 'draft');
        $second = $service->upload($actor, $research, UploadedFile::fake()->createWithContent('draft2.pdf', '%PDF test'), 'draft');

        $this->assertFalse($first->refresh()->is_current);
        $this->assertSame(2, $second->version_number);
        Storage::disk('researchnav_private')->assertExists($second->file_path);
        $payload = (new DocumentFileResource($second))->resolve();
        $this->assertArrayNotHasKey('file_path', $payload);
        $this->assertArrayNotHasKey('stored_filename', $payload);
        $this->assertArrayNotHasKey('uploaded_by', $payload);
    }

    public function test_mock_storage_rule_scores_flag_at_point_seven_but_do_not_change_submission_status(): void
    {
        [$actor, $source] = $this->research();
        [, $matched] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $service = app(SimilarityService::class);
        // Mock storage-rule values only; no algorithm is being exercised.
        $flagged = $service->storeResult($reviewer, $source, ['matched_research_id' => $matched->id, 'final_similarity_score' => .70, 'analysis_type' => 'title']);
        $notFlagged = $service->storeResult($reviewer, $source, ['matched_research_id' => $matched->id, 'final_similarity_score' => .6999, 'analysis_type' => 'title']);
        $this->assertTrue($flagged->is_flagged);
        $this->assertFalse($notFlagged->is_flagged);
        $this->assertSame('draft', $source->refresh()->submission_status);
        $this->expectException(ValidationException::class);
        $service->storeResult($reviewer, $source, ['matched_research_id' => $source->id, 'final_similarity_score' => .75, 'analysis_type' => 'title']);
    }

    public function test_feedback_revision_and_human_validation_keep_separate_history_rows(): void
    {
        [$actor, $research] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assignReviewer($research, $reviewer);
        $feedback = app(FeedbackService::class)->create($reviewer, $research, ['comment' => 'Please clarify.', 'feedback_type' => 'suggestion']);
        app(FeedbackService::class)->setStatus($reviewer, $feedback, 'acknowledged');
        app(ResearchService::class)->submit($actor, $research);
        app(ResearchService::class)->transition($reviewer, $research, 'under_review');
        $revision = app(RevisionService::class)->request($reviewer, $research, ['revision_remarks' => 'Revise methodology.']);
        app(RevisionService::class)->resubmit($actor, $revision);
        $validation = app(TitleValidationService::class)->createPending($reviewer, $research, ['validated_by' => $reviewer->id]);
        app(TitleValidationService::class)->record($reviewer, $validation, ['validation_status' => 'revision_required', 'adviser_remarks' => 'Use a narrower title.']);

        $this->assertDatabaseHas('feedback_comments', ['id' => $feedback->id, 'feedback_status' => 'acknowledged']);
        $this->assertDatabaseHas('revisions', ['id' => $revision->id, 'revision_number' => 1, 'revision_status' => 'resubmitted']);
        $this->assertDatabaseHas('title_validations', ['id' => $validation->id, 'validation_status' => 'revision_required']);
        $this->assertDatabaseCount('notifications', 6);
    }

    public function test_locked_services_reject_revoked_reviewer_and_stale_status_bypasses(): void
    {
        Storage::fake('researchnav_private');
        [$owner, $research] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $assignment = $this->assignReviewer($research, $reviewer);
        app(ResearchService::class)->submit($owner, $research);
        app(ResearchService::class)->transition($reviewer, $research, 'under_review');

        $assignment->update(['is_active' => false]);
        try {
            app(RevisionService::class)->request($reviewer, $research, ['revision_remarks' => 'Revise it.']);
            $this->fail('A revoked reviewer must not request a revision through the service.');
        } catch (ValidationException) {
            $this->assertSame('under_review', $research->refresh()->submission_status);
        }

        $stale = $research->fresh();
        $research->update(['submission_status' => 'approved']);
        try {
            app(DocumentService::class)->upload($owner, $stale, UploadedFile::fake()->createWithContent('stale.pdf', '%PDF test'), 'draft');
            $this->fail('A stale model must not bypass the locked upload status check.');
        } catch (ValidationException) {
            $this->assertDatabaseCount('document_files', 0);
        }
    }

    public function test_title_validation_cannot_be_recorded_by_another_assigned_reviewer(): void
    {
        [$owner, $research] = $this->research();
        $firstReviewer = User::factory()->create(['role' => 'adviser']);
        $secondReviewer = User::factory()->create(['role' => 'instructor']);
        $firstAssignment = $this->assignReviewer($research, $firstReviewer, 'adviser');
        $this->assignReviewer($research, $secondReviewer, 'instructor');
        $service = app(TitleValidationService::class);
        $validation = $service->createPending($firstReviewer, $research, ['validated_by' => $firstReviewer->id]);

        try {
            $service->record($secondReviewer, $validation, ['validation_status' => 'approved']);
            $this->fail('A different assigned reviewer must not record this decision.');
        } catch (ValidationException) {
            $this->assertSame('pending', $validation->refresh()->validation_status);
        }

        $firstAssignment->update(['is_active' => false]);
        $this->expectException(ValidationException::class);
        $service->record($firstReviewer, $validation, ['validation_status' => 'approved']);
    }

    public function test_only_owner_or_office_can_upload_in_their_allowed_workflow_states(): void
    {
        Storage::fake('researchnav_private');
        [$owner, $research] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assignReviewer($research, $reviewer);
        $service = app(DocumentService::class);

        try {
            $service->upload($reviewer, $research, UploadedFile::fake()->createWithContent('review.pdf', '%PDF test'), 'draft');
            $this->fail('Assigned reviewers must not upload manuscript versions.');
        } catch (ValidationException) {
            $this->assertDatabaseCount('document_files', 0);
        }

        $office = User::factory()->create(['role' => 'research-office']);
        $research->update(['submission_status' => 'approved']);
        $final = $service->upload($office, $research, UploadedFile::fake()->createWithContent('final.pdf', '%PDF test'), 'final_manuscript');
        $this->assertSame($office->id, $final->uploaded_by);
        try {
            $service->upload($office, $research, UploadedFile::fake()->createWithContent('draft.pdf', '%PDF test'), 'draft');
            $this->fail('Office upload types are restricted after approval.');
        } catch (ValidationException) {
            $this->assertDatabaseCount('document_files', 1);
        }

        $research->update(['submission_status' => 'archived', 'archive_status' => 'archived']);
        $this->expectException(ValidationException::class);
        $service->upload($office, $research, UploadedFile::fake()->createWithContent('attachment.pdf', '%PDF test'), 'attachment');
    }

    public function test_public_repository_only_exposes_archived_public_research_and_filters(): void
    {
        [$actor, $public] = $this->research(['title' => 'Public Climate Study', 'keywords' => 'climate, water', 'publication_year' => 2025]);
        $public->update(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $public->authors()->firstOrFail()->update(['author_name' => 'Second Author', 'author_order' => 2]);
        ResearchAuthor::query()->create([
            'research_document_id' => $public->id,
            'author_name' => 'First Author',
            'author_order' => 1,
            'is_corresponding_author' => false,
        ]);
        [, $private] = $this->research(['title' => 'Private Climate Study']);
        $private->update(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'private']);
        $results = app(PublicRepositoryService::class)->search(['q' => 'Climate', 'publication_year' => 2025]);
        $this->assertCount(1, $results);
        $this->assertSame($public->id, $results->first()->id);
        $filtered = app(PublicRepositoryService::class)->search([
            'author' => $public->authors()->firstOrFail()->author_name,
            'keywords' => 'water',
            'category' => $public->category->slug,
            'year' => 2025,
        ]);
        $this->assertSame([$public->id], $filtered->pluck('id')->all());
        $detail = $this->getJson('/api/repository/'.$public->id)
            ->assertOk()
            ->assertCookieMissing('researchnav.sid')
            ->assertJsonPath('data.authors', [
                ['author_name' => 'First Author', 'author_order' => 1, 'is_corresponding_author' => false],
                ['author_name' => 'Second Author', 'author_order' => 2, 'is_corresponding_author' => false],
            ]);
        $this->assertArrayNotHasKey('submitted_by', $detail->json('data'));
        $this->assertArrayNotHasKey('submission_status', $detail->json('data'));
        $this->getJson('/api/repository/'.$private->id)->assertNotFound()->assertJsonPath('error', 'NOT_FOUND')->assertCookieMissing('researchnav.sid');
        $this->postJson('/api/research/'.$public->id.'/similarity/check', [], ['Origin' => 'http://localhost:5173'])->assertUnauthorized();
    }

    public function test_algorithm_endpoint_is_an_explicit_authenticated_501_without_fake_scores(): void
    {
        [$actor, $research] = $this->research();

        $this->withSession(['user_id' => $actor->id])
            ->postJson('/api/research/'.$research->id.'/similarity/check', [], ['Origin' => 'http://localhost:5173'])
            ->assertStatus(501)
            ->assertExactJson(['error' => 'ALGORITHM_NOT_IMPLEMENTED']);
        $this->assertDatabaseCount('similarity_results', 0);
    }

    /** @return array{User, ResearchDocument} */
    private function research(array $overrides = []): array
    {
        $actor = User::factory()->create();
        $research = app(ResearchService::class)->createDraft($actor, array_merge($this->metadata($this->category()), $overrides), [['user_id' => $actor->id, 'author_name' => 'Author '.$actor->id]]);

        return [$actor, $research];
    }

    private function metadata(Category $category): array
    {
        return ['category_id' => $category->id, 'title' => 'Research '.fake()->unique()->word(), 'abstract' => 'An abstract.', 'keywords' => 'research', 'publication_year' => 2025, 'research_stage' => 'title_proposal'];
    }

    private function category(): Category
    {
        return Category::query()->create(['name' => 'Category '.fake()->unique()->word(), 'slug' => 'category-'.fake()->unique()->numberBetween(1000, 999999)]);
    }

    private function assignReviewer(ResearchDocument $research, User $reviewer, string $role = 'adviser'): ReviewAssignment
    {
        return ReviewAssignment::query()->create([
            'research_document_id' => $research->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => User::factory()->create(['role' => 'research-office'])->id,
            'review_role' => $role,
            'is_active' => true,
        ]);
    }
}
