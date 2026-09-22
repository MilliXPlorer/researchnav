<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class InstructorProjectTeamTest extends TestCase
{
    use RefreshDatabase;

    public function test_section_owner_can_replace_a_complete_project_team(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2 - Section 2']);
        $document = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $adviser = $this->user(['role' => 'adviser']);
        $representative = $this->user(['role' => 'research-office']);
        $chair = $this->user(['role' => 'panel']);
        $panel1 = $this->user(['role' => 'panel']);
        $panel2 = $this->user(['role' => 'panel']);
        $panel3 = $this->user(['role' => 'panel']);

        $this->as($instructor)->putJson($this->teamUrl($section, $document), [
            'defense_type' => 'proposal',
            'adviser_id' => $adviser->id,
            'research_office_representative_id' => $representative->id,
            'chair_id' => $chair->id,
            'panel_member_ids' => [$panel1->id, $panel2->id, $panel3->id],
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.complete', true)
            ->assertJsonPath('data.instructor.user_id', $instructor->id)
            ->assertJsonPath('data.adviser.user_id', $adviser->id)
            ->assertJsonPath('data.research_office_representative.user_id', $representative->id)
            ->assertJsonPath('data.chair.user_id', $chair->id)
            ->assertJsonPath('data.panel_members.0.user_id', $panel1->id)
            ->assertJsonPath('data.panel_members.1.user_id', $panel2->id)
            ->assertJsonPath('data.panel_members.2.user_id', $panel3->id);

        $this->assertDatabaseCount('research_project_team_members', 6);
        $this->assertDatabaseHas('research_review_assignments', [
            'research_document_id' => $document->id,
            'reviewer_id' => $instructor->id,
            'review_role' => 'instructor',
            'is_active' => true,
        ]);
        $this->assertDatabaseHas('research_review_assignments', [
            'research_document_id' => $document->id,
            'reviewer_id' => $representative->id,
            'review_role' => 'research-office',
            'is_active' => true,
        ]);
        foreach ([$panel1, $panel2, $panel3] as $panel) {
            $this->assertDatabaseHas('research_review_assignments', [
                'research_document_id' => $document->id,
                'reviewer_id' => $panel->id,
                'review_role' => 'panel',
                'is_active' => true,
            ]);
        }
    }

    public function test_proposal_and_final_defense_teams_are_managed_independently(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2']);
        $document = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $proposalAdviser = $this->user(['role' => 'adviser']);
        $finalAdviser = $this->user(['role' => 'adviser']);

        $this->as($instructor)->putJson($this->teamUrl($section, $document), [
            'defense_type' => 'proposal',
            'adviser_id' => $proposalAdviser->id,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.adviser.user_id', $proposalAdviser->id);

        $this->as($instructor)->putJson($this->teamUrl($section, $document), [
            'defense_type' => 'final',
            'adviser_id' => $finalAdviser->id,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.adviser.user_id', $finalAdviser->id);

        $this->assertDatabaseCount('research_project_team_members', 2);

        $this->as($instructor)->getJson($this->teamUrl($section, $document).'?defense_type=proposal')
            ->assertOk()
            ->assertJsonPath('data.adviser.user_id', $proposalAdviser->id);

        $this->as($instructor)->getJson($this->teamUrl($section, $document).'?defense_type=final')
            ->assertOk()
            ->assertJsonPath('data.adviser.user_id', $finalAdviser->id);
    }

    public function test_project_team_rejects_more_than_three_panel_members(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2']);
        $document = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $panels = collect(range(1, 4))->map(fn () => $this->user(['role' => 'panel']));

        $this->as($instructor)->putJson($this->teamUrl($section, $document), [
            'panel_member_ids' => $panels->pluck('id')->all(),
        ], $this->origin())->assertBadRequest();

        $this->assertDatabaseCount('research_project_team_members', 0);
    }

    public function test_section_owner_can_save_a_partial_team_then_assign_one_role_at_a_time(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2 - Section 2']);
        $document = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $adviser = $this->user(['role' => 'adviser']);
        $representative = $this->user(['role' => 'research-office']);

        // A partial team (only an adviser) is accepted.
        $this->as($instructor)->putJson($this->teamUrl($section, $document), [
            'defense_type' => 'proposal',
            'adviser_id' => $adviser->id,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.adviser.user_id', $adviser->id)
            ->assertJsonPath('data.complete', false);
        $this->assertDatabaseCount('research_project_team_members', 1);

        // A single role can be replaced without resending the whole team.
        $this->as($instructor)->putJson($this->roleUrl($section, $document), [
            'defense_type' => 'proposal',
            'team_role' => 'research_office_representative',
            'user_id' => $representative->id,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.adviser.user_id', $adviser->id)
            ->assertJsonPath('data.research_office_representative.user_id', $representative->id);
        $this->assertDatabaseCount('research_project_team_members', 2);

        // Clearing a role works through the same endpoint.
        $this->as($instructor)->putJson($this->roleUrl($section, $document), [
            'defense_type' => 'proposal',
            'team_role' => 'research_office_representative',
            'user_id' => null,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.research_office_representative', null);
        $this->assertDatabaseCount('research_project_team_members', 1);
    }

    public function test_research_office_can_assign_a_representative_who_receives_monitoring_access(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $office = $this->user(['role' => 'research-office']);
        $representative = $this->user(['role' => 'research-office']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2']);
        $document = ResearchDocument::factory()->create(['section_id' => $section->id, 'institute' => 'Institute of Computer Studies']);
        $completed = ResearchDocument::factory()->create([
            'section_id' => $section->id,
            'institute' => 'Institute of Computer Studies',
            'research_stage' => 'completed',
        ]);

        $this->as($office)->getJson("/api/office/research/{$document->id}/representative-candidates")
            ->assertOk()
            ->assertJsonFragment(['user_id' => $representative->id]);

        $this->as($office)->putJson("/api/office/research/{$document->id}/representative", [
            'user_id' => $representative->id,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.research_office_representative.user_id', $representative->id);

        $this->as($representative)->getJson('/api/monitoring/research')
            ->assertOk()
            ->assertJsonFragment(['id' => $document->id, 'institute' => 'Institute of Computer Studies']);

        $this->as($office)->getJson('/api/monitoring/research')
            ->assertJsonMissing(['id' => $completed->id]);
    }

    public function test_single_role_assignment_moves_an_account_out_of_a_stale_ineligible_role(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2']);
        $document = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $adviser = $this->user(['role' => 'research-office']);

        ResearchProjectTeamMember::query()->create([
            'research_document_id' => $document->id,
            'user_id' => $adviser->id,
            'team_role' => 'research_office_representative',
            'assigned_by' => $instructor->id,
        ]);

        $adviser->update(['role' => 'adviser']);

        $this->as($instructor)->putJson($this->roleUrl($section, $document), [
            'defense_type' => 'proposal',
            'team_role' => 'adviser',
            'user_id' => $adviser->id,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.adviser.user_id', $adviser->id)
            ->assertJsonPath('data.research_office_representative', null);

        $this->assertDatabaseHas('research_project_team_members', [
            'research_document_id' => $document->id,
            'user_id' => $adviser->id,
            'team_role' => 'adviser',
        ]);
        $this->assertDatabaseMissing('research_project_team_members', [
            'research_document_id' => $document->id,
            'user_id' => $adviser->id,
            'team_role' => 'research_office_representative',
        ]);
    }

    public function test_section_owner_can_create_rename_and_delete_a_section_project(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2 - Section 2']);
        $other = $this->user(['role' => 'instructor']);

        $response = $this->as($instructor)->postJson("/api/instructor/sections/{$section->id}/documents", [
            'title' => '  Machine Learning for Crop Disease Detection  ',
        ], $this->origin())->assertCreated()
            ->assertJsonPath('data.title', 'Machine Learning for Crop Disease Detection')
            ->assertJsonPath('data.research_stage', 'title_proposal')
            ->assertJsonPath('data.submission_status', 'draft');
        $documentId = $response->json('data.research_document_id');
        $this->assertDatabaseHas('research_documents', [
            'id' => $documentId,
            'section_id' => $section->id,
            'submitted_by' => $instructor->id,
        ]);

        // A duplicate title is rejected.
        $this->as($instructor)->postJson("/api/instructor/sections/{$section->id}/documents", [
            'title' => 'machine learning for crop disease detection',
        ], $this->origin())->assertStatus(422);

        // The title can be renamed while it is a draft title proposal.
        $this->as($instructor)->patchJson("/api/instructor/sections/{$section->id}/documents/{$documentId}", [
            'title' => 'Deep Learning for Crop Disease Detection',
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.title', 'Deep Learning for Crop Disease Detection');

        // Another instructor cannot create or rename projects in a section they do not own.
        $this->as($other)->postJson("/api/instructor/sections/{$section->id}/documents", [
            'title' => 'Another Project',
        ], $this->origin())->assertForbidden();
        $this->as($other)->patchJson("/api/instructor/sections/{$section->id}/documents/{$documentId}", [
            'title' => 'Renamed by Another',
        ], $this->origin())->assertForbidden();

        $student = $this->user(['role' => 'researcher']);
        $this->as($instructor)->putJson("/api/instructor/sections/{$section->id}/members", [
            'user_ids' => [$student->id],
        ], $this->origin())->assertOk();
        $this->as($instructor)->putJson("/api/instructor/sections/{$section->id}/documents/{$documentId}/members/{$student->id}", [], $this->origin())->assertOk();

        $this->as($other)->deleteJson("/api/instructor/sections/{$section->id}/documents/{$documentId}", [], $this->origin())->assertForbidden();
        $this->as($instructor)->deleteJson("/api/instructor/sections/{$section->id}/documents/{$documentId}", [], $this->origin())->assertNoContent();
        $this->assertSoftDeleted('research_documents', ['id' => $documentId]);
        $this->assertDatabaseHas('class_section_members', [
            'class_section_id' => $section->id,
            'research_document_id' => null,
            'user_id' => $student->id,
        ]);
        $this->assertDatabaseCount('class_section_members', 1);
    }

    public function test_researcher_account_can_only_be_assigned_to_one_study(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2']);
        $firstDocument = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $secondDocument = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $student = $this->user(['role' => 'researcher']);

        $this->as($instructor)->putJson("/api/instructor/sections/{$section->id}/members", [
            'user_ids' => [$student->id],
        ], $this->origin())->assertOk();

        $firstAssignmentUrl = "/api/instructor/sections/{$section->id}/documents/{$firstDocument->id}/members/{$student->id}";
        $this->as($instructor)->putJson($firstAssignmentUrl, [], $this->origin())->assertOk();
        $this->as($instructor)->putJson($firstAssignmentUrl, [], $this->origin())->assertOk();

        $this->as($instructor)
            ->putJson("/api/instructor/sections/{$section->id}/documents/{$secondDocument->id}/members/{$student->id}", [], $this->origin())
            ->assertUnprocessable()
            ->assertJsonPath('errors.user_id.0', 'This researcher account is already assigned to another study.');

        $this->assertDatabaseHas('class_section_members', [
            'research_document_id' => $firstDocument->id,
            'user_id' => $student->id,
        ]);
        $this->assertDatabaseMissing('class_section_members', [
            'research_document_id' => $secondDocument->id,
            'user_id' => $student->id,
        ]);
    }

    public function test_instructor_cannot_delete_another_sections_or_an_existing_project(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $other = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Owned Section']);
        $otherSection = ClassSection::query()->create(['instructor_id' => $other->id, 'name' => 'Other Section']);
        $otherProject = ResearchDocument::factory()->create([
            'section_id' => $otherSection->id,
            'submitted_by' => $other->id,
            'research_stage' => 'title_proposal',
            'submission_status' => 'draft',
        ]);
        $existingProject = ResearchDocument::factory()->create([
            'section_id' => $section->id,
            'submitted_by' => $other->id,
            'research_stage' => 'title_proposal',
            'submission_status' => 'draft',
        ]);

        $this->as($instructor)->deleteJson("/api/instructor/sections/{$section->id}/documents/{$otherProject->id}", [], $this->origin())->assertUnprocessable();
        $this->as($instructor)->deleteJson("/api/instructor/sections/{$section->id}/documents/{$existingProject->id}", [], $this->origin())->assertUnprocessable();
        $this->as($instructor)->patchJson("/api/instructor/sections/{$section->id}/documents/{$existingProject->id}", [
            'title' => 'Unauthorized rename',
        ], $this->origin())->assertUnprocessable();
        $this->assertNotSoftDeleted($otherProject);
        $this->assertNotSoftDeleted($existingProject);
    }

    public function test_team_candidates_accept_the_role_from_the_query_string(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2']);
        $document = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $adviser = $this->user(['role' => 'adviser']);

        $this->as($instructor)
            ->getJson("{$this->teamUrl($section, $document)}/candidates?team_role=adviser")
            ->assertOk()
            ->assertJsonPath('data.0.user_id', $adviser->id);
    }

    public function test_team_rejects_wrong_roles_duplicates_and_another_instructor(): void
    {
        $owner = $this->user(['role' => 'instructor']);
        $other = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create(['instructor_id' => $owner->id, 'name' => 'Thesis 2']);
        $document = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $adviser = $this->user(['role' => 'adviser']);
        $representative = $this->user(['role' => 'research-office']);
        $panel = $this->user(['role' => 'panel']);
        $payload = [
            'adviser_id' => $adviser->id,
            'research_office_representative_id' => $representative->id,
            'chair_id' => $panel->id,
            'panel_member_ids' => [$panel->id],
        ];

        $this->as($other)->putJson($this->teamUrl($section, $document), $payload, $this->origin())->assertForbidden();
        $this->as($owner)->putJson($this->teamUrl($section, $document), $payload, $this->origin())->assertBadRequest();
        $this->assertDatabaseCount('research_project_team_members', 0);
    }

    private function teamUrl(ClassSection $section, ResearchDocument $document): string
    {
        return "/api/instructor/sections/{$section->id}/documents/{$document->id}/team";
    }

    private function roleUrl(ClassSection $section, ResearchDocument $document): string
    {
        return "/api/instructor/sections/{$section->id}/documents/{$document->id}/team/role";
    }

    private function user(array $attributes = []): User
    {
        return User::query()->create(array_merge([
            'id' => (string) Str::uuid(),
            'email' => Str::lower(Str::random(16)).'@example.edu',
            'role' => 'researcher',
            'access_status' => 'active',
            'account_status' => 'active',
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
