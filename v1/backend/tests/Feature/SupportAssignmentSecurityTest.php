<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Models\UserRole;
use App\Services\ResearchProjectTeamService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupportAssignmentSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_eligible_search_is_private_scoped_and_filters_exact_active_candidates(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $nameMatch = User::factory()->create([
            'role' => 'research_editor',
            'first_name' => 'Ada',
            'middle_name' => 'Marie',
            'last_name' => 'Lovelace',
            'email' => 'ada.editor@example.test',
        ]);
        $emailMatch = User::factory()->create([
            'role' => 'research_editor',
            'first_name' => 'Email',
            'last_name' => 'Only',
            'email' => 'match.editor@example.test',
        ]);
        $literalMatch = User::factory()->create([
            'role' => 'research_editor',
            'first_name' => 'Percent%_Literal',
            'last_name' => 'Editor',
        ]);
        $current = User::factory()->create(['role' => 'research_editor', 'first_name' => 'Current', 'last_name' => 'Editor']);
        $pending = User::factory()->create(['role' => 'research_editor', 'first_name' => 'Pending', 'last_name' => 'Editor']);
        $inactive = User::factory()->create(['role' => 'research_editor', 'first_name' => 'Inactive', 'last_name' => 'Editor']);
        $deleted = User::factory()->create(['role' => 'research_editor', 'first_name' => 'Deleted', 'last_name' => 'Editor']);
        $inactive->update(['access_status' => 'blocked']);
        $deleted->delete();
        $this->assignment($research, $current, 'accepted', true);
        $this->assignment($research, $pending, 'requested', false, true);
        $otherRole = User::factory()->create(['role' => 'librarian', 'first_name' => 'Cross', 'last_name' => 'Role']);
        $this->assignment($research, $otherRole, 'accepted', true);

        $this->as($owner)->getJson($this->eligibleUrl($research, 'research_editor', 'a'))
            ->assertOk()
            ->assertExactJson(['data' => []])
            ->assertHeader('cache-control', 'no-store, private');
        $this->as($owner)->getJson($this->eligibleUrl($research, 'research_editor', ''))
            ->assertOk()
            ->assertJsonFragment(['id' => $nameMatch->id])
            ->assertJsonFragment(['id' => $emailMatch->id])
            ->assertJsonMissing(['id' => $current->id])
            ->assertJsonMissing(['id' => $pending->id])
            ->assertJsonMissing(['id' => $inactive->id])
            ->assertJsonMissing(['id' => $deleted->id]);
        $route = collect(app('router')->getRoutes()->getRoutes())
            ->first(fn ($candidate) => $candidate->uri() === 'api/support-assignments/eligible');
        $this->assertNotNull($route);
        $this->assertContains('throttle:support-assignment-search', $route->gatherMiddleware());
        $this->as($owner)->getJson($this->eligibleUrl($research, 'research_editor', 'Ada Love'))
            ->assertOk()
            ->assertJsonFragment(['id' => $nameMatch->id]);
        $this->as($owner)->getJson($this->eligibleUrl($research, 'research_editor', 'MATCH.EDITOR@EXAMPLE.TEST'))
            ->assertOk()
            ->assertJsonFragment(['id' => $emailMatch->id]);
        $this->as($owner)->getJson($this->eligibleUrl($research, 'research_editor', '%_'))
            ->assertOk()
            ->assertJsonFragment(['id' => $literalMatch->id])
            ->assertJsonMissing(['id' => $nameMatch->id]);

        $response = $this->as($owner)->getJson($this->eligibleUrl($research, 'research_editor', 'Editor'));
        $response->assertOk()
            ->assertJsonMissing(['id' => $current->id])
            ->assertJsonMissing(['id' => $pending->id])
            ->assertJsonMissing(['id' => $inactive->id])
            ->assertJsonMissing(['id' => $deleted->id]);
        $this->as($owner)->getJson($this->eligibleUrl($research, 'librarian', 'Cross'))
            ->assertOk()->assertJsonMissing(['id' => $otherRole->id]);

        UserRole::query()->where('slug', 'research_editor')->update(['is_active' => false]);
        $this->as($owner)->getJson($this->eligibleUrl($research, 'research_editor', 'Ada'))
            ->assertOk()
            ->assertExactJson(['data' => []]);

        $outsider = User::factory()->create(['role' => 'researcher']);
        $this->as($outsider)->getJson($this->eligibleUrl($research, 'research_editor', 'Ada'))->assertForbidden();
    }

    public function test_eligible_search_is_limited_to_twenty_results(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        User::factory()->count(21)->create(['role' => 'librarian', 'first_name' => 'Searchable', 'last_name' => 'Support']);

        $this->as($owner)->getJson($this->eligibleUrl($research, 'librarian', 'Searchable'))
            ->assertOk()
            ->assertJsonCount(20, 'data');
    }

    public function test_assignments_project_active_and_pending_requests_without_replacing_current(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $current = User::factory()->create(['role' => 'statistician']);
        $pending = User::factory()->create(['role' => 'statistician']);
        $this->assignment($research, $current, 'accepted', true);
        $this->assignment($research, $pending, 'requested', false, true);

        $this->as($owner)->getJson('/api/research/'.$research->id.'/support-assignments')
            ->assertOk()
            ->assertHeader('cache-control', 'no-store, private')
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['user_id' => $current->id, 'status' => 'accepted'])
            ->assertJsonFragment(['user_id' => $pending->id, 'status' => 'requested']);
    }

    public function test_submission_revalidates_candidate_eligibility_without_partial_assignment(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $ineligible = User::factory()->create(['role' => 'librarian']);
        $ineligible->update(['access_status' => 'blocked']);

        $this->as($owner)->postJson('/api/research/'.$research->id.'/support-assignments', [
            'user_id' => $ineligible->id,
            'assignment_role' => 'librarian',
        ], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user_id');

        $this->assertSame(0, ReviewAssignment::query()->where('research_document_id', $research->id)->count());
    }

    public function test_pending_request_guard_rejects_duplicates_and_database_slot_races(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $first = User::factory()->create(['role' => 'research_editor']);
        $second = User::factory()->create(['role' => 'research_editor']);
        $third = User::factory()->create(['role' => 'research_editor']);
        $this->assignment($research, $first, 'requested', false, true);

        $this->as($owner)->postJson('/api/research/'.$research->id.'/support-assignments', [
            'user_id' => $second->id,
            'assignment_role' => 'research_editor',
        ], $this->origin())
            ->assertConflict();

        $this->expectException(QueryException::class);
        $this->assignment($research, $third, 'requested', false, true);
    }

    public function test_migration_backfills_a_unique_legacy_pending_slot_and_refuses_duplicate_legacy_slots(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $single = User::factory()->create(['role' => 'statistician']);
        $assignment = $this->assignment($research, $single, 'requested', false);
        $assignment->update(['support_pending_slot' => null]);

        (require database_path('migrations/2026_11_15_000001_add_support_assignment_pending_slot.php'))->up();
        $this->assertTrue((bool) $assignment->refresh()->support_pending_slot);

        foreach (User::factory()->count(2)->create(['role' => 'librarian']) as $index => $librarian) {
            ReviewAssignment::query()->create([
                'research_document_id' => $research->id,
                'reviewer_id' => $librarian->id,
                'assigned_by' => $owner->id,
                'review_role' => 'librarian',
                'status' => 'requested',
                'is_active' => false,
                'support_pending_slot' => null,
                'support_history_slot' => 'legacy-'.$index,
            ]);
        }

        $this->expectException(\RuntimeException::class);
        (require database_path('migrations/2026_11_15_000001_add_support_assignment_pending_slot.php'))->up();
    }

    public function test_replacement_lifecycle_keeps_current_on_decline_and_replaces_on_accept(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $current = User::factory()->create(['role' => 'research_editor']);
        $declining = User::factory()->create(['role' => 'research_editor']);
        $accepting = User::factory()->create(['role' => 'research_editor']);
        $currentAssignment = $this->assignment($research, $current, 'accepted', true);

        $decliningRequest = $this->request($owner, $research, $declining, true);
        $this->assertSame('accepted', $currentAssignment->refresh()->status);
        $this->assertTrue($currentAssignment->is_active);
        $this->as($declining)->patchJson('/api/support-assignments/'.$decliningRequest->id.'/respond', ['decision' => 'decline'], $this->origin())->assertOk();
        $this->assertSame('accepted', $currentAssignment->refresh()->status);
        $this->assertTrue($currentAssignment->is_active);

        $acceptingRequest = $this->request($owner, $research, $accepting, true);
        $this->as($accepting)->patchJson('/api/support-assignments/'.$acceptingRequest->id.'/respond', ['decision' => 'accept'], $this->origin())->assertOk();

        $this->assertSame('replaced', $currentAssignment->refresh()->status);
        $this->assertFalse($currentAssignment->is_active);
        $this->assertSame('accepted', $acceptingRequest->refresh()->status);
        $this->assertTrue($acceptingRequest->is_active);
    }

    public function test_declined_support_assignee_can_be_requested_again_and_terminal_rows_are_not_in_the_inbox(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $editor = User::factory()->create(['role' => 'research_editor']);

        $first = $this->request($owner, $research, $editor, false);
        $this->as($editor)->patchJson('/api/support-assignments/'.$first->id.'/respond', ['decision' => 'decline'], $this->origin())->assertOk();
        $this->request($owner, $research, $editor, false);

        $this->as($editor)->getJson('/api/support-assignments/inbox')
            ->assertOk()
            ->assertHeader('cache-control', 'no-store, private')
            ->assertJsonCount(1, 'data')
            ->assertJsonMissing(['id' => $first->id]);
    }

    public function test_replacement_rejects_a_stale_current_assignment_id(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $current = User::factory()->create(['role' => 'librarian']);
        $replacement = User::factory()->create(['role' => 'librarian']);
        $this->assignment($research, $current, 'accepted', true);

        $this->as($owner)->postJson('/api/research/'.$research->id.'/support-assignments', [
            'user_id' => $replacement->id,
            'assignment_role' => 'librarian',
            'replace_current' => true,
            'expected_current_assignment_id' => 999999,
        ], $this->origin())->assertConflict();
        $this->assertDatabaseMissing('research_review_assignments', ['reviewer_id' => $replacement->id]);
    }

    public function test_team_projection_is_research_wide_and_keeps_active_and_pending_support_separate(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $section = ClassSection::query()->create(['instructor_id' => User::factory()->create(['role' => 'instructor'])->id, 'name' => 'Support team']);
        $research = ResearchDocument::factory()->create(['submitted_by' => $owner->id, 'section_id' => $section->id]);
        $active = User::factory()->create(['role' => 'research_editor']);
        $pending = User::factory()->create(['role' => 'research_editor']);
        $this->assignment($research, $active, 'accepted', true);
        $this->assignment($research, $pending, 'requested', false, true);
        $adviser = User::factory()->create(['role' => 'adviser']);
        ResearchProjectTeamMember::query()->create(['research_document_id' => $research->id, 'user_id' => $adviser->id, 'team_role' => 'adviser', 'defense_type' => 'final', 'assigned_by' => $owner->id]);

        $team = app(ResearchProjectTeamService::class)->get($section, $research, 'final');
        $this->assertSame($active->id, $team['support_assignments']['editor']['user_id']);
        $this->assertSame($pending->id, $team['pending_support_assignments']['editor']['user_id']);
        $this->assertSame('accepted', $team['support_assignments']['editor']['status']);
    }

    private function research(User $owner): ResearchDocument
    {
        $category = Category::query()->create([
            'name' => 'Support '.fake()->unique()->word(),
            'slug' => 'support-'.fake()->unique()->numberBetween(1, 999999),
        ]);
        $research = ResearchDocument::factory()->create(['submitted_by' => $owner->id, 'category_id' => $category->id]);
        $this->assignResearcherToDocument($owner, $research);

        return $research;
    }

    private function assignment(ResearchDocument $research, User $reviewer, string $status, bool $active, bool $pendingSlot = false): ReviewAssignment
    {
        return ReviewAssignment::query()->create([
            'research_document_id' => $research->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => $research->submitted_by,
            'review_role' => $reviewer->role,
            'status' => $status,
            'is_active' => $active,
            'support_pending_slot' => $pendingSlot,
        ]);
    }

    private function request(User $owner, ResearchDocument $research, User $candidate, bool $replaceCurrent): ReviewAssignment
    {
        $currentId = $replaceCurrent ? ReviewAssignment::query()->where('research_document_id', $research->id)
            ->where('review_role', $candidate->role)->where('is_active', true)->value('id') : null;
        $data = $this->as($owner)->postJson('/api/research/'.$research->id.'/support-assignments', [
            'user_id' => $candidate->id,
            'assignment_role' => $candidate->role,
            'replace_current' => $replaceCurrent,
            'expected_current_assignment_id' => $currentId,
        ], $this->origin())->assertCreated()->json('data');

        return ReviewAssignment::query()->findOrFail($data['id']);
    }

    private function eligibleUrl(ResearchDocument $research, string $role, string $search): string
    {
        return '/api/support-assignments/eligible?'.http_build_query([
            'research_document_id' => $research->id,
            'role' => $role,
            'search' => $search,
        ]);
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
