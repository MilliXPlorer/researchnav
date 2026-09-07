<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
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

    public function test_researchers_only_see_the_records_they_submitted(): void
    {
        $researcher = $this->user('researcher');
        $other = $this->user('researcher');

        $ownDraft = $this->document(['submitted_by' => $researcher->id, 'submission_status' => 'draft']);
        $ownRevision = $this->document(['submitted_by' => $researcher->id, 'submission_status' => 'revision_required']);
        $foreignDraft = $this->document(['submitted_by' => $other->id, 'submission_status' => 'draft']);

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
            'admin' => ['active_accounts', 'pending_accounts', 'audit_events', 'draft_research', 'submission_queue', 'revision_required', 'pending_title_validations', 'flagged_similarity', 'approved_for_archiving', 'archived_repository', 'recent_research'],
            'researcher' => ['my_drafts', 'my_under_review', 'my_revision_required', 'my_flagged_similarity', 'my_approved', 'my_archived', 'repository_references'],
            'adviser' => ['assigned_reviews', 'revision_requests', 'repository_references'],
            'instructor' => ['title_proposals', 'pending_reviews', 'repository_references'],
            'panel' => ['assigned_manuscripts', 'defense_schedule', 'repository_references'],
            'statistician' => ['methodology_reviews', 'signoffs', 'completed_references'],
            'coordinator' => ['active_instructors', 'invited_instructors', 'blocked_instructors', 'schedules', 'duplicate_flags'],
            'librarian' => ['archiving_queue', 'metadata_validation', 'repository_records'],
            'research-office' => ['submission_queue', 'revision_requests', 'pending_archiving', 'archived_repository'],
            'academics' => ['repository_references', 'saved_library', 'recommendations'],
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

        $this->assign($assigned, $adviser, 'adviser');
        $this->assign($revision, $adviser, 'adviser');
        $this->assign($proposal, $instructor, 'instructor');
        $this->assign($inactive, $adviser, 'adviser', false);
        $this->assign($assigned, $other, 'adviser');
        $this->assign($assignedToOtherAdviser, $other, 'adviser');

        $adviserSections = $this->sections($this->dashboard($adviser)->assertOk());
        $this->assertSame(1, $adviserSections['assigned_reviews']['total']);
        $this->assertNotContains($assignedToOtherAdviser->id, array_column($adviserSections['assigned_reviews']['items'], 'research_document_id'));
        $this->assertSame([$revision->id], array_column($adviserSections['revision_requests']['items'], 'research_document_id'));

        $instructorSections = $this->sections($this->dashboard($instructor)->assertOk());
        $this->assertSame(1, $instructorSections['title_proposals']['total']);
        $this->assertSame([$proposal->id], array_column($instructorSections['title_proposals']['items'], 'research_document_id'));
        $this->assertSame(0, $instructorSections['pending_reviews']['total']);
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
        $this->document(['submission_status' => 'submitted']);
        $this->document(['submission_status' => 'under_review']);
        $this->document(['submission_status' => 'revision_required']);
        $this->document(['archive_status' => 'pending_archiving']);
        $this->document(['submission_status' => 'draft']);

        $sections = $this->sections($this->dashboard($this->user('research-office'))->assertOk());

        $this->assertSame(2, $sections['submission_queue']['total']);
        $this->assertSame(1, $sections['revision_requests']['total']);
        $this->assertSame(1, $sections['pending_archiving']['total']);
    }

    public function test_admin_aggregates_are_exact_and_unavailable_sections_remain_null(): void
    {
        $admin = $this->user('admin');
        $this->user('adviser', 'active');
        $this->user('instructor', 'invited');
        $this->user('panel', 'blocked');
        $this->document(['submitted_by' => $admin->id]);
        AuditLog::query()->create(['user_id' => $admin->id, 'action' => 'dashboard.viewed']);

        $adminSections = $this->sections($this->dashboard($admin)->assertOk());
        $this->assertSame(2, $adminSections['active_accounts']['total']);
        $this->assertSame(2, $adminSections['pending_accounts']['total']);
        $this->assertSame(1, $adminSections['audit_events']['total']);
        $this->assertSame(1, $adminSections['recent_research']['total']);
        $this->assertSame([], $adminSections['audit_events']['items']);

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

    private function user(string $role, string $accessStatus = 'active'): User
    {
        return User::factory()->create(['role' => $role, 'access_status' => $accessStatus]);
    }

    private function document(array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create($attributes);
    }

    private function assign(ResearchDocument $document, User $reviewer, string $role, bool $active = true): void
    {
        ReviewAssignment::query()->create([
            'research_document_id' => $document->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => $this->user('research-office')->id,
            'review_role' => $role,
            'is_active' => $active,
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
