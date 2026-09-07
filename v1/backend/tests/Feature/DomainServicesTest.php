<?php

namespace Tests\Feature;

use App\Http\Resources\DocumentFileResource;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\DocumentFile;
use App\Models\MonitoringLog;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\Revision;
use App\Models\TitleValidation;
use App\Models\User;
use App\Services\DocumentService;
use App\Services\FeedbackService;
use App\Services\PublicRepositoryService;
use App\Services\ResearchService;
use App\Services\ReviewAssignmentService;
use App\Services\RevisionService;
use App\Services\SimilarityService;
use App\Services\TitleValidationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
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
        $this->uploadCurrentRevisionManuscript($research, $actor, $revision);
        app(RevisionService::class)->resubmit($actor, $revision);
        $this->assertSame('under_review', $research->refresh()->submission_status);
        try {
            $service->transition($reviewer, $research, 'approved');
            $this->fail('Assigned reviewers must not grant final approval.');
        } catch (ValidationException) {
            $this->assertSame('under_review', $research->refresh()->submission_status);
        }
        $office = User::factory()->create(['role' => 'research-office']);
        $service->transition($office, $research, 'approved');
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

    public function test_weighted_component_scores_flag_at_point_seven_but_do_not_change_submission_status(): void
    {
        [$actor, $source] = $this->research();
        [, $matched] = $this->research();
        $matched->update(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assignReviewer($source, $reviewer);
        $service = app(SimilarityService::class);
        $flagged = $service->storeResult($reviewer, $source, ['matched_research_id' => $matched->id, 'title_similarity_score' => '0.700000000000', 'content_similarity_score' => '0.700000000000', 'analysis_type' => 'title']);
        $notFlagged = $service->storeResult($reviewer, $source, ['matched_research_id' => $matched->id, 'title_similarity_score' => '0.699900000000', 'content_similarity_score' => '0.699900000000', 'analysis_type' => 'title']);
        $this->assertTrue($flagged->overall_flagged);
        $this->assertFalse($notFlagged->overall_flagged);
        $this->assertSame('0.700000', $flagged->threshold);
        $this->assertSame('0.700000', $notFlagged->threshold);
        $this->assertSame('draft', $source->refresh()->submission_status);
        $this->expectException(ValidationException::class);
        $service->storeResult($reviewer, $source, ['matched_research_id' => $source->id, 'title_similarity_score' => '0.750000000000', 'content_similarity_score' => '0.750000000000', 'analysis_type' => 'title']);
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
        $this->uploadCurrentRevisionManuscript($research, $actor, $revision);
        app(RevisionService::class)->resubmit($actor, $revision);
        $validation = app(TitleValidationService::class)->recommend($reviewer, $research, ['validation_status' => 'revision_required', 'adviser_remarks' => 'Use a narrower title.']);

        $this->assertDatabaseHas('feedback_comments', ['id' => $feedback->id, 'feedback_status' => 'acknowledged']);
        $this->assertDatabaseHas('revisions', ['id' => $revision->id, 'revision_number' => 1, 'revision_status' => 'resubmitted']);
        $this->assertDatabaseHas('title_validations', ['id' => $validation->id, 'validation_status' => 'revision_required']);
        $this->assertDatabaseCount('notifications', 7);
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

    public function test_title_recommendations_require_a_current_matching_assignment(): void
    {
        [$owner, $research] = $this->research();
        $firstReviewer = User::factory()->create(['role' => 'adviser']);
        $secondReviewer = User::factory()->create(['role' => 'instructor']);
        $firstAssignment = $this->assignReviewer($research, $firstReviewer, 'adviser');
        $this->assignReviewer($research, $secondReviewer, 'instructor');
        $service = app(TitleValidationService::class);
        app(ResearchService::class)->submit($owner, $research);
        $validation = $service->recommend($firstReviewer, $research, ['validation_status' => 'approved']);
        $this->assertSame('approved', $validation->validation_status);
        $this->assertSame('revision_required', $service->recommend($secondReviewer, $research, [
            'validation_status' => 'revision_required',
            'adviser_remarks' => 'Narrow the title.',
        ])->validation_status);

        $firstAssignment->update(['is_active' => false]);
        $this->expectException(ValidationException::class);
        $service->recommend($firstReviewer, $research, ['validation_status' => 'approved']);
    }

    public function test_title_validation_uses_its_locked_parent_not_a_stale_callers_parent_relation(): void
    {
        [, $realParent] = $this->research();
        [, $staleParent] = $this->research();
        $realReviewer = User::factory()->create(['role' => 'adviser']);
        $staleReviewer = User::factory()->create(['role' => 'adviser']);
        $this->assignReviewer($realParent, $realReviewer);
        $this->assignReviewer($staleParent, $staleReviewer);
        $validation = TitleValidation::query()->create([
            'research_document_id' => $realParent->id,
            'validated_by' => $realReviewer->id,
            'validation_status' => 'pending',
        ]);
        $staleValidation = $validation->replicate();
        $staleValidation->id = $validation->id;
        $staleValidation->exists = true;
        $staleValidation->research_document_id = $staleParent->id;
        $auditLogs = AuditLog::query()->count();
        $monitoringLogs = MonitoringLog::query()->count();

        try {
            app(TitleValidationService::class)->record($staleReviewer, $staleValidation, ['validation_status' => 'approved']);
            $this->fail('A stale parent relation must not authorize title validation.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('authorization', $exception->errors());
        }

        $this->assertDatabaseHas('title_validations', ['id' => $validation->id, 'research_document_id' => $realParent->id, 'validation_status' => 'pending']);
        $this->assertDatabaseCount('audit_logs', $auditLogs);
        $this->assertDatabaseCount('monitoring_logs', $monitoringLogs);
    }

    public function test_revision_resubmit_uses_its_current_database_parent_not_a_stale_callers_parent_relation(): void
    {
        [$owner, $research] = $this->research();
        [, $staleParent] = $this->research();
        $research->update(['submission_status' => 'revision_required']);
        $revision = Revision::query()->create([
            'research_document_id' => $research->id,
            'requested_by' => $owner->id,
            'revision_number' => 1,
            'revision_remarks' => 'Please revise.',
            'revision_status' => 'requested',
            'requested_at' => now(),
        ]);
        $staleRevision = $revision->replicate();
        $staleRevision->id = $revision->id;
        $staleRevision->exists = true;
        $staleRevision->research_document_id = $staleParent->id;

        $this->uploadCurrentRevisionManuscript($research, $owner, $revision);
        app(RevisionService::class)->resubmit($owner, $staleRevision);

        $this->assertDatabaseHas('revisions', ['id' => $revision->id, 'research_document_id' => $research->id, 'revision_status' => 'resubmitted']);
        $this->assertDatabaseHas('research_documents', ['id' => $research->id, 'submission_status' => 'under_review']);
        $this->assertDatabaseHas('research_documents', ['id' => $staleParent->id, 'submission_status' => 'draft']);
    }

    public function test_revision_resubmit_revalidates_its_parent_after_locking_the_revision(): void
    {
        [$owner, $research] = $this->research();
        [, $newParent] = $this->research();
        $research->update(['submission_status' => 'revision_required']);
        $revision = Revision::query()->create([
            'research_document_id' => $research->id,
            'requested_by' => $owner->id,
            'revision_number' => 1,
            'revision_remarks' => 'Please revise.',
            'revision_status' => 'requested',
            'requested_at' => now(),
        ]);
        $auditLogs = AuditLog::query()->count();
        $monitoringLogs = MonitoringLog::query()->count();
        $originalDispatcher = Revision::getEventDispatcher();
        $dispatcher = clone $originalDispatcher;
        $moved = false;
        Revision::setEventDispatcher($dispatcher);
        Revision::retrieved(function (Revision $loaded) use (&$moved, $revision, $newParent): void {
            if (! $moved && (string) $loaded->research_document_id === (string) $revision->research_document_id) {
                $moved = true;
                Revision::query()->whereKey($revision->id)->update(['research_document_id' => $newParent->id]);
            }
        });

        try {
            app(RevisionService::class)->resubmit($owner, $revision);
            $this->fail('A revision moved after its parent is read must be rejected.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('revision_status', $exception->errors());
            $this->assertSame(['The revision no longer belongs to this research.'], $exception->errors()['revision_status']);
        } finally {
            Revision::setEventDispatcher($originalDispatcher);
        }

        $this->assertTrue($moved);
        $this->assertDatabaseHas('revisions', ['id' => $revision->id, 'research_document_id' => $research->id, 'revision_status' => 'requested']);
        $this->assertDatabaseHas('research_documents', ['id' => $research->id, 'submission_status' => 'revision_required']);
        $this->assertDatabaseCount('audit_logs', $auditLogs);
        $this->assertDatabaseCount('monitoring_logs', $monitoringLogs);
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

    public function test_archive_rejects_an_already_archived_record_without_side_effects(): void
    {
        $office = User::factory()->create(['role' => 'research-office']);
        [, $research] = $this->research();
        $research->update(['submission_status' => 'approved', 'archive_status' => 'archived']);
        $auditLogs = AuditLog::query()->count();
        $monitoringLogs = MonitoringLog::query()->count();
        $notifications = DB::table('notifications')->count();

        try {
            app(ResearchService::class)->archive($office, $research, 'public');
            $this->fail('Already archived research must not be archived twice.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('archive_status', $exception->errors());
        }

        $this->assertDatabaseHas('research_documents', ['id' => $research->id, 'submission_status' => 'approved', 'archive_status' => 'archived']);
        $this->assertDatabaseCount('audit_logs', $auditLogs);
        $this->assertDatabaseCount('monitoring_logs', $monitoringLogs);
        $this->assertDatabaseCount('notifications', $notifications);
    }

    public function test_revision_and_feedback_reject_a_document_file_from_another_research_inside_the_service_transaction(): void
    {
        Storage::fake('researchnav_private');
        [, $research] = $this->research();
        $research->update(['submission_status' => 'under_review']);
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assignReviewer($research, $reviewer);
        [, $otherResearch] = $this->research();
        $foreignFile = app(DocumentService::class)->upload($otherResearch->submitter, $otherResearch, UploadedFile::fake()->createWithContent('other.pdf', '%PDF test'), 'draft');

        foreach ([
            fn () => app(RevisionService::class)->request($reviewer, $research, ['revision_remarks' => 'Wrong file.', 'document_file_id' => $foreignFile->id]),
            fn () => app(FeedbackService::class)->create($reviewer, $research, ['comment' => 'Wrong file.', 'feedback_type' => 'comment', 'document_file_id' => $foreignFile->id]),
        ] as $call) {
            try {
                $call();
                $this->fail('Cross-research document files must be rejected.');
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('document_file_id', $exception->errors());
            }
        }

        $this->assertSame('under_review', $research->refresh()->submission_status);
        $this->assertDatabaseCount('revisions', 0);
        $this->assertDatabaseCount('feedback_comments', 0);
    }

    public function test_review_assignment_reloads_and_rejects_a_deactivated_reviewer(): void
    {
        $office = User::factory()->create(['role' => 'research-office']);
        [, $research] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        User::query()->whereKey($reviewer->id)->update(['account_status' => 'inactive']);

        try {
            app(ReviewAssignmentService::class)->replace($office, $research, [['reviewer_id' => $reviewer->id, 'review_role' => 'adviser']]);
            $this->fail('Deactivated reviewers must not be assigned.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('reviewers', $exception->errors());
        }

        $this->assertDatabaseCount('research_review_assignments', 0);
    }

    public function test_direct_services_reject_inactive_owners_office_users_and_reviewers(): void
    {
        $inactiveOwner = User::factory()->create(['account_status' => 'inactive']);
        $ownerResearch = ResearchDocument::factory()->create(['submitted_by' => $inactiveOwner->id]);
        $inactiveOffice = User::factory()->create(['role' => 'research-office', 'account_status' => 'inactive']);
        $approvedResearch = ResearchDocument::factory()->create(['submission_status' => 'approved']);
        $inactiveReviewer = User::factory()->create(['role' => 'adviser', 'account_status' => 'inactive']);
        $reviewResearch = ResearchDocument::factory()->create();
        $this->assignReviewer($reviewResearch, $inactiveReviewer);

        foreach ([
            fn () => app(ResearchService::class)->submit($inactiveOwner, $ownerResearch),
            fn () => app(ResearchService::class)->archive($inactiveOffice, $approvedResearch, 'public'),
            fn () => app(FeedbackService::class)->create($inactiveReviewer, $reviewResearch, ['comment' => 'Blocked.', 'feedback_type' => 'comment']),
        ] as $call) {
            try {
                $call();
                $this->fail('Inactive actors must be rejected by direct service calls.');
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('authorization', $exception->errors());
            }
        }

        $this->assertDatabaseHas('research_documents', ['id' => $ownerResearch->id, 'submission_status' => 'draft']);
        $this->assertDatabaseHas('research_documents', ['id' => $approvedResearch->id, 'submission_status' => 'approved', 'archive_status' => 'not_archived']);
        $this->assertDatabaseCount('feedback_comments', 0);
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
            ->assertCookieMissing('researchnav_sid')
            ->assertJsonPath('data.authors', [
                ['author_name' => 'First Author', 'author_order' => 1, 'is_corresponding_author' => false],
                ['author_name' => 'Second Author', 'author_order' => 2, 'is_corresponding_author' => false],
            ]);
        $this->assertArrayNotHasKey('submitted_by', $detail->json('data'));
        $this->assertArrayNotHasKey('submission_status', $detail->json('data'));
        $this->getJson('/api/repository/'.$private->id)->assertNotFound()->assertJsonPath('error', 'NOT_FOUND')->assertCookieMissing('researchnav_sid');
        $this->postJson('/api/research/'.$public->id.'/similarity/check', [], ['Origin' => 'http://localhost:5173'])->assertUnauthorized();
    }

    public function test_public_repository_list_loads_without_per_document_queries(): void
    {
        foreach (range(1, 3) as $number) {
            [, $document] = $this->research(['title' => "Public Study {$number}"]);
            $document->update(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        }

        DB::enableQueryLog();
        try {
            $this->getJson('/api/repository?per_page=1')->assertOk();
            $singleResultQueryCount = count(DB::getQueryLog());
            DB::flushQueryLog();

            $this->getJson('/api/repository?per_page=3')->assertOk();
            $multipleResultQueryCount = count(DB::getQueryLog());
        } finally {
            DB::disableQueryLog();
        }

        $this->assertSame($singleResultQueryCount, $multipleResultQueryCount);
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

    private function uploadCurrentRevisionManuscript(ResearchDocument $research, User $owner, Revision $revision): void
    {
        DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'revised_manuscript',
            'version_number' => 1,
            'original_filename' => 'revision.pdf',
            'stored_filename' => 'revision.pdf',
            'file_path' => 'research/'.$research->id.'/revision.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 1,
            'is_current' => true,
            'uploaded_at' => $revision->requested_at->copy()->addSecond(),
        ]);
    }
}
