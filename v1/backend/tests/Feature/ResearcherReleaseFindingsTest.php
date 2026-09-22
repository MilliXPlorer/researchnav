<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\DocumentFile;
use App\Models\FeedbackComment;
use App\Models\MonitoringLog;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\Revision;
use App\Models\TitleValidation;
use App\Models\User;
use App\Models\UserRole;
use App\Services\DocumentService;
use App\Services\FeedbackService;
use App\Services\ReviewAssignmentService;
use App\Services\RevisionService;
use Carbon\CarbonInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ResearcherReleaseFindingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_resubmission_requires_a_current_manuscript_for_the_request_and_notifies_reviewers(): void
    {
        Storage::fake('researchnav_private');
        [$owner, $research] = $this->research(['submission_status' => 'revision_required']);
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assign($research, $reviewer);
        $revision = $this->revision($research, $reviewer);
        $this->file($research, $owner, 'revised_manuscript', $revision->requested_at->copy());

        try {
            app(RevisionService::class)->resubmit($owner, $revision);
            $this->fail('A revised manuscript must be uploaded strictly after the request.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('revised_manuscript', $exception->errors());
        }

        Carbon::setTestNow($revision->requested_at->copy()->addSecond());
        try {
            app(DocumentService::class)->upload($owner, $research, UploadedFile::fake()->createWithContent('revision.pdf', '%PDF test'), 'revised_manuscript');
            app(RevisionService::class)->resubmit($owner, $revision);
        } finally {
            Carbon::setTestNow();
        }

        $events = $reviewer->notifications()->get()->map(fn ($notification) => $notification->data['event'])->all();
        $this->assertContains('DOCUMENT_UPLOADED', $events);
        $this->assertContains('REVISION_RESUBMITTED', $events);
        $notifications = $reviewer->notifications()->get()->pluck('data');
        $uploadNotification = $notifications->firstWhere('event', 'DOCUMENT_UPLOADED');
        $uploadedFile = DocumentFile::query()->where('original_filename', 'revision.pdf')->latest('id')->firstOrFail();
        $this->assertSame($research->title, $uploadNotification['research_title']);
        $this->assertSame($research->submission_reference, $uploadNotification['submission_reference']);
        $this->assertSame('/research/'.$research->id.'?tab=documents&folder=Unfiled&file='.$uploadedFile->id, $uploadNotification['action_url']);
        $this->assertSame('/research/'.$research->id, $notifications->firstWhere('event', 'REVISION_RESUBMITTED')['action_url']);
    }

    public function test_assignment_updates_notify_only_new_reviewers_and_the_researcher(): void
    {
        [$owner, $research] = $this->research();
        $office = User::factory()->create(['role' => 'research-office']);
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $service = app(ReviewAssignmentService::class);

        $service->replace($office, $research, [['reviewer_id' => $reviewer->id, 'review_role' => 'adviser']]);
        $service->replace($office, $research, [['reviewer_id' => $reviewer->id, 'review_role' => 'adviser']]);

        $this->assertSame(1, $owner->notifications()->get()->filter(fn ($notification) => $notification->data['event'] === 'REVIEW_ASSIGNMENTS_UPDATED')->count());
        $this->assertSame(1, $reviewer->notifications()->get()->filter(fn ($notification) => $notification->data['event'] === 'REVIEW_ASSIGNMENT_UPDATED')->count());
    }

    public function test_file_feedback_notification_links_to_the_exact_folder_and_file(): void
    {
        [$owner, $research] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assign($research, $reviewer);
        $file = DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'chapter',
            'version_number' => 1,
            'original_filename' => 'chapter-one.pdf',
            'relative_path' => 'Chapter 1',
            'stored_filename' => 'chapter-one.pdf',
            'file_path' => 'research/'.$research->id.'/chapter-one.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 1,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);

        app(FeedbackService::class)->create($reviewer, $research, [
            'comment' => 'Clarify this section.',
            'feedback_type' => 'comment',
            'document_file_id' => $file->id,
        ]);

        $notification = $owner->notifications()->latest()->firstOrFail()->data;
        $this->assertSame('FEEDBACK_CREATED', $notification['event']);
        $this->assertSame('/research/'.$research->id.'?tab=documents&folder=Chapter%201&file='.$file->id.'&panel=feedback', $notification['action_url']);
    }

    public function test_assignment_notification_links_open_assigned_reviewer_records_with_role_scoped_mutations(): void
    {
        [$owner, $research] = $this->research();
        $office = User::factory()->create(['role' => 'research-office']);
        $reviewers = collect(['adviser', 'instructor', 'panel', 'statistician'])->mapWithKeys(
            fn (string $role): array => [$role => User::factory()->create(['role' => $role])],
        );

        app(ReviewAssignmentService::class)->replace($office, $research, $reviewers
            ->map(fn (User $reviewer, string $role): array => ['reviewer_id' => $reviewer->id, 'review_role' => $role])
            ->values()
            ->all());

        foreach ($reviewers as $role => $reviewer) {
            $notification = $reviewer->notifications()->sole()->data;
            $this->assertSame('REVIEW_ASSIGNMENT_UPDATED', $notification['event']);
            $this->assertSame('/research/'.$research->id, $notification['action_url']);
            $this->as($reviewer)->getJson('/api/research/'.$research->id)
                ->assertOk()
                ->assertJsonPath('data.submission_status', $research->submission_status);
            $this->as($reviewer)->getJson('/api/research/'.$research->id.'/files')->assertOk();
            $this->as($reviewer)->getJson('/api/research/'.$research->id.'/similarity')->assertOk();
            $feedbackResponse = $this->as($reviewer)->getJson('/api/research/'.$research->id.'/feedback');
            $role === 'statistician' ? $feedbackResponse->assertForbidden() : $feedbackResponse->assertOk();
            $this->as($reviewer)->getJson('/api/research/'.$research->id.'/revisions')->assertOk();
            $this->as($reviewer)->getJson('/api/research/'.$research->id.'/monitoring')->assertOk();
            $this->as($reviewer)->getJson('/api/research/'.$research->id.'/validation')->assertOk();
        }

        $this->as($reviewers['panel'])->postJson('/api/research/'.$research->id.'/feedback', [
            'comment' => 'Panel feedback is permitted.',
            'feedback_type' => 'comment',
        ], $this->origin())->assertCreated();
        $this->as($reviewers['statistician'])->postJson('/api/research/'.$research->id.'/feedback', [
            'comment' => 'Statistician records are read-only.',
            'feedback_type' => 'comment',
        ], $this->origin())->assertForbidden();
    }

    public function test_disabled_reviewer_roles_lose_assignment_based_document_access(): void
    {
        [, $research] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assign($research, $reviewer);
        UserRole::query()->whereKey($reviewer->role_id)->update(['is_active' => false]);

        $this->as($reviewer)->getJson('/api/research/'.$research->id.'/files')->assertForbidden();
        $this->as($reviewer)->getJson('/api/research/'.$research->id.'/feedback')->assertForbidden();
    }

    public function test_feedback_notifications_skip_removed_researchers_and_revoked_authors(): void
    {
        [$owner, $research] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assign($research, $reviewer);
        DB::table('class_section_members')->where('research_document_id', $research->id)->where('user_id', $owner->id)->delete();

        $feedback = app(FeedbackService::class)->create($reviewer, $research, [
            'comment' => 'Current participants only.',
            'feedback_type' => 'comment',
        ]);
        $this->assertSame(0, $owner->notifications()->count());

        $participant = User::factory()->create(['role' => 'researcher']);
        $this->assignResearcherToDocument($participant, $research);
        ReviewAssignment::query()->where('research_document_id', $research->id)->where('reviewer_id', $reviewer->id)->update(['is_active' => false]);
        $this->as($participant)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', [
            'action' => 'acknowledge',
        ], $this->origin())->assertOk();
        $this->assertSame(0, $reviewer->notifications()->count());
    }

    public function test_replaying_researcher_actions_preserves_first_evidence_and_emits_no_duplicate_events(): void
    {
        [$owner, $research] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assign($research, $reviewer);
        $feedback = FeedbackComment::query()->create([
            'research_document_id' => $research->id,
            'user_id' => $reviewer->id,
            'comment' => 'Clarify the scope.',
            'feedback_type' => 'comment',
            'feedback_status' => 'open',
        ]);

        Carbon::setTestNow('2026-09-01 10:00:00.000000');
        try {
            $this->as($owner)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', ['action' => 'acknowledge'], $this->origin())->assertOk();
            $acknowledgedAt = $feedback->refresh()->researcher_acknowledged_at;
            Carbon::setTestNow('2026-09-01 10:01:00.000000');
            $this->as($owner)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', ['action' => 'acknowledge'], $this->origin())->assertOk();
            $this->assertTrue($acknowledgedAt->equalTo($feedback->refresh()->researcher_acknowledged_at));

            $this->as($owner)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', ['action' => 'address', 'remarks' => 'First remediation evidence.'], $this->origin())->assertOk();
            $addressedAt = $feedback->refresh()->researcher_addressed_at;
            Carbon::setTestNow('2026-09-01 10:02:00.000000');
            $this->as($owner)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', ['action' => 'address', 'remarks' => 'Replacement evidence.'], $this->origin())->assertOk();
        } finally {
            Carbon::setTestNow();
        }

        $feedback->refresh();
        $this->assertTrue($addressedAt->equalTo($feedback->researcher_addressed_at));
        $this->assertSame('First remediation evidence.', $feedback->researcher_action_remarks);
        $this->assertSame(1, MonitoringLog::query()->where('research_document_id', $research->id)->where('activity_type', 'FEEDBACK_ACKNOWLEDGED_BY_RESEARCHER')->count());
        $this->assertSame(1, MonitoringLog::query()->where('research_document_id', $research->id)->where('activity_type', 'FEEDBACK_ADDRESSED_BY_RESEARCHER')->count());
        $this->assertSame(2, $reviewer->notifications()->count());
        $this->assertSame(2, DB::table('audit_logs')->where('user_id', $owner->id)->whereIn('action', ['FEEDBACK_ACKNOWLEDGED_BY_RESEARCHER', 'FEEDBACK_ADDRESSED_BY_RESEARCHER'])->count());
    }

    public function test_researcher_lifecycle_actions_exclude_imported_and_terminal_records_and_mine_excludes_imports(): void
    {
        [$owner, $ongoing] = $this->research(['research_stage' => 'ongoing']);
        [, $imported] = $this->research(['submitted_by' => $owner->id, 'research_stage' => 'ongoing', 'import_source_sha256' => str_repeat('a', 64)]);
        [, $archived] = $this->research(['submitted_by' => $owner->id, 'research_stage' => 'ongoing', 'submission_status' => 'archived', 'archive_status' => 'archived']);
        $approved = $this->research(['submitted_by' => $owner->id, 'research_stage' => 'ongoing', 'submission_status' => 'approved'])[1];

        $this->as($owner)->postJson('/api/research/'.$ongoing->id.'/monitoring', ['progress_status' => 'on_track', 'remarks' => 'Current work.'], $this->origin())->assertCreated();
        $this->as($owner)->postJson('/api/research/'.$ongoing->id.'/validation', [], $this->origin())->assertCreated();
        $this->as($owner)->postJson('/api/research/'.$imported->id.'/monitoring', ['progress_status' => 'on_track', 'remarks' => 'Blocked.'], $this->origin())->assertForbidden();
        $this->as($owner)->postJson('/api/research/'.$imported->id.'/validation', [], $this->origin())->assertForbidden();
        $this->as($owner)->postJson('/api/research/'.$archived->id.'/monitoring', ['progress_status' => 'on_track', 'remarks' => 'Blocked.'], $this->origin())->assertForbidden();
        $this->as($owner)->postJson('/api/research/'.$archived->id.'/validation', [], $this->origin())->assertForbidden();
        $this->as($owner)->postJson('/api/research/'.$approved->id.'/validation', [], $this->origin())->assertForbidden();
        $this->as($owner)->getJson('/api/research?mine=1')->assertOk()->assertJsonMissing(['id' => $imported->id]);
    }

    public function test_researcher_responses_hide_actor_identifiers_and_office_feedback_is_author_scoped(): void
    {
        [$owner, $research] = $this->research(['research_stage' => 'ongoing']);
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $revision = $this->revision($research, $reviewer);
        $feedback = FeedbackComment::query()->create(['research_document_id' => $research->id, 'user_id' => $reviewer->id, 'comment' => 'Clarify.', 'feedback_type' => 'comment', 'feedback_status' => 'open']);
        $monitoring = MonitoringLog::query()->create(['research_document_id' => $research->id, 'performed_by' => $reviewer->id, 'activity_type' => 'REVIEWED', 'activity_date' => now()]);
        $validation = TitleValidation::query()->create(['research_document_id' => $research->id, 'validated_by' => $reviewer->id, 'validation_status' => 'pending']);
        $office = User::factory()->create(['role' => 'research-office']);

        $this->as($owner)->getJson('/api/research/'.$research->id)->assertJsonPath('data.submitted_by', null);
        $this->as($owner)->getJson('/api/research/'.$research->id.'/revisions')->assertJsonPath('data.0.requested_by', null)->assertJsonPath('data.0.requester_name', $reviewer->profileName());
        $this->as($owner)->getJson('/api/research/'.$research->id.'/feedback')->assertJsonPath('data.0.user_id', null)->assertJsonPath('data.0.reviewer_name', $reviewer->profileName());
        $this->as($owner)->getJson('/api/research/'.$research->id.'/monitoring')->assertJsonPath('data.0.performed_by', null);
        $this->as($owner)->getJson('/api/research/'.$research->id.'/validation')->assertJsonPath('data.0.validated_by', null);
        $this->as($office)->getJson('/api/research/'.$research->id.'/revisions')->assertJsonPath('data.0.requested_by', $revision->requested_by);
        $this->as($office)->getJson('/api/research/'.$research->id.'/feedback')->assertJsonCount(0, 'data');
        $this->as($office)->getJson('/api/research/'.$research->id.'/monitoring')->assertJsonPath('data.0.performed_by', $monitoring->performed_by);
        $this->as($office)->getJson('/api/research/'.$research->id.'/validation')->assertJsonPath('data.0.validated_by', $validation->validated_by);
    }

    public function test_file_mutations_reject_unknown_fields_and_file_routes_use_user_and_ip_limiters(): void
    {
        Storage::fake('researchnav_private');
        [$owner, $research] = $this->research();
        $file = app(DocumentService::class)->upload($owner, $research, UploadedFile::fake()->createWithContent('draft.pdf', '%PDF test'), 'draft');

        $this->as($owner)->post('/api/research/'.$research->id.'/files', ['file' => UploadedFile::fake()->createWithContent('other.pdf', '%PDF test'), 'document_type' => 'draft', 'unexpected' => true], $this->origin())->assertUnprocessable()->assertJsonValidationErrors('unexpected');
        $this->as($owner)->patchJson('/api/research/'.$research->id.'/files/'.$file->id, ['original_filename' => 'draft.pdf', 'unexpected' => true], $this->origin())->assertUnprocessable()->assertJsonValidationErrors('unexpected');
        $this->as($owner)->deleteJson('/api/research/'.$research->id.'/files/'.$file->id, ['unexpected' => true], $this->origin())->assertUnprocessable()->assertJsonValidationErrors('unexpected');
        $this->as($owner)->deleteJson('/api/research/'.$research->id.'/files/'.$file->id, [], $this->origin())->assertNoContent();

        $routes = app('router')->getRoutes();
        $download = $routes->match(Request::create('/api/research/'.$research->id.'/files/1/download', 'GET'));
        $preview = $routes->match(Request::create('/api/research/'.$research->id.'/files/1/preview', 'GET'));
        $rename = $routes->match(Request::create('/api/research/'.$research->id.'/files/1', 'PATCH'));
        $this->assertContains('throttle:research-file-access', $download->gatherMiddleware());
        $this->assertContains('throttle:research-file-access', $preview->gatherMiddleware());
        $this->assertContains('throttle:researcher-file-mutations', $rename->gatherMiddleware());
    }

    /** @return array{User, ResearchDocument} */
    private function research(array $attributes = []): array
    {
        $owner = $attributes['submitted_by'] ?? User::factory()->create(['role' => 'researcher']);
        unset($attributes['submitted_by']);
        if (! $owner instanceof User) {
            $owner = User::query()->findOrFail($owner);
        }
        $category = Category::query()->create(['name' => 'Category '.fake()->unique()->word(), 'slug' => 'category-'.fake()->unique()->numberBetween(1, 999999)]);
        $research = ResearchDocument::factory()->create(array_merge(['submitted_by' => $owner->id, 'category_id' => $category->id], $attributes));
        $this->assignResearcherToDocument($owner, $research);
        ResearchAuthor::factory()->create(['research_document_id' => $research->id, 'user_id' => $owner->id]);

        return [$owner, $research];
    }

    private function assign(ResearchDocument $research, User $reviewer): void
    {
        ReviewAssignment::query()->create(['research_document_id' => $research->id, 'reviewer_id' => $reviewer->id, 'assigned_by' => User::factory()->create(['role' => 'research-office'])->id, 'review_role' => 'adviser', 'is_active' => true]);
    }

    private function revision(ResearchDocument $research, User $reviewer): Revision
    {
        return Revision::query()->create(['research_document_id' => $research->id, 'requested_by' => $reviewer->id, 'revision_number' => 1, 'revision_remarks' => 'Please revise.', 'revision_status' => 'requested', 'requested_at' => now()]);
    }

    private function file(ResearchDocument $research, User $owner, string $type, CarbonInterface $uploadedAt): void
    {
        DocumentFile::query()->create(['research_document_id' => $research->id, 'uploaded_by' => $owner->id, 'document_type' => $type, 'version_number' => 1, 'original_filename' => 'revision.pdf', 'stored_filename' => 'revision.pdf', 'file_path' => 'research/'.$research->id.'/revision.pdf', 'file_extension' => 'pdf', 'mime_type' => 'application/pdf', 'file_size' => 1, 'is_current' => true, 'uploaded_at' => $uploadedAt]);
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
