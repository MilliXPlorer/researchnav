<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\DefenseSchedule;
use App\Models\MethodologyReview;
use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class RoleWorkspaceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_role_endpoints_require_the_matching_active_role(): void
    {
        $routes = [
            ['get', '/api/adviser/advisees', 'adviser'],
            ['get', '/api/instructor/submissions', 'instructor'],
            ['get', '/api/instructor/sections', 'instructor'],
            ['get', '/api/panel/assignments', 'panel'],
            ['get', '/api/statistician/queue', 'statistician'],
            ['get', '/api/coordinator/schedules', 'coordinator'],
            ['get', '/api/librarian/archiving-queue', 'librarian'],
            ['get', '/api/office/compliance', 'research-office'],
            ['get', '/api/academics/library', 'academics'],
        ];

        foreach ($routes as [$method, $path, $role]) {
            $this->app['session']->flush();
            $this->getJson($path)->assertUnauthorized()->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);
            $this->as($this->user(['role' => 'researcher']))->{$method.'Json'}($path)
                ->assertForbidden()
                ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
            $this->as($this->user(['role' => $role]))->{$method.'Json'}($path)->assertOk();
        }

        $this->as($this->user(['role' => 'adviser', 'access_status' => 'invited']))->getJson('/api/adviser/advisees')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);
    }

    public function test_coordinator_schedules_can_be_created_listed_and_resolved(): void
    {
        $coordinator = $this->user(['role' => 'coordinator']);
        $research = $this->document('draft');
        $future = now()->addDays(3)->toISOString();

        $this->as($coordinator)->getJson('/api/coordinator/schedules')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data', []);
        $this->as($coordinator)->postJson('/api/coordinator/schedules', ['research_document_id' => $research->id, 'scheduled_at' => $future, 'room' => 'Room 302'], $this->origin())
            ->assertCreated()
            ->assertJsonPath('data.status', 'scheduled')
            ->assertJsonPath('data.title', $research->title);
        $this->assertDatabaseHas('monitoring_logs', ['activity_type' => 'DEFENSE_SCHEDULED', 'research_document_id' => $research->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'DEFENSE_SCHEDULED']);

        $schedule = DefenseSchedule::query()->firstOrFail();
        $this->as($coordinator)->patchJson('/api/coordinator/schedules/'.$schedule->id, ['status' => 'completed'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');
        $this->as($coordinator)->patchJson('/api/coordinator/schedules/'.$schedule->id, ['status' => 'nonsense'], $this->origin())
            ->assertUnprocessable();
        $this->as($coordinator)->postJson('/api/coordinator/schedules', ['research_document_id' => $research->id, 'scheduled_at' => now()->subDay()->toISOString()], $this->origin())
            ->assertStatus(400)
            ->assertJsonPath('error', 'INVALID_REQUEST');
    }

    public function test_panel_schedule_is_scoped_to_assigned_manuscripts(): void
    {
        $panelist = $this->user(['role' => 'panel']);
        $office = $this->user(['role' => 'research-office']);
        $assigned = $this->document('submitted');
        $other = $this->document('submitted');
        $this->assign($office, $assigned, $panelist, 'panel');
        DefenseSchedule::query()->create([
            'research_document_id' => $assigned->id,
            'created_by' => $office->id,
            'scheduled_at' => now()->addDays(2),
            'status' => 'scheduled',
        ]);
        DefenseSchedule::query()->create([
            'research_document_id' => $other->id,
            'created_by' => $office->id,
            'scheduled_at' => now()->addDays(2),
            'status' => 'scheduled',
        ]);

        $response = $this->as($panelist)->getJson('/api/panel/schedule');
        $response->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.research_document_id', $assigned->id);
    }

    public function test_panel_evaluations_are_submit_once_and_rated(): void
    {
        $panelist = $this->user(['role' => 'panel']);
        $office = $this->user(['role' => 'research-office']);
        $research = $this->document('submitted');
        $this->assign($office, $research, $panelist, 'panel');

        $this->as($panelist)->postJson('/api/panel/evaluations', [
            'research_document_id' => $research->id,
            'originality' => 4, 'methodology' => 5, 'clarity' => 3, 'comments' => 'Strong methods.',
        ], $this->origin())->assertCreated()->assertJsonPath('data.originality', 4);
        $this->assertDatabaseHas('monitoring_logs', ['activity_type' => 'EVALUATION_SUBMITTED']);

        $this->as($panelist)->postJson('/api/panel/evaluations', [
            'research_document_id' => $research->id,
            'originality' => 2, 'methodology' => 2, 'clarity' => 2,
        ], $this->origin())->assertUnprocessable();
        $this->assertDatabaseCount('evaluations', 1);

        $this->as($panelist)->postJson('/api/panel/evaluations', [
            'research_document_id' => $research->id,
            'originality' => 6, 'methodology' => 2, 'clarity' => 2,
        ], $this->origin())->assertStatus(400)->assertJsonPath('error', 'INVALID_REQUEST');
        $unassigned = $this->document('submitted');
        $this->as($panelist)->postJson('/api/panel/evaluations', [
            'research_document_id' => $unassigned->id,
            'originality' => 2, 'methodology' => 2, 'clarity' => 2,
        ], $this->origin())->assertUnprocessable();

        $this->as($panelist)->getJson('/api/panel/history')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title', $research->title);
    }

    public function test_statistician_queue_checklist_and_signoff_lifecycle(): void
    {
        $statistician = $this->user(['role' => 'statistician']);
        $office = $this->user(['role' => 'research-office']);
        $research = $this->document('under_review');
        $this->assign($office, $research, $statistician, 'statistician');

        $this->as($statistician)->getJson('/api/statistician/queue')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $research->id);

        $this->as($statistician)->putJson('/api/statistician/methodology/'.$research->id, [
            'design_fit' => true, 'sample_size' => true, 'instrument_validity' => false, 'analysis_plan' => true,
        ], $this->origin())->assertOk()->assertJsonPath('data.review_status', 'in_progress');
        $this->assertDatabaseHas('audit_logs', ['action' => 'METHODOLOGY_CHECKLIST_UPDATED']);

        $this->as($statistician)->postJson('/api/statistician/methodology/'.$research->id.'/sign-off', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.review_status', 'signed_off');
        $this->assertNotNull(MethodologyReview::query()->firstOrFail()->signed_off_at);
        $this->assertDatabaseHas('monitoring_logs', ['activity_type' => 'METHODOLOGY_SIGNED_OFF']);

        $this->as($statistician)->postJson('/api/statistician/methodology/'.$research->id.'/return', ['remarks' => 'Need the sampling plan.'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.review_status', 'returned_for_clarification');

        $this->as($statistician)->getJson('/api/statistician/signoffs')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_statistician_cannot_review_unassigned_documents(): void
    {
        $statistician = $this->user(['role' => 'statistician']);
        $research = $this->document('under_review');

        $this->as($statistician)->putJson('/api/statistician/methodology/'.$research->id, ['design_fit' => true], $this->origin())
            ->assertUnprocessable();
        $this->as($statistician)->postJson('/api/statistician/methodology/'.$research->id.'/sign-off', [], $this->origin())
            ->assertUnprocessable();
    }

    public function test_adviser_workspace_endpoints_return_assignment_scoped_data(): void
    {
        $adviser = $this->user(['role' => 'adviser']);
        $office = $this->user(['role' => 'research-office']);
        $student = $this->user(['role' => 'researcher', 'first_name' => 'Filjoy', 'last_name' => 'Santos']);
        $assigned = $this->document('submitted', $student);
        $other = $this->document('submitted');
        $this->assign($office, $assigned, $adviser, 'adviser');
        SimilarityResult::query()->create([
            'source_research_id' => $assigned->id,
            'matched_research_id' => $other->id,
            'source_title' => $assigned->title,
            'matched_title' => $other->title,
            'title_similarity_score' => '0.850000000000',
            'content_similarity_score' => '0.850000000000',
            'algorithm_version' => 'title-content-weighted-v1',
            'analysis_type' => 'title',
            'analyzed_at' => now(),
        ]);
        $assigned->feedbackComments()->create([
            'user_id' => $adviser->id,
            'comment' => 'Please strengthen the abstract.',
            'feedback_type' => 'revision_request',
            'feedback_status' => 'open',
        ]);

        $this->as($adviser)->getJson('/api/adviser/advisees')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Filjoy Santos')
            ->assertJsonPath('data.0.documents_count', 1);
        $this->as($adviser)->getJson('/api/adviser/pending-reviews')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $assigned->id);
        $this->as($adviser)->getJson('/api/adviser/similarity-alerts')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.matched_research_id', $other->id)
            ->assertJsonPath('data.0.overall_similarity_score', '0.850000000000')
            ->assertJsonPath('data.0.adviser_review_required', true);
        $this->as($adviser)->getJson('/api/adviser/feedback-history')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.feedback_type', 'revision_request');
    }

    public function test_adviser_pending_reviews_exclude_researcher_revision_work_and_feedback_requires_an_active_assignment(): void
    {
        $adviser = $this->user(['role' => 'adviser']);
        $office = $this->user(['role' => 'research-office']);
        $awaitingReview = $this->document('under_review');
        $awaitingResearcher = $this->document('revision_required');
        $this->assign($office, $awaitingReview, $adviser, 'adviser');
        $this->assign($office, $awaitingResearcher, $adviser, 'adviser');
        $awaitingReview->feedbackComments()->create([
            'user_id' => $adviser->id,
            'comment' => 'Active assignment feedback.',
            'feedback_type' => 'comment',
            'feedback_status' => 'open',
        ]);

        $this->as($adviser)->getJson('/api/adviser/pending-reviews')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $awaitingReview->id);

        $awaitingReview->reviewAssignments()->where('reviewer_id', $adviser->id)->update(['is_active' => false]);

        $this->as($adviser)->getJson('/api/adviser/feedback-history')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_instructor_sections_title_proposals_and_class_reports(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $office = $this->user(['role' => 'research-office']);
        $student = $this->user(['role' => 'researcher']);
        $proposal = $this->document('submitted', $student);
        $this->assign($office, $proposal, $instructor, 'instructor');

        $this->as($instructor)->postJson('/api/instructor/sections', ['name' => 'BSCS 4A', 'academic_year' => '2025-2026'], $this->origin())
            ->assertCreated()
            ->assertJsonPath('data.name', 'BSCS 4A');
        $section = ClassSection::query()->firstOrFail();
        $this->assertDatabaseHas('audit_logs', ['action' => 'CLASS_SECTION_CREATED']);

        $this->as($instructor)->putJson('/api/instructor/sections/'.$section->id.'/documents', ['research_document_ids' => [$proposal->id]], $this->origin())
            ->assertOk();
        $this->assertDatabaseHas('research_documents', ['id' => $proposal->id, 'section_id' => $section->id]);

        $this->as($instructor)->getJson('/api/instructor/sections')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.documents_count', 1);
        $this->as($instructor)->getJson('/api/instructor/sections/'.$section->id.'/documents')
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $this->as($instructor)->getJson('/api/instructor/title-proposals')
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $this->as($instructor)->getJson('/api/instructor/submissions')
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $proposal->id)
            ->assertJsonPath('data.0.research_stage', $proposal->research_stage);

        $this->as($instructor)->postJson('/api/research/'.$proposal->id.'/recommendation', [
            'validation_status' => 'approved',
            'validated_by' => $office->id,
        ], $this->origin())
            ->assertUnprocessable();
        $this->as($instructor)->postJson('/api/research/'.$proposal->id.'/validation', [], $this->origin())
            ->assertForbidden();
        $this->as($instructor)->postJson('/api/research/'.$proposal->id.'/recommendation', [
            'validation_status' => 'approved',
        ], $this->origin())
            ->assertCreated()
            ->assertJsonPath('data.validated_by', $instructor->id)
            ->assertJsonPath('data.validation_status', 'approved');
        $this->assertDatabaseHas('research_documents', ['id' => $proposal->id, 'submission_status' => 'submitted']);
        $this->as($instructor)->patchJson('/api/research/'.$proposal->id.'/status', [
            'submission_status' => 'under_review',
        ], $this->origin())->assertOk();
        $this->as($instructor)->patchJson('/api/research/'.$proposal->id.'/status', [
            'submission_status' => 'approved',
        ], $this->origin())->assertForbidden();
        $this->as($instructor)->getJson('/api/instructor/class-reports')
            ->assertOk()
            ->assertJsonPath('data.0.documents_count', 1);
        $this->as($instructor)->getJson('/api/instructor/similarity-overview')->assertOk();

        $otherInstructor = $this->user(['role' => 'instructor']);
        $this->as($otherInstructor)->patchJson('/api/instructor/sections/'.$section->id, ['name' => 'Hijacked'], $this->origin())
            ->assertUnprocessable();
        $this->as($otherInstructor)->getJson('/api/instructor/sections/'.$section->id.'/documents')->assertForbidden();

        $instructor->update(['role' => 'panel']);
        $this->as($instructor)->getJson('/api/research/'.$proposal->id.'/feedback')->assertForbidden();
        $this->as($instructor)->getJson('/api/research')->assertOk()->assertJsonMissing(['id' => $proposal->id]);
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

    private function assign(User $office, ResearchDocument $document, User $reviewer, string $role): void
    {
        $document->reviewAssignments()->create([
            'reviewer_id' => $reviewer->id,
            'assigned_by' => $office->id,
            'review_role' => $role,
            'is_active' => true,
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
