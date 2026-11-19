<?php

namespace Tests\Feature;

use App\Models\Evaluation;
use App\Models\MetadataReview;
use App\Models\MethodologyReview;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_authentication_and_active_account_middleware_protect_the_dashboard(): void
    {
        $this->getJson('/api/dashboard')
            ->assertUnauthorized()
            ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);

        $inactive = $this->user('admin', 'invited');
        $this->dashboard($inactive)
            ->assertForbidden()
            ->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);
    }

    public function test_researchers_only_see_instructor_assigned_records(): void
    {
        $researcher = $this->user('researcher');
        $other = $this->user('researcher');

        $ownDraft = $this->document(['submitted_by' => $researcher->id, 'submission_status' => 'draft']);
        $ownRevision = $this->document(['submitted_by' => $researcher->id, 'submission_status' => 'revision_required']);
        $foreignDraft = $this->document(['submitted_by' => $other->id, 'submission_status' => 'draft']);
        $this->assignResearcher($ownDraft, $researcher);
        $this->assignResearcher($ownRevision, $researcher);

        $sections = $this->sections($this->dashboard($researcher)->assertOk());

        $this->assertSame(
            ['my_drafts', 'my_under_review', 'my_revision_required', 'my_flagged_similarity', 'my_approved', 'my_archived', 'repository_references'],
            array_keys($sections),
        );

        $this->assertSame([$ownDraft->id], array_column($sections['my_drafts']['items'], 'research_document_id'));
        $this->assertSame(1, $sections['my_drafts']['total']);
        $this->assertNotContains($foreignDraft->id, array_column($sections['my_drafts']['items'], 'research_document_id'));
        $this->assertSame([$ownRevision->id], array_column($sections['my_revision_required']['items'], 'research_document_id'));
    }

    public function test_every_supported_legacy_role_has_its_contract_sections(): void
    {
        $expectedKeys = [
            'admin' => ['pending_accounts', 'draft_research', 'submission_queue', 'revision_required', 'pending_title_validations', 'flagged_similarity', 'approved_for_archiving', 'archived_repository', 'recent_research'],
            'researcher' => ['my_drafts', 'my_under_review', 'my_revision_required', 'my_flagged_similarity', 'my_approved', 'my_archived', 'repository_references'],
            'adviser' => ['assigned_reviews', 'revision_requests', 'repository_references'],
            'instructor' => ['title_proposals', 'pending_reviews', 'repository_references'],
            'panel' => ['assigned_manuscripts', 'repository_references'],
            'statistician' => ['methodology_reviews', 'signoffs', 'completed_references'],
            'coordinator' => ['active_instructors', 'invited_instructors', 'blocked_instructors', 'schedules', 'duplicate_flags'],
            'librarian' => ['archiving_queue', 'metadata_validation', 'repository_records'],
            'research-office' => ['assigned_research', 'submission_queue', 'revision_requests', 'pending_archiving', 'archived_repository'],
        ];

        foreach ($expectedKeys as $role => $keys) {
            $response = $this->dashboard($this->user($role))->assertOk();
            $data = $response->json('data');

            $this->assertSame(1, $data['schema_version']);
            $this->assertSame($role, $data['role']);
            $this->assertSame($keys, array_column($data['sections'], 'key'));
            foreach ($data['sections'] as $section) {
                $this->assertContains($section['state'], ['ready', 'unavailable']);
                $this->assertArrayHasKey('total', $section);
                $this->assertArrayHasKey('reason', $section);
                $this->assertArrayHasKey('items', $section);
            }
        }
    }

    public function test_librarian_dashboard_uses_final_metadata_review_status_column(): void
    {
        Schema::dropIfExists('metadata_reviews');

        $sections = $this->sections($this->dashboard($this->user('librarian'))->assertOk());

        $this->assertSame(0, $sections['metadata_validation']['total']);
        $this->assertSame('status', MetadataReview::column('review_status'));
    }

    public function test_librarian_dashboard_projection_is_repository_scoped_and_consistent(): void
    {
        Carbon::setTestNow('2026-08-22 12:00:00');
        try {
            $librarian = $this->user('librarian');
            $submitter = $this->user('researcher');
            $pending = $this->document([
                'submitted_by' => $submitter->id,
                'title' => 'Pending archive',
                'submission_status' => 'approved',
                'archive_status' => 'pending_archiving',
            ]);
            $ready = $this->document([
                'submitted_by' => $submitter->id,
                'title' => 'Ready archive',
                'submission_status' => 'approved',
                'archive_status' => 'pending_archiving',
            ]);
            $archived = $this->document([
                'title' => 'Archived record',
                'submission_status' => 'archived',
                'archive_status' => 'archived',
                'visibility' => 'public',
                'archived_at' => '2026-08-10 08:00:00',
            ]);
            $privateArchive = $this->document([
                'title' => 'Private archive',
                'submission_status' => 'archived',
                'archive_status' => 'archived',
                'visibility' => 'private',
                'archived_at' => '2026-08-11 08:00:00',
            ]);
            MetadataReview::query()->create([
                'research_document_id' => $ready->id,
                'reviewed_by' => $librarian->id,
                'review_status' => 'complete',
            ]);
            $returned = MetadataReview::query()->create([
                'research_document_id' => $pending->id,
                'reviewed_by' => $librarian->id,
                'review_status' => 'needs_correction',
            ]);
            $returned->forceFill(['updated_at' => '2026-07-15 08:00:00'])->saveQuietly();

            $projection = $this->dashboard($librarian)->assertOk()->json('data.librarian');

            $this->assertSame([
                'archiving_queue' => 2,
                'metadata_validation' => 1,
                'repository_records' => 1,
                'archived_this_month' => 1,
            ], $projection['counts']);
            $this->assertEqualsCanonicalizing(
                [$pending->id, $ready->id],
                array_column($projection['queue'], 'research_document_id'),
            );
            $this->assertNotContains($archived->id, array_column($projection['queue'], 'research_document_id'));
            $this->assertNotContains($privateArchive->id, array_column($projection['queue'], 'research_document_id'));
            $this->assertSame(2, array_sum($projection['queue_status']));
            $this->assertSame(1, array_sum(array_column($projection['activity']['six_months']['months'], 'archived')));
            $this->assertSame(1, array_sum(array_column($projection['activity']['six_months']['months'], 'returned')));
            $this->assertSame(
                collect($projection['recent_activity'])->pluck('occurred_at')->sortDesc()->values()->all(),
                array_column($projection['recent_activity'], 'occurred_at'),
            );
            $this->assertArrayNotHasKey('notes', $projection['recent_activity'][0]);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_statistician_dashboard_projection_is_assignment_scoped_and_consistent(): void
    {
        Carbon::setTestNow('2026-08-22 12:00:00');
        try {
            $statistician = $this->user('statistician');
            $other = $this->user('statistician');
            $pending = $this->document(['title' => 'Pending study']);
            $inReview = $this->document(['title' => 'In review study']);
            $completed = $this->document(['title' => 'Completed study']);
            $foreign = $this->document(['title' => 'Foreign study']);
            $revoked = $this->document(['title' => 'Revoked study']);

            $this->assign($pending, $statistician, 'statistician', true, 'proposal');
            $this->assign($inReview, $statistician, 'statistician', true, 'proposal');
            $this->assign($completed, $statistician, 'statistician', true, 'proposal');
            $this->assign($foreign, $other, 'statistician', true, 'proposal');
            $this->assign($revoked, $statistician, 'statistician', false, 'proposal');

            $inProgressReview = MethodologyReview::query()->create([
                'research_document_id' => $inReview->id,
                'statistician_id' => $statistician->id,
                'review_status' => 'in_progress',
            ]);
            $inProgressReview->forceFill([
                'created_at' => '2026-07-10 08:00:00',
                'updated_at' => '2026-07-11 08:00:00',
            ])->saveQuietly();
            $completedReview = MethodologyReview::query()->create([
                'research_document_id' => $completed->id,
                'statistician_id' => $statistician->id,
                'review_status' => 'signed_off',
                'signed_off_at' => '2026-08-15 08:00:00',
            ]);
            $completedReview->forceFill([
                'created_at' => '2026-08-10 08:00:00',
                'updated_at' => '2026-08-15 08:00:00',
            ])->saveQuietly();
            foreach ([$foreign, $revoked] as $document) {
                MethodologyReview::query()->create([
                    'research_document_id' => $document->id,
                    'statistician_id' => $document->is($foreign) ? $other->id : $statistician->id,
                    'review_status' => 'signed_off',
                    'signed_off_at' => now(),
                ]);
            }

            $projection = $this->dashboard($statistician)->assertOk()->json('data.statistician');

            $this->assertSame([
                'assigned' => 3,
                'pending' => 1,
                'in_review' => 1,
                'for_sign_off' => 1,
                'completed' => 1,
            ], $projection['counts']);
            $this->assertEqualsCanonicalizing(
                [$pending->id, $inReview->id],
                array_column($projection['workload'], 'research_document_id'),
            );
            $this->assertNotContains($foreign->id, array_column($projection['workload'], 'research_document_id'));
            $this->assertNotContains($revoked->id, array_column($projection['workload'], 'research_document_id'));
            $this->assertSame([0, 0, 0, 0, 1, 1], array_column($projection['activity']['months'], 'started'));
            $this->assertSame([0, 0, 0, 0, 0, 1], array_column($projection['activity']['months'], 'completed'));
            $completedEvent = collect($projection['recent_activity'])->firstWhere('type', 'sign_off_completed');
            $this->assertSame($completed->id, $completedEvent['research_document_id']);
            $this->assertSame(
                collect($projection['recent_activity'])->pluck('occurred_at')->sortDesc()->values()->all(),
                array_column($projection['recent_activity'], 'occurred_at'),
            );
            $this->assertArrayNotHasKey('remarks', $projection['recent_activity'][0]);
            $this->assertNull($projection['workload'][0]['due_at']);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_research_editor_dashboard_is_scoped_deduplicated_and_consistent(): void
    {
        Carbon::setTestNow('2026-08-22 12:00:00');
        try {
            $editor = $this->user('research_editor');
            $otherEditor = $this->user('research_editor');
            $forReview = $this->document(['title' => 'Current editorial review']);
            $completed = $this->document(['title' => 'Completed editorial review']);
            $foreign = $this->document(['title' => 'Foreign editorial review']);
            $revoked = $this->document(['title' => 'Revoked editorial review']);
            $deleted = $this->document(['title' => 'Deleted editorial review']);

            $old = $this->assignAt($forReview, $editor, 'research_editor', true, '2026-07-01 08:00:00', 'proposal');
            $old->forceFill(['status' => 'replaced', 'is_active' => false])->saveQuietly();
            $this->assignAt($forReview, $editor, 'research_editor', true, '2026-08-10 08:00:00', 'final');
            $this->assignAt($completed, $editor, 'research_editor', true, '2026-08-11 08:00:00');
            $this->assignAt($foreign, $otherEditor, 'research_editor', true, '2026-08-12 08:00:00');
            $revokedAssignment = $this->assignAt($revoked, $editor, 'research_editor', true, '2026-08-13 08:00:00');
            $revokedAssignment->forceFill(['status' => 'replaced', 'is_active' => true])->saveQuietly();
            $this->assignAt($deleted, $editor, 'research_editor', true, '2026-08-14 08:00:00');
            $deleted->delete();

            $this->editorReview($forReview, $editor, 'editorial_clearance', 'completed', '2026-08-01 08:00:00');
            $this->editorReview($completed, $editor, 'editorial_clearance', 'completed', '2026-08-20 08:00:00');
            $this->editorReview($completed, $otherEditor, 'editorial_correction', 'open', '2026-08-21 08:00:00');
            $this->editorReview($foreign, $otherEditor, 'editorial_clearance', 'completed', '2026-08-21 09:00:00');

            $projection = $this->dashboard($editor)->assertOk()->json('data.editor');

            $this->assertSame([
                'pending_requests' => 0,
                'assigned_research' => 2,
                'for_review' => 1,
                'completed_reviews' => 1,
            ], $projection['counts']);
            $this->assertSame(['for_review' => 1, 'completed' => 1], $projection['workload']);
            $this->assertSame([$forReview->id, $completed->id], array_column($projection['assignments'], 'research_document_id'));
            $this->assertSame(['for_review', 'completed'], array_column($projection['assignments'], 'review_status'));
            $this->assertNotContains($foreign->id, array_column($projection['recent_activity'], 'research_document_id'));
            $this->assertNotContains($revoked->id, array_column($projection['recent_activity'], 'research_document_id'));
            $this->assertNotContains($deleted->id, array_column($projection['recent_activity'], 'research_document_id'));
            $this->assertSame(
                collect($projection['recent_activity'])->pluck('occurred_at')->sortDesc()->values()->all(),
                array_column($projection['recent_activity'], 'occurred_at'),
            );
            $this->assertArrayNotHasKey('remarks', $projection['recent_activity'][0]);
            $this->assertNull($this->dashboard($this->user('adviser'))->assertOk()->json('data.editor'));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_research_editor_dashboard_counts_pending_and_bounds_rows_and_activity(): void
    {
        $editor = $this->user('research_editor');
        $office = $this->user('research-office');
        $pending = $this->document(['title' => 'Pending editor invitation']);
        ReviewAssignment::query()->create([
            'research_document_id' => $pending->id,
            'reviewer_id' => $editor->id,
            'assigned_by' => $office->id,
            'review_role' => 'research_editor',
            'is_active' => false,
            'status' => 'requested',
        ]);

        foreach (range(1, 8) as $index) {
            $document = $this->document([
                'title' => 'Editor study '.$index,
                'updated_at' => now()->subMinutes($index),
            ]);
            $this->assignAt($document, $editor, 'research_editor', true, now()->subDays($index)->toDateTimeString());
            $this->editorReview($document, $editor, 'editorial_comment', 'open', now()->subHours($index)->toDateTimeString());
        }

        $projection = $this->dashboard($editor)->assertOk()->json('data.editor');

        $this->assertSame(1, $projection['counts']['pending_requests']);
        $this->assertSame(8, $projection['counts']['assigned_research']);
        $this->assertSame(8, $projection['counts']['for_review']);
        $this->assertSame(0, $projection['counts']['completed_reviews']);
        $this->assertCount(5, $projection['assignments']);
        $this->assertCount(6, $projection['recent_activity']);
    }

    public function test_research_editor_dashboard_empty_state_uses_real_empty_values(): void
    {
        $projection = $this->dashboard($this->user('research_editor'))->assertOk()->json('data.editor');

        $this->assertSame([
            'pending_requests' => 0,
            'assigned_research' => 0,
            'for_review' => 0,
            'completed_reviews' => 0,
        ], $projection['counts']);
        $this->assertSame(['for_review' => 0, 'completed' => 0], $projection['workload']);
        $this->assertSame([], $projection['assignments']);
        $this->assertSame([], $projection['recent_activity']);
    }

    public function test_research_editor_dashboard_uses_final_review_storage_without_activity_starvation(): void
    {
        Schema::create('research_reviews', function ($table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->uuid('reviewer_id');
            $table->string('reviewer_role');
            $table->string('review_type');
            $table->text('remarks')->nullable();
            $table->string('status');
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });
        $editor = $this->user('research_editor');
        $noisy = $this->document(['title' => 'Noisy editorial review']);
        $completed = $this->document(['title' => 'Older completed review']);
        $this->assignAt($noisy, $editor, 'research_editor', true, '2026-08-01 08:00:00');
        $this->assignAt($completed, $editor, 'research_editor', true, '2026-08-01 08:00:00');

        foreach (range(1, 8) as $index) {
            DB::table('research_reviews')->insert([
                'research_document_id' => $noisy->id,
                'reviewer_id' => $editor->id,
                'reviewer_role' => 'research_editor',
                'review_type' => 'editorial_comment',
                'remarks' => 'Comment '.$index,
                'status' => 'open',
                'reviewed_at' => '2026-08-'.str_pad((string) (10 + $index), 2, '0', STR_PAD_LEFT).' 08:00:00',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        DB::table('research_reviews')->insert([
            'research_document_id' => $completed->id,
            'reviewer_id' => $editor->id,
            'reviewer_role' => 'research_editor',
            'review_type' => 'editorial_clearance',
            'remarks' => 'Completed',
            'status' => 'completed',
            'reviewed_at' => '2026-08-02 08:00:00',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $projection = $this->dashboard($editor)->assertOk()->json('data.editor');

        $this->assertSame(1, $projection['counts']['for_review']);
        $this->assertSame(1, $projection['counts']['completed_reviews']);
        $this->assertSame('completed', collect($projection['assignments'])->firstWhere('research_document_id', $completed->id)['review_status']);
        $this->assertCount(6, $projection['recent_activity']);
    }

    public function test_adviser_and_instructor_only_see_their_active_matching_assignments(): void
    {
        $adviser = $this->user('adviser');
        $instructor = $this->user('instructor');
        $other = $this->user('adviser');
        $assigned = $this->document(['submission_status' => 'under_review']);
        $revision = $this->document(['submission_status' => 'revision_required']);
        $proposal = $this->document(['research_stage' => 'title_proposal']);
        $inactive = $this->document(['submission_status' => 'submitted']);
        $assignedToOtherAdviser = $this->document(['submission_status' => 'under_review']);

        $this->assign($assigned, $adviser, 'adviser', true, 'proposal');
        $this->assign($revision, $adviser, 'adviser', true, 'proposal');
        $this->assign($proposal, $instructor, 'instructor', true, 'proposal');
        $this->assign($inactive, $adviser, 'adviser', false, 'proposal');
        $this->assign($assigned, $other, 'adviser', true, 'proposal');
        $this->assign($assignedToOtherAdviser, $other, 'adviser', true, 'proposal');

        $adviserSections = $this->sections($this->dashboard($adviser)->assertOk());
        $this->assertSame(1, $adviserSections['assigned_reviews']['total']);
        $this->assertNotContains($assignedToOtherAdviser->id, array_column($adviserSections['assigned_reviews']['items'], 'research_document_id'));
        $this->assertSame([$revision->id], array_column($adviserSections['revision_requests']['items'], 'research_document_id'));

        $instructorSections = $this->sections($this->dashboard($instructor)->assertOk());
        $this->assertSame(1, $instructorSections['title_proposals']['total']);
        $this->assertSame([$proposal->id], array_column($instructorSections['title_proposals']['items'], 'research_document_id'));
        $this->assertSame(0, $instructorSections['pending_reviews']['total']);
    }

    public function test_panel_dashboard_is_scoped_to_active_assignments_and_submitted_evaluations(): void
    {
        Carbon::setTestNow('2026-08-25 12:00:00');
        try {
            $panelist = $this->user('panel');
            $otherPanelist = $this->user('panel');
            $pending = $this->document(['title' => 'Pending assigned study']);
            $completed = $this->document(['title' => 'Completed assigned study']);
            $foreign = $this->document(['title' => 'Foreign panel study']);
            $revoked = $this->document(['title' => 'Revoked panel study']);

            $this->assign($pending, $panelist, 'panel', true, 'proposal');
            $this->assign($completed, $panelist, 'panel', true, 'final');
            $this->assign($foreign, $otherPanelist, 'panel', true, 'proposal');
            $this->assign($revoked, $panelist, 'panel', false, 'proposal');

            Evaluation::query()->create([
                'research_document_id' => $completed->id,
                'panelist_id' => $panelist->id,
                'originality' => 4,
                'methodology' => 4,
                'clarity' => 4,
                'submitted_at' => '2026-08-21 08:00:00',
            ]);
            Evaluation::query()->create([
                'research_document_id' => $foreign->id,
                'panelist_id' => $otherPanelist->id,
                'originality' => 4,
                'methodology' => 4,
                'clarity' => 4,
                'submitted_at' => '2026-08-25 08:00:00',
            ]);
            $this->document([
                'submission_status' => 'archived',
                'archive_status' => 'archived',
                'visibility' => 'public',
            ]);

            $response = $this->dashboard($panelist)->assertOk();
            $projection = $response->json('data.panel');

            $this->assertSame(1, $projection['schema_version']);
            $this->assertSame([
                'assigned' => 2,
                'pending' => 1,
                'completed' => 1,
                'repository_references' => 1,
            ], $projection['counts']);
            $this->assertSame([$pending->id, $completed->id], array_column($projection['assignments'], 'research_document_id'));
            $this->assertSame(['pending', 'completed'], array_column($projection['assignments'], 'review_status'));
            $this->assertSame(['proposal', 'final'], array_column($projection['assignments'], 'defense_stage'));
            $this->assertNotContains($foreign->id, array_column($projection['recent_activity'], 'research_document_id'));
            $this->assertNotContains($revoked->id, array_column($projection['recent_activity'], 'research_document_id'));
            $this->assertContains('evaluation_submitted', array_column($projection['recent_activity'], 'type'));
            $this->assertContains('study_assigned', array_column($projection['recent_activity'], 'type'));
            $this->assertNull($this->dashboard($this->user('adviser'))->assertOk()->json('data.panel'));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_repository_preview_applies_archived_visibility_rules_and_omits_forbidden_fields(): void
    {
        $archivedRegistered = $this->document([
            'title' => 'Visible archive',
            'abstract' => 'Do not expose this abstract.',
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'registered_only',
        ]);
        $approvedPublic = $this->document([
            'title' => 'Approved public archive',
            'submission_status' => 'approved',
            'archive_status' => 'archived',
            'visibility' => 'public',
        ]);
        $private = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'private']);
        $wrongArchiveStatus = $this->document(['submission_status' => 'approved', 'archive_status' => 'pending_archiving', 'visibility' => 'public']);

        $sections = $this->sections($this->dashboard($this->user('panel'))->assertOk());
        $repository = $sections['repository_references'];

        $this->assertSame(2, $repository['total']);
        $this->assertEqualsCanonicalizing([$archivedRegistered->id, $approvedPublic->id], array_column($repository['items'], 'research_document_id'));
        $this->assertNotContains($private->id, array_column($repository['items'], 'research_document_id'));
        $this->assertNotContains($wrongArchiveStatus->id, array_column($repository['items'], 'research_document_id'));
        $this->assertSame([
            'research_document_id',
            'title',
            'research_stage',
            'submission_status',
            'archive_status',
            'visibility',
            'publication_year',
            'updated_at',
        ], array_keys($repository['items'][0]));
        $this->assertContains('registered_only', array_column($repository['items'], 'visibility'));
        $this->assertArrayNotHasKey('abstract', $repository['items'][0]);
        $this->assertArrayNotHasKey('comments', $repository['items'][0]);
        $this->assertArrayNotHasKey('files', $repository['items'][0]);
        $this->assertArrayNotHasKey('email', $repository['items'][0]);
        $this->assertArrayNotHasKey('audit_details', $repository['items'][0]);
    }

    public function test_research_office_queues_use_the_required_statuses(): void
    {
        $this->document(['submission_status' => 'submitted', 'institute' => 'Institute of Health Sciences']);
        $this->document(['submission_status' => 'under_review', 'institute' => 'Institute of Health Sciences']);
        $this->document(['submission_status' => 'draft', 'institute' => 'Institute of Computer Studies']);
        $this->document(['submission_status' => 'revision_required']);
        $this->document(['archive_status' => 'pending_archiving']);

        $response = $this->dashboard($this->user('research-office'))->assertOk();
        $sections = $this->sections($response);

        $this->assertSame(2, $sections['submission_queue']['total']);
        $this->assertSame(1, $sections['revision_requests']['total']);
        $this->assertSame(1, $sections['pending_archiving']['total']);
    }

    public function test_research_office_repository_total_matches_institute_analytics(): void
    {
        $office = $this->user('research-office');
        $this->document([
            'submission_status' => 'approved',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'institute' => 'Institute of Computer Studies',
        ]);
        $this->document([
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'registered_only',
            'institute' => 'Institute of Health Sciences',
        ]);
        $this->document([
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'institute' => null,
        ]);
        $this->document([
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'private',
            'institute' => 'Institute of Arts and Sciences',
        ]);

        $response = $this->dashboard($office)->assertOk();
        $sections = $this->sections($response);
        $overview = collect($response->json('data.institutional_overview'));

        $this->assertSame(3, $sections['archived_repository']['total']);
        $this->assertSame(3, $overview->sum('total'));
        $this->assertSame(1, $overview->firstWhere('institute', 'Institute of Computer Studies')['total']);
        $this->assertSame(1, $overview->firstWhere('institute', 'Institute of Health Sciences')['total']);
        $this->assertSame(1, $overview->firstWhere('institute', 'Unassigned / Other')['total']);
    }

    public function test_admin_aggregates_are_exact_and_unavailable_sections_remain_null(): void
    {
        $admin = $this->user('admin');
        $this->user('adviser', 'active');
        $this->user('instructor', 'invited');
        $this->user('panel', 'blocked');
        $this->document(['submitted_by' => $admin->id]);

        $adminSections = $this->sections($this->dashboard($admin)->assertOk());
        $this->assertSame(2, $adminSections['pending_accounts']['total']);
        $this->assertSame(1, $adminSections['recent_research']['total']);

        $panelSections = $this->sections($this->dashboard($this->user('panel'))->assertOk());
        $this->assertSame('ready', $panelSections['assigned_manuscripts']['state']);
        $this->assertSame(0, $panelSections['assigned_manuscripts']['total']);
        $this->assertNull($panelSections['assigned_manuscripts']['reason']);
        $this->assertSame([], $panelSections['assigned_manuscripts']['items']);
        $this->assertSame(0, $panelSections['repository_references']['total']);
        $this->assertNull($panelSections['repository_references']['reason']);
    }

    public function test_administrator_workflow_sections_use_exact_filters_without_leaking_private_fields(): void
    {
        $admin = $this->user('admin');
        $draft = $this->document(['submission_status' => 'draft']);
        $submitted = $this->document(['submission_status' => 'submitted']);
        $this->document(['submission_status' => 'under_review']);
        $this->document(['submission_status' => 'revision_required']);
        $validationResearch = $this->document(['submission_status' => 'draft']);
        $flaggedResearch = $this->document(['submission_status' => 'draft']);
        $this->document(['submission_status' => 'approved']);
        $archivedApprovedPrivate = $this->document(['submission_status' => 'approved', 'archive_status' => 'archived', 'visibility' => 'private', 'abstract' => 'Private abstract']);
        $archivedPublic = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);

        TitleValidation::query()->create(['research_document_id' => $validationResearch->id, 'validated_by' => $admin->id, 'validation_status' => 'pending']);
        TitleValidation::query()->create(['research_document_id' => $validationResearch->id, 'validated_by' => $admin->id, 'validation_status' => 'pending']);
        SimilarityResult::factory()->create(['source_research_id' => $flaggedResearch->id, 'matched_research_id' => $draft->id, 'title_similarity_score' => '0.800000000000', 'content_similarity_score' => '0.800000000000']);
        SimilarityResult::factory()->create(['source_research_id' => $flaggedResearch->id, 'matched_research_id' => $submitted->id, 'title_similarity_score' => '0.900000000000', 'content_similarity_score' => '0.900000000000']);

        $sections = $this->sections($this->dashboard($admin)->assertOk());

        $this->assertSame(3, $sections['draft_research']['total']);
        $this->assertSame(2, $sections['submission_queue']['total']);
        $this->assertSame(1, $sections['revision_required']['total']);
        $this->assertSame(1, $sections['pending_title_validations']['total']);
        $this->assertSame([$validationResearch->id], array_column($sections['pending_title_validations']['items'], 'research_document_id'));
        $this->assertSame(1, $sections['flagged_similarity']['total']);
        $this->assertSame([$flaggedResearch->id], array_column($sections['flagged_similarity']['items'], 'research_document_id'));
        $this->assertSame(1, $sections['approved_for_archiving']['total']);
        $this->assertSame(2, $sections['archived_repository']['total']);
        $this->assertEqualsCanonicalizing([$archivedApprovedPrivate->id, $archivedPublic->id], array_column($sections['archived_repository']['items'], 'research_document_id'));
        $privatePreview = collect($sections['archived_repository']['items'])->firstWhere('research_document_id', $archivedApprovedPrivate->id);
        $this->assertSame('private', $privatePreview['visibility']);
        $this->assertArrayNotHasKey('abstract', $privatePreview);
        $this->assertSame(9, $sections['recent_research']['total']);
    }

    public function test_similarity_queues_use_only_the_latest_pair_decision(): void
    {
        $admin = $this->user('admin');
        $source = $this->document();
        $matched = $this->document();

        SimilarityResult::factory()->create([
            'source_research_id' => $source->id, 'matched_research_id' => $matched->id,
            'title_similarity_score' => '0.800000000000', 'content_similarity_score' => '0.800000000000',
        ]);
        SimilarityResult::factory()->create([
            'source_research_id' => $source->id, 'matched_research_id' => $matched->id,
            'title_similarity_score' => '0.100000000000', 'content_similarity_score' => '0.100000000000',
        ]);
        $this->assertSame(0, $this->sections($this->dashboard($admin))['flagged_similarity']['total']);

        SimilarityResult::factory()->create([
            'source_research_id' => $source->id, 'matched_research_id' => $matched->id,
            'title_similarity_score' => '0.800000000000', 'content_similarity_score' => '0.800000000000',
        ]);
        $this->assertSame(1, $this->sections($this->dashboard($admin))['flagged_similarity']['total']);
    }

    public function test_research_previews_are_capped_ordered_and_not_cached(): void
    {
        $documents = collect(range(1, 11))->map(function (int $number): ResearchDocument {
            $document = $this->document(['title' => "Research {$number}"]);
            $document->forceFill(['updated_at' => now()->setMicrosecond(0)->subMinute($number)])->save();

            return $document->fresh();
        });
        $latestTie = $this->document(['title' => 'Latest tie']);
        $latestTie->forceFill(['updated_at' => now()->setMicrosecond(0)])->save();
        $sameTime = $this->document(['title' => 'Earlier ID tie']);
        $sameTime->forceFill(['updated_at' => now()->setMicrosecond(0)])->save();

        $response = $this->dashboard($this->user('admin'))
            ->assertOk()
            ->assertHeader('Cache-Control');
        $this->assertStringContainsString('private', $response->headers->get('Cache-Control'));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $recent = $this->sections($response)['recent_research'];

        $this->assertSame(13, $recent['total']);
        $this->assertCount(10, $recent['items']);
        $this->assertSame($sameTime->id, $recent['items'][0]['research_document_id']);
        $this->assertSame($latestTie->id, $recent['items'][1]['research_document_id']);
        $this->assertNotContains($documents->last()->id, array_column($recent['items'], 'research_document_id'));
    }

    public function test_dashboard_rejects_a_raw_admin_role_without_the_active_administrator_identity(): void
    {
        $rawAdmin = $this->user('admin');
        User::query()->whereKey($rawAdmin->id)->update(['is_admin' => false]);

        $this->dashboard($rawAdmin)
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
    }

    public function test_research_analytics_are_monthly_and_scoped_to_the_current_role(): void
    {
        Carbon::setTestNow('2026-08-22 12:00:00');
        try {
            $researcher = $this->user('researcher');
            $other = $this->user('researcher');

            $march = $this->document(['submitted_by' => $researcher->id]);
            $march->forceFill(['created_at' => '2026-03-10 10:00:00'])->save();
            $july = $this->document(['submitted_by' => $researcher->id]);
            $july->forceFill(['created_at' => '2026-07-15 10:00:00'])->save();
            $foreign = $this->document(['submitted_by' => $other->id]);
            $foreign->forceFill(['created_at' => '2026-07-16 10:00:00'])->save();
            $archived = $this->document(['submitted_by' => $researcher->id]);
            $archived->forceFill([
                'created_at' => '2026-02-01 10:00:00',
                'archived_at' => '2026-08-05 10:00:00',
            ])->save();
            foreach ([$march, $july, $archived] as $document) {
                $this->assignResearcher($document, $researcher);
            }

            $analytics = $this->dashboard($researcher)->assertOk()->json('data.analytics');

            $this->assertSame('Research activity', $analytics['title']);
            $this->assertSame('Last 6 months', $analytics['period']);
            $this->assertSame(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'], array_column($analytics['series'][0]['points'], 'label'));
            $this->assertSame([1, 0, 0, 0, 1, 0], array_column($analytics['series'][0]['points'], 'value'));
            $this->assertSame([0, 0, 0, 0, 0, 1], array_column($analytics['series'][1]['points'], 'value'));
            $this->assertSame('Created', $analytics['series'][0]['label']);
            $this->assertSame('Archived', $analytics['series'][1]['label']);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_coordinator_dashboard_does_not_publish_misleading_research_analytics(): void
    {
        $this->document(['created_at' => now()]);

        $this->dashboard($this->user('coordinator'))
            ->assertOk()
            ->assertJsonPath('data.analytics', null);
    }

    public function test_research_office_analytics_include_all_research_activity(): void
    {
        Carbon::setTestNow('2026-08-22 12:00:00');
        try {
            $this->document([
                'submission_status' => 'archived',
                'archive_status' => 'archived',
                'created_at' => '2026-08-05 10:00:00',
            ]);

            $analytics = $this->dashboard($this->user('research-office'))
                ->assertOk()
                ->json('data.analytics');

            $this->assertSame(1, $analytics['series'][0]['points'][5]['value']);
        } finally {
            Carbon::setTestNow();
        }
    }

    private function user(string $role, string $accessStatus = 'active'): User
    {
        return User::factory()->create([
            'role' => $role,
            'access_status' => $accessStatus,
            'institute' => $role === 'coordinator' ? 'Institute of Computer Studies' : null,
        ]);
    }

    private function document(array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create($attributes);
    }

    private function assign(ResearchDocument $document, User $reviewer, string $role, bool $active = true, ?string $defenseType = null): void
    {
        ReviewAssignment::query()->create([
            'research_document_id' => $document->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => $this->user('research-office')->id,
            'review_role' => $role,
            'is_active' => $active,
            'defense_type' => $defenseType,
        ]);
    }

    private function assignAt(ResearchDocument $document, User $reviewer, string $role, bool $active, string $createdAt, string $defenseType = 'proposal'): ReviewAssignment
    {
        $assignment = ReviewAssignment::query()->create([
            'research_document_id' => $document->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => $this->user('research-office')->id,
            'review_role' => $role,
            'is_active' => $active,
            'defense_type' => $defenseType,
        ]);
        $assignment->forceFill(['created_at' => $createdAt, 'updated_at' => $createdAt])->saveQuietly();

        return $assignment;
    }

    private function editorReview(ResearchDocument $document, User $editor, string $type, string $status, string $occurredAt): void
    {
        DB::table('research_review_records')->insert([
            'source_type' => 'editor_review',
            'source_id' => DB::table('research_review_records')->max('source_id') + 1,
            'review_type' => $type,
            'research_document_id' => $document->id,
            'actor_id' => $editor->id,
            'status' => $status,
            'submitted_at' => $occurredAt,
            'resolved_at' => $status === 'completed' ? $occurredAt : null,
            'created_at' => $occurredAt,
            'updated_at' => $occurredAt,
        ]);
    }

    private function assignResearcher(ResearchDocument $document, User $researcher): void
    {
        $instructor = $this->user('instructor');
        $sectionId = DB::table('class_sections')->insertGetId([
            'instructor_id' => $instructor->id,
            'name' => 'Assigned Research',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $document->update(['section_id' => $sectionId]);
        DB::table('class_section_members')->insert([
            'class_section_id' => $sectionId,
            'research_document_id' => $document->id,
            'user_id' => $researcher->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function dashboard(User $user)
    {
        return $this->withSession(['user_id' => $user->id])->getJson('/api/dashboard');
    }

    private function sections($response): array
    {
        return collect($response->json('data.sections'))->keyBy('key')->all();
    }
}
