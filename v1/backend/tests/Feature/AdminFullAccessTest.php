<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\DocumentFile;
use App\Models\FeedbackComment;
use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\Revision;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use App\Services\DocumentService;
use App\Services\DomainAuthorization;
use App\Services\FeedbackService;
use App\Services\ResearchService;
use App\Services\ReviewAssignmentService;
use App\Services\RevisionService;
use App\Services\TitleValidationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AdminFullAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_administrator_can_update_and_submit_another_owners_editable_draft(): void
    {
        $admin = $this->administrator();
        $owner = $this->user();
        $draft = $this->document($owner, ['visibility' => 'public']);
        $revisionRequired = $this->document($owner, ['submission_status' => 'revision_required', 'visibility' => 'public']);
        $draft->authors()->create(['user_id' => $owner->id, 'author_name' => 'Draft Owner', 'author_order' => 1, 'is_corresponding_author' => true]);

        $this->as($admin)->patchJson('/api/research/'.$draft->id, ['title' => 'Administrator edited draft'], $this->origin())
            ->assertOk();
        $this->as($admin)->patchJson('/api/research/'.$revisionRequired->id, ['title' => 'Administrator edited revision'], $this->origin())
            ->assertOk();

        $this->assertDatabaseHas('research_documents', [
            'id' => $draft->id,
            'submitted_by' => $owner->id,
            'title' => 'Administrator edited draft',
            'visibility' => 'private',
        ]);
        $this->assertDatabaseHas('research_documents', [
            'id' => $revisionRequired->id,
            'submitted_by' => $owner->id,
            'title' => 'Administrator edited revision',
            'visibility' => 'private',
        ]);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'RESEARCH_UPDATED', 'entity_id' => (string) $draft->id]);
        $this->assertDatabaseHas('monitoring_logs', ['performed_by' => $admin->id, 'activity_type' => 'RESEARCH_UPDATED', 'research_document_id' => $draft->id]);

        $this->as($admin)->postJson('/api/research/'.$draft->id.'/submit', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.submitted_by', $owner->id)
            ->assertJsonPath('data.submission_status', 'submitted');

        $this->assertDatabaseHas('research_documents', ['id' => $draft->id, 'submitted_by' => $owner->id, 'submission_status' => 'submitted']);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'RESEARCH_SUBMITTED', 'entity_id' => (string) $draft->id]);
        $this->assertDatabaseHas('monitoring_logs', ['performed_by' => $admin->id, 'activity_type' => 'RESEARCH_SUBMITTED', 'research_document_id' => $draft->id]);
        $this->assertDatabaseHas('notifications', ['notifiable_id' => $owner->id, 'research_document_id' => $draft->id]);
    }

    public function test_administrator_cannot_edit_or_submit_research_outside_the_editable_workflow_states(): void
    {
        $admin = $this->administrator();
        $owner = $this->user();
        $submitted = $this->document($owner, ['submission_status' => 'submitted']);
        $revisionRequired = $this->document($owner, ['submission_status' => 'revision_required']);

        $this->as($admin)->patchJson('/api/research/'.$submitted->id, ['title' => 'Not allowed'], $this->origin())
            ->assertForbidden();
        $this->as($admin)->postJson('/api/research/'.$revisionRequired->id.'/submit', [], $this->origin())
            ->assertForbidden();

        $this->assertDatabaseHas('research_documents', ['id' => $submitted->id, 'submission_status' => 'submitted']);
        $this->assertDatabaseHas('research_documents', ['id' => $revisionRequired->id, 'submission_status' => 'revision_required']);
    }

    public function test_administrator_can_resubmit_only_the_latest_unresolved_revision_without_reassigning_ownership(): void
    {
        $admin = $this->administrator();
        $owner = $this->user();
        $requester = $this->user('adviser');
        $research = $this->document($owner, ['submission_status' => 'revision_required']);
        $first = $this->revision($research, $requester, 1);
        $latest = $this->revision($research, $requester, 2);
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
            'uploaded_at' => $latest->requested_at->copy()->addSecond(),
        ]);

        $this->as($admin)->patchJson('/api/research/'.$research->id.'/revisions/'.$first->id.'/resubmit', [], $this->origin())
            ->assertUnprocessable();
        $this->assertDatabaseHas('revisions', ['id' => $first->id, 'revision_status' => 'requested']);
        $this->assertDatabaseHas('research_documents', ['id' => $research->id, 'submission_status' => 'revision_required']);

        $this->as($admin)->patchJson('/api/research/'.$research->id.'/revisions/'.$latest->id.'/resubmit', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.requested_by', $requester->id)
            ->assertJsonPath('data.revision_status', 'resubmitted');

        $this->assertDatabaseHas('research_documents', ['id' => $research->id, 'submitted_by' => $owner->id, 'submission_status' => 'under_review']);
        $this->assertDatabaseHas('revisions', ['id' => $latest->id, 'requested_by' => $requester->id, 'revision_status' => 'resubmitted']);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'REVISION_RESUBMITTED', 'entity_id' => (string) $latest->id]);
        $this->assertDatabaseHas('monitoring_logs', ['performed_by' => $admin->id, 'activity_type' => 'REVISION_RESUBMITTED', 'research_document_id' => $research->id]);
    }

    public function test_administrator_can_decide_another_validators_pending_title_validation_but_cannot_override_completed_or_wrong_parent_results(): void
    {
        $admin = $this->administrator();
        $owner = $this->user();
        $validator = $this->user('adviser');
        $research = $this->document($owner);
        $this->assign($research, $validator);
        $pending = TitleValidation::query()->create([
            'research_document_id' => $research->id,
            'validated_by' => $validator->id,
            'validation_status' => 'pending',
        ]);

        $this->as($admin)->patchJson('/api/research/'.$research->id.'/validation/'.$pending->id, ['validation_status' => 'approved'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.validated_by', $admin->id);
        $this->assertDatabaseHas('title_validations', ['id' => $pending->id, 'validated_by' => $admin->id, 'validation_status' => 'approved']);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'TITLE_VALIDATED', 'entity_id' => (string) $pending->id]);
        $this->assertDatabaseHas('monitoring_logs', ['performed_by' => $admin->id, 'activity_type' => 'TITLE_VALIDATED', 'research_document_id' => $research->id]);

        $this->as($admin)->patchJson('/api/research/'.$research->id.'/validation/'.$pending->id, ['validation_status' => 'rejected'], $this->origin())
            ->assertUnprocessable();

        $wrongParentPending = TitleValidation::query()->create([
            'research_document_id' => $research->id,
            'validated_by' => $validator->id,
            'validation_status' => 'pending',
        ]);
        $otherResearch = $this->document($this->user());
        $wrongParentResult = SimilarityResult::factory()->create([
            'source_research_id' => $otherResearch->id,
            'matched_research_id' => $research->id,
            'final_similarity_score' => '0.800000',
        ]);

        $this->as($admin)->patchJson('/api/research/'.$research->id.'/validation/'.$wrongParentPending->id, [
            'validation_status' => 'rejected',
            'similarity_result_id' => $wrongParentResult->id,
        ], $this->origin())->assertUnprocessable();
        $this->assertDatabaseHas('title_validations', ['id' => $wrongParentPending->id, 'validation_status' => 'pending']);
    }

    public function test_inactive_administrators_and_ordinary_users_cannot_use_administrator_access(): void
    {
        $owner = $this->user();
        $research = $this->document($owner);
        $inactiveAdmin = $this->administrator('inactive');
        $ordinaryUser = $this->user();

        $this->as($inactiveAdmin)->patchJson('/api/research/'.$research->id, ['title' => 'Blocked admin'], $this->origin())
            ->assertForbidden()
            ->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);
        $this->as($ordinaryUser)->patchJson('/api/research/'.$research->id, ['title' => 'Blocked user'], $this->origin())
            ->assertForbidden();
    }

    public function test_inactive_administrator_cannot_use_direct_service_privileges_but_active_administrator_can(): void
    {
        $inactiveAdmin = $this->administrator('inactive');
        $activeAdmin = $this->administrator();
        $owner = $this->user();
        $research = $this->document($owner, ['submission_status' => 'submitted']);
        $researchService = app(ResearchService::class);
        $revisionService = app(RevisionService::class);
        $validationService = app(TitleValidationService::class);

        $this->assertTrue($inactiveAdmin->is_admin);
        $this->assertServiceCallIsUnauthorized(fn () => $researchService->transition($inactiveAdmin, $research, 'under_review'));
        $this->assertSame('submitted', $research->refresh()->submission_status);

        $researchService->transition($activeAdmin, $research, 'under_review');
        $this->assertSame('under_review', $research->refresh()->submission_status);

        $this->assertServiceCallIsUnauthorized(fn () => $revisionService->request($inactiveAdmin, $research, ['revision_remarks' => 'Blocked revision request.']));
        $this->assertSame('under_review', $research->refresh()->submission_status);
        $this->assertDatabaseCount('revisions', 0);

        $revision = $revisionService->request($activeAdmin, $research, ['revision_remarks' => 'Administrator revision request.']);
        $this->assertSame($activeAdmin->id, $revision->requested_by);
        $this->assertSame('revision_required', $research->refresh()->submission_status);

        $validationResearch = $this->document($owner);
        $this->assertServiceCallIsUnauthorized(fn () => $validationService->createPending($inactiveAdmin, $validationResearch, ['validated_by' => $inactiveAdmin->id]));
        $this->assertSame('draft', $validationResearch->refresh()->submission_status);
        $this->assertDatabaseCount('title_validations', 0);

        $validation = $validationService->createPending($activeAdmin, $validationResearch, ['validated_by' => $activeAdmin->id]);
        $this->assertSame($activeAdmin->id, $validation->validated_by);
    }

    public function test_services_reauthorize_a_stale_administrator_before_review_assignment_and_feedback_writes(): void
    {
        $staleAdmin = $this->administrator();
        $activeAdmin = $this->administrator();
        $owner = $this->user();
        $reviewer = $this->user('adviser');
        $research = $this->document($owner);
        $existingFeedback = FeedbackComment::query()->create([
            'research_document_id' => $research->id,
            'user_id' => $reviewer->id,
            'comment' => 'Existing feedback.',
            'feedback_type' => 'comment',
            'feedback_status' => 'open',
        ]);
        $assignmentService = app(ReviewAssignmentService::class);
        $feedbackService = app(FeedbackService::class);

        $this->assertTrue(DomainAuthorization::isOffice($staleAdmin));
        User::query()->findOrFail($staleAdmin->id)->update(['account_status' => 'inactive']);

        $this->assertServiceCallIsUnauthorized(fn () => $assignmentService->replace($staleAdmin, $research, [['reviewer_id' => $reviewer->id, 'review_role' => 'adviser']]));
        $this->assertDatabaseCount('research_review_assignments', 0);

        $this->assertServiceCallIsUnauthorized(fn () => $feedbackService->create($staleAdmin, $research, ['comment' => 'Blocked feedback.', 'feedback_type' => 'comment']));
        $this->assertDatabaseCount('feedback_comments', 1);

        $this->assertServiceCallIsUnauthorized(fn () => $feedbackService->setStatus($staleAdmin, $existingFeedback, 'resolved'));
        $this->assertDatabaseHas('feedback_comments', ['id' => $existingFeedback->id, 'feedback_status' => 'open']);

        $assignmentService->replace($activeAdmin, $research, [['reviewer_id' => $reviewer->id, 'review_role' => 'adviser']]);
        $this->assertDatabaseHas('research_review_assignments', ['research_document_id' => $research->id, 'reviewer_id' => $reviewer->id, 'assigned_by' => $activeAdmin->id]);

        $feedback = $feedbackService->create($activeAdmin, $research, ['comment' => 'Administrator feedback.', 'feedback_type' => 'comment']);
        $this->assertSame($activeAdmin->id, $feedback->user_id);
        $this->assertSame('resolved', $feedbackService->setStatus($activeAdmin, $feedback, 'resolved')->feedback_status);
    }

    public function test_active_administrator_can_upload_any_valid_type_to_another_owners_editable_research_but_an_inactive_administrator_cannot(): void
    {
        Storage::fake('researchnav_private');
        $admin = $this->administrator();
        $inactiveAdmin = $this->administrator('inactive');
        $owner = $this->user();
        $draft = $this->document($owner);
        $revisionRequired = $this->document($owner, ['submission_status' => 'revision_required']);
        $service = app(DocumentService::class);

        $draftFile = $service->upload($admin, $draft, UploadedFile::fake()->createWithContent('draft.pdf', '%PDF test'), 'chapter');
        $revisionFile = $service->upload($admin, $revisionRequired, UploadedFile::fake()->createWithContent('revision.pdf', '%PDF test'), 'revised_manuscript');

        $this->assertSame($admin->id, $draftFile->uploaded_by);
        $this->assertSame($admin->id, $revisionFile->uploaded_by);
        Storage::disk('researchnav_private')->assertExists($draftFile->file_path);
        Storage::disk('researchnav_private')->assertExists($revisionFile->file_path);

        $this->assertServiceCallIsUnauthorized(fn () => $service->upload($inactiveAdmin, $draft, UploadedFile::fake()->createWithContent('blocked.pdf', '%PDF test'), 'attachment'));
        $this->assertDatabaseCount('document_files', 2);
        $this->assertCount(2, Storage::disk('researchnav_private')->allFiles());
    }

    private function administrator(string $accountStatus = 'active'): User
    {
        return User::factory()->create(['role' => 'admin', 'account_status' => $accountStatus]);
    }

    private function user(string $role = 'researcher'): User
    {
        return User::factory()->create(['role' => $role, 'account_status' => 'active']);
    }

    private function document(User $owner, array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create(array_merge(['submitted_by' => $owner->id], $attributes));
    }

    private function revision(ResearchDocument $research, User $requester, int $number): Revision
    {
        return Revision::query()->create([
            'research_document_id' => $research->id,
            'requested_by' => $requester->id,
            'revision_number' => $number,
            'revision_remarks' => 'Revision '.$number.' requested.',
            'revision_status' => 'requested',
            'requested_at' => now(),
        ]);
    }

    private function assign(ResearchDocument $research, User $reviewer): void
    {
        ReviewAssignment::query()->create([
            'research_document_id' => $research->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => $this->user('research-office')->id,
            'review_role' => 'adviser',
            'is_active' => true,
        ]);
    }

    private function assertServiceCallIsUnauthorized(callable $call): void
    {
        $auditLogCount = AuditLog::query()->count();
        $monitoringLogCount = MonitoringLog::query()->count();

        try {
            $call();
            $this->fail('Expected the inactive administrator service call to be unauthorized.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('authorization', $exception->errors());
        }

        $this->assertDatabaseCount('audit_logs', $auditLogCount);
        $this->assertDatabaseCount('monitoring_logs', $monitoringLogCount);
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
