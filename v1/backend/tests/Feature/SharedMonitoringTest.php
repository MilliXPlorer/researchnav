<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class SharedMonitoringTest extends TestCase
{
    use RefreshDatabase;

    public function test_assigned_reviewer_receives_proposal_and_final_defense_stages(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $adviser = $this->user(['role' => 'adviser']);
        $research = ResearchDocument::factory()->create();
        $research->reviewAssignments()->create([
            'reviewer_id' => $adviser->id,
            'assigned_by' => $office->id,
            'review_role' => 'adviser',
            'is_active' => true,
        ]);

        $this->as($adviser)
            ->getJson('/api/research/'.$research->id.'/shared-monitoring')
            ->assertOk()
            ->assertJsonStructure(['data' => ['stages' => [
                'before_proposal_defense',
                'after_proposal_defense',
                'before_final_defense',
                'after_final_defense',
            ]]])
            ->assertJsonCount(4, 'data.stages');
    }

    #[DataProvider('supportRoleProvider')]
    public function test_requested_support_assignment_appears_in_assigned_research_folder(string $role): void
    {
        $researcher = $this->user(['role' => 'researcher']);
        $supportActor = $this->user(['role' => $role]);
        $research = ResearchDocument::factory()->create();
        $research->reviewAssignments()->create([
            'reviewer_id' => $supportActor->id,
            'assigned_by' => $researcher->id,
            'review_role' => $role,
            'is_active' => false,
            'status' => 'requested',
        ]);
        $assignment = $research->reviewAssignments()->firstOrFail();

        $this->as($supportActor)
            ->getJson('/api/monitoring/research')
            ->assertOk()
            ->assertJsonPath('data.0.id', $research->id)
            ->assertJsonPath('data.0.assignment_id', $assignment->id)
            ->assertJsonPath('data.0.assignment_status', 'requested');

        $this->as($supportActor)
            ->getJson('/api/research/'.$research->id.'/shared-monitoring')
            ->assertForbidden();
    }

    public static function supportRoleProvider(): array
    {
        return [
            'statistician' => ['statistician'],
            'librarian' => ['librarian'],
            'editor' => ['research_editor'],
        ];
    }

    public function test_final_defense_entries_use_an_independent_stage_context(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $adviser = $this->user(['role' => 'adviser']);
        $research = ResearchDocument::factory()->create();
        $research->reviewAssignments()->create([
            'reviewer_id' => $adviser->id,
            'assigned_by' => $office->id,
            'review_role' => 'adviser',
            'is_active' => true,
        ]);

        $this->as($adviser)->putJson(
            '/api/research/'.$research->id.'/shared-monitoring',
            [
                'monitoring_stage' => 'before_final_defense',
                'activity' => 'Reviewed final manuscript',
                'remarks' => 'Ready for defense',
                'status' => 'completed',
                'signature_status' => 'unsigned',
            ],
            ['Origin' => 'http://localhost:5173'],
        )->assertOk()
            ->assertJsonPath('data.stages.before_final_defense.sections.0.entries.0.activity', 'Reviewed final manuscript')
            ->assertJsonCount(0, 'data.stages.before_proposal_defense.sections.0.entries');
    }

    public function test_unassigned_office_user_can_view_but_cannot_edit_research_representative_section(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $research = ResearchDocument::factory()->create();

        $this->as($office)
            ->getJson('/api/research/'.$research->id.'/shared-monitoring')
            ->assertOk();

        $this->as($office)->putJson(
            '/api/research/'.$research->id.'/shared-monitoring',
            [
                'monitoring_stage' => 'after_final_defense',
                'activity' => 'Office review',
                'status' => 'completed',
                'signature_status' => 'unsigned',
            ],
            ['Origin' => 'http://localhost:5173'],
        )->assertForbidden();
    }

    public function test_assigned_office_representative_can_edit_final_defense_section(): void
    {
        $assigner = $this->user(['role' => 'research-office']);
        $representative = $this->user(['role' => 'research-office']);
        $research = ResearchDocument::factory()->create();
        $research->reviewAssignments()->create([
            'reviewer_id' => $representative->id,
            'assigned_by' => $assigner->id,
            'review_role' => 'research-office',
            'designation' => 'Research Rep',
            'is_active' => true,
        ]);

        $this->as($representative)->putJson(
            '/api/research/'.$research->id.'/shared-monitoring',
            [
                'monitoring_stage' => 'after_final_defense',
                'activity' => 'Research office final review',
                'status' => 'completed',
                'signature_status' => 'unsigned',
            ],
            ['Origin' => 'http://localhost:5173'],
        )->assertOk()
            ->assertJsonPath('data.stages.after_final_defense.sections.7.entries.0.activity', 'Research office final review');
    }

    public function test_entry_cannot_claim_a_signature_that_was_not_uploaded(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $adviser = $this->user(['role' => 'adviser']);
        $research = ResearchDocument::factory()->create();
        $research->reviewAssignments()->create([
            'reviewer_id' => $adviser->id,
            'assigned_by' => $office->id,
            'review_role' => 'adviser',
            'is_active' => true,
        ]);

        $this->as($adviser)->putJson(
            '/api/research/'.$research->id.'/shared-monitoring',
            [
                'monitoring_stage' => 'before_final_defense',
                'activity' => 'Unsigned final review',
                'status' => 'completed',
                'signature_status' => 'signed',
            ],
            ['Origin' => 'http://localhost:5173'],
        )->assertUnprocessable()
            ->assertJsonValidationErrors('signature_status');
    }

    public function test_monitoring_forms_show_per_stage_team_assignments(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $proposalAdviser = $this->user(['role' => 'adviser', 'first_name' => 'Proposal', 'last_name' => 'Adviser']);
        $finalAdviser = $this->user(['role' => 'adviser', 'first_name' => 'Final', 'last_name' => 'Adviser']);
        $research = ResearchDocument::factory()->create();
        $research->reviewAssignments()->create([
            'reviewer_id' => $proposalAdviser->id,
            'assigned_by' => $office->id,
            'review_role' => 'adviser',
            'is_active' => true,
        ]);

        ResearchProjectTeamMember::query()->create([
            'research_document_id' => $research->id,
            'defense_type' => 'proposal',
            'user_id' => $proposalAdviser->id,
            'team_role' => 'adviser',
            'assigned_by' => $office->id,
        ]);

        // Proposal monitoring shows the proposal team; final stays unassigned.
        $this->as($proposalAdviser)
            ->getJson('/api/research/'.$research->id.'/shared-monitoring')
            ->assertOk()
            ->assertJsonPath('data.stages.before_proposal_defense.sections.0.assigned_actor_name', $proposalAdviser->displayName())
            ->assertJsonPath('data.stages.before_final_defense.sections.0.assigned_actor_name', null);

        // Assigning the final team updates the final monitoring stages.
        ResearchProjectTeamMember::query()->create([
            'research_document_id' => $research->id,
            'defense_type' => 'final',
            'user_id' => $finalAdviser->id,
            'team_role' => 'adviser',
            'assigned_by' => $office->id,
        ]);

        $this->as($proposalAdviser)
            ->getJson('/api/research/'.$research->id.'/shared-monitoring')
            ->assertOk()
            ->assertJsonPath('data.stages.before_final_defense.sections.0.assigned_actor_name', $finalAdviser->displayName())
            ->assertJsonPath('data.stages.before_proposal_defense.sections.0.assigned_actor_name', $proposalAdviser->displayName());
    }

    public function test_every_assigned_actor_can_read_the_stage_specific_project_team(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $adviser = $this->user(['role' => 'adviser']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'Thesis 2']);
        $research = ResearchDocument::factory()->create(['section_id' => $section->id]);
        $research->reviewAssignments()->create([
            'reviewer_id' => $adviser->id,
            'assigned_by' => $instructor->id,
            'review_role' => 'adviser',
            'defense_type' => 'proposal',
            'is_active' => true,
        ]);
        ResearchProjectTeamMember::query()->create([
            'research_document_id' => $research->id,
            'defense_type' => 'proposal',
            'user_id' => $adviser->id,
            'team_role' => 'adviser',
            'assigned_by' => $instructor->id,
        ]);

        $this->as($adviser)
            ->getJson('/api/research/'.$research->id.'/team?defense_type=proposal')
            ->assertOk()
            ->assertJsonPath('data.defense_type', 'proposal')
            ->assertJsonPath('data.adviser.name', $adviser->displayName());

        $this->as($adviser)
            ->getJson('/api/research/'.$research->id.'/team?defense_type=final')
            ->assertOk()
            ->assertJsonPath('data.defense_type', 'final')
            ->assertJsonPath('data.adviser', null);
    }

    /**
     * @param  string[]  $expectedStages
     */
    #[DataProvider('monitoringEditorMatrix')]
    public function test_every_involved_actor_can_edit_their_monitoring_stages(string $role, array $expectedStages): void
    {
        $office = $this->user(['role' => 'research-office']);
        $actor = $this->user(['role' => $role]);
        $research = ResearchDocument::factory()->create();
        if ($role === 'researcher') {
            // Researchers cannot hold review assignments; they participate
            // through section project membership (read-only monitoring).
            $section = ClassSection::query()->create(['instructor_id' => $office->id, 'name' => 'Thesis 2']);
            $research->update(['section_id' => $section->id]);
            DB::table('class_section_members')->insert([
                'class_section_id' => $section->id,
                'research_document_id' => $research->id,
                'user_id' => $actor->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            $research->reviewAssignments()->create([
                'reviewer_id' => $actor->id,
                'assigned_by' => $office->id,
                'review_role' => $role,
                'designation' => $role === 'panel' ? 'panel_1' : null,
                'is_active' => true,
            ]);
        }

        $this->as($actor)
            ->getJson('/api/research/'.$research->id.'/shared-monitoring')
            ->assertOk()
            ->assertJsonPath('data.editable_stages', $expectedStages);
    }

    public static function monitoringEditorMatrix(): array
    {
        $all = ['before_proposal_defense', 'after_proposal_defense', 'before_final_defense', 'after_final_defense'];
        $after = ['after_proposal_defense', 'after_final_defense'];
        $before = ['before_proposal_defense', 'before_final_defense'];

        return [
            'adviser edits every stage' => ['adviser', $all],
            'instructor edits every stage' => ['instructor', $all],
            'research editor edits every stage' => ['research_editor', $all],
            'librarian edits every stage' => ['librarian', $all],
            'panel edits after-defense stages only' => ['panel', $after],
            'statistician edits before-defense stages only' => ['statistician', $before],
            'research office edits after-defense stages only' => ['research-office', $after],
            'researcher edits no stage' => ['researcher', []],
        ];
    }

    public function test_unassigned_role_does_not_gain_shared_monitoring_access(): void
    {
        $research = ResearchDocument::factory()->create();
        $unassigned = $this->user(['role' => 'adviser']);

        $this->as($unassigned)
            ->getJson('/api/research/'.$research->id.'/shared-monitoring')
            ->assertForbidden();
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
}
