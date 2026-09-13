<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\ResearchDocument;
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
        $panelist = $this->user(['role' => 'panel']);

        $this->as($instructor)->putJson($this->teamUrl($section, $document), [
            'adviser_id' => $adviser->id,
            'research_office_representative_id' => $representative->id,
            'chair_id' => $chair->id,
            'panel_member_ids' => [$panelist->id],
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.complete', true)
            ->assertJsonPath('data.adviser.user_id', $adviser->id)
            ->assertJsonPath('data.research_office_representative.user_id', $representative->id)
            ->assertJsonPath('data.chair.user_id', $chair->id)
            ->assertJsonPath('data.panel_members.0.user_id', $panelist->id);

        $this->assertDatabaseCount('research_project_team_members', 4);
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
            'adviser_id' => $adviser->id,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.adviser.user_id', $adviser->id)
            ->assertJsonPath('data.complete', false);
        $this->assertDatabaseCount('research_project_team_members', 1);

        // A single role can be replaced without resending the whole team.
        $this->as($instructor)->putJson($this->roleUrl($section, $document), [
            'team_role' => 'research_office_representative',
            'user_id' => $representative->id,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.adviser.user_id', $adviser->id)
            ->assertJsonPath('data.research_office_representative.user_id', $representative->id);
        $this->assertDatabaseCount('research_project_team_members', 2);

        // Clearing a role works through the same endpoint.
        $this->as($instructor)->putJson($this->roleUrl($section, $document), [
            'team_role' => 'research_office_representative',
            'user_id' => null,
        ], $this->origin())->assertOk()
            ->assertJsonPath('data.research_office_representative', null);
        $this->assertDatabaseCount('research_project_team_members', 1);
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
