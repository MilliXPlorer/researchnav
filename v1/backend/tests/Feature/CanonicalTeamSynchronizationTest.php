<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\User;
use App\Services\AuditService;
use App\Services\DefenseMonitoringAuthorization;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\UsesIsolatedProjectTeamDatabase;
use Tests\TestCase;

class CanonicalTeamSynchronizationTest extends TestCase
{
    use UsesIsolatedProjectTeamDatabase;

    private const ORIGIN = ['Origin' => 'http://localhost:5173'];

    protected function canonicalMonitoringAssignments(): bool
    {
        return true;
    }

    #[DataProvider('defenseStages')]
    public function test_saving_and_clearing_one_stage_preserves_the_other_stage_and_its_grants(string $edited): void
    {
        [$instructor, $section, $research] = $this->project();
        $other = $edited === 'proposal' ? 'final' : 'proposal';
        $editedTeam = $this->completeTeam();
        $otherTeam = $this->completeTeam();
        $this->save($instructor, $section, $research, $other, $otherTeam);
        $otherIds = $this->teamUserIds($otherTeam);
        $otherGrants = DB::table('research_assignments')->whereIn('user_id', $otherIds)->orderBy('id')->get()->toJson();
        $otherMembers = ResearchProjectTeamMember::where('defense_type', $other)->orderBy('id')->get()->toJson();
        $this->save($instructor, $section, $research, $edited, $editedTeam);
        $this->save($instructor, $section, $research, $edited, []);

        $this->assertSame($otherGrants, DB::table('research_assignments')->whereIn('user_id', $otherIds)->orderBy('id')->get()->toJson());
        $this->assertSame($otherMembers, ResearchProjectTeamMember::where('defense_type', $other)->orderBy('id')->get()->toJson());
        $this->assertSame(0, ResearchProjectTeamMember::where('defense_type', $edited)->count());
        $this->assertSame('submitted', ResearchDocument::findOrFail($research->id)->submission_status);
        foreach ($this->teamUserIds($editedTeam) as $userId) {
            $this->assertSame('inactive', DB::table('research_assignments')->where('user_id', $userId)->value('status'));
        }
        foreach ([$otherTeam['adviser_id'], $otherTeam['research_office_representative_id'], $otherTeam['chair_id'], ...$otherTeam['panel_member_ids']] as $userId) {
            $actor = User::findOrFail($userId);
            $this->assertNotNull(app(DefenseMonitoringAuthorization::class)->section($actor, $research, 'after_'.$other.'_defense'));
            $this->assertNull(app(DefenseMonitoringAuthorization::class)->section($actor, $research, 'after_'.$edited.'_defense'));
        }
        $panel = User::findOrFail($otherTeam['panel_member_ids'][0]);
        $this->withSession(['user_id' => $panel->id])->putJson('/api/research/'.$research->id.'/shared-monitoring', $this->monitoringBody($edited), self::ORIGIN)->assertForbidden();
        $this->putJson('/api/research/'.$research->id.'/shared-monitoring', $this->monitoringBody($other), self::ORIGIN)->assertOk();
    }

    public static function defenseStages(): array
    {
        return [['proposal'], ['final']];
    }

    #[DataProvider('sharedRoles')]
    public function test_shared_member_keeps_one_grant_until_removed_from_both_stages(string $role, string $proposalField, string $finalField): void
    {
        [$instructor, $section, $research] = $this->project();
        $person = $this->person($role);
        $proposal = [$proposalField => $proposalField === 'panel_member_ids' ? [$person->id] : $person->id];
        $final = [$finalField => $finalField === 'panel_member_ids' ? [$person->id] : $person->id];
        $this->save($instructor, $section, $research, 'proposal', $proposal);
        $this->save($instructor, $section, $research, 'final', $final);
        $this->assertSame(1, DB::table('research_assignments')->where('user_id', $person->id)->count());
        $this->save($instructor, $section, $research, 'proposal', []);
        $this->assertSame('active', DB::table('research_assignments')->where('user_id', $person->id)->value('status'));
        $this->assertNull(app(DefenseMonitoringAuthorization::class)->section($person, $research, 'after_proposal_defense'));
        $expectedDesignation = match ($finalField) {
            'adviser_id' => 'Adviser', 'research_office_representative_id' => 'Research Rep',
            'chair_id' => 'Chair', 'panel_member_ids' => 'Panel 1',
        };
        $this->assertSame([$role, $expectedDesignation], app(DefenseMonitoringAuthorization::class)->section($person, $research, 'after_final_defense'));
        $this->save($instructor, $section, $research, 'final', []);
        $this->assertSame('inactive', DB::table('research_assignments')->where('user_id', $person->id)->value('status'));
        $this->assertSame(1, DB::table('research_assignments')->where('user_id', $person->id)->count());
        $this->assertNull(app(DefenseMonitoringAuthorization::class)->section($person, $research, 'after_final_defense'));
    }

    public static function sharedRoles(): array
    {
        return [
            ['adviser', 'adviser_id', 'adviser_id'],
            ['research-office', 'research_office_representative_id', 'research_office_representative_id'],
            ['panel', 'panel_member_ids', 'chair_id'],
            ['panel', 'chair_id', 'panel_member_ids'],
        ];
    }

    #[DataProvider('independentDesignations')]
    public function test_independent_research_and_defense_scope_grants_and_support_personnel_are_preserved(?string $designation): void
    {
        [$instructor, $section, $research] = $this->project();
        $independent = $this->person('adviser');
        $support = $this->person('librarian');
        $defenseActor = $this->person('panel');
        $independentId = $this->grant($research, $independent, ['designation' => $designation, 'status' => 'accepted']);
        $supportId = $this->grant($research, $support, ['status' => 'confirmed']);
        $defenseId = $this->grant($research, $defenseActor, ['assignment_scope' => 'defense', 'defense_id' => 999, 'designation' => 'panel_chair']);
        $snapshot = DB::table('research_assignments')->whereIn('id', [$independentId, $supportId, $defenseId])->orderBy('id')->get()->toJson();

        // Reusing an independent grant must not relabel it as a team grant.
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $independent->id, 'chair_id' => $defenseActor->id]);
        $this->save($instructor, $section, $research, 'final', []);
        $this->save($instructor, $section, $research, 'proposal', []);
        $this->assertSame($snapshot, DB::table('research_assignments')->whereIn('id', [$independentId, $supportId, $defenseId])->orderBy('id')->get()->toJson());
        $this->assertSame(0, ResearchProjectTeamMember::count());
        $this->assertNull(app(DefenseMonitoringAuthorization::class)->section($independent, $research, 'after_proposal_defense'));
        $this->assertNotNull(app(DefenseMonitoringAuthorization::class)->section($support, $research, 'before_final_defense'));
    }

    public static function independentDesignations(): array
    {
        return [[null], ['Independent research review']];
    }

    #[DataProvider('nonActiveStatuses')]
    public function test_incidental_saves_and_a_second_stage_do_not_reactivate_revoked_or_inactive_members(string $status): void
    {
        [$instructor, $section, $research] = $this->project();
        $adviser = $this->person('adviser');
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $adviser->id]);
        DB::table('research_assignments')->where('user_id', $adviser->id)->update(['status' => $status]);
        $snapshot = DB::table('research_assignments')->where('user_id', $adviser->id)->first();
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $adviser->id]);
        $this->save($instructor, $section, $research, 'final', ['adviser_id' => $adviser->id]);
        $this->assertEquals($snapshot, DB::table('research_assignments')->where('user_id', $adviser->id)->first());
        $this->assertSame(1, DB::table('research_assignments')->where('user_id', $adviser->id)->count());
        foreach (['proposal', 'final'] as $stage) {
            $this->assertNull(app(DefenseMonitoringAuthorization::class)->section($adviser, $research, 'after_'.$stage.'_defense'));
        }
    }

    public static function nonActiveStatuses(): array
    {
        return [['inactive'], ['revoked'], ['requested']];
    }

    public function test_saving_another_stage_does_not_repair_missing_or_revoked_final_assignments(): void
    {
        [$instructor, $section, $research] = $this->project();
        $finalAdviser = $this->person('adviser');
        ResearchProjectTeamMember::create([
            'research_document_id' => $research->id, 'defense_type' => 'final', 'user_id' => $finalAdviser->id, 'team_role' => 'adviser',
        ]);
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $this->person('adviser')->id]);
        $this->assertSame(0, DB::table('research_assignments')->where('user_id', $finalAdviser->id)->count());
        $this->assertSame(1, ResearchProjectTeamMember::where('defense_type', 'final')->count());
    }

    public function test_explicit_reassignment_reuses_a_previously_removed_team_grant_but_does_not_unrevoke_it(): void
    {
        [$instructor, $section, $research] = $this->project();
        $adviser = $this->person('adviser');
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $adviser->id]);
        $id = DB::table('research_assignments')->where('user_id', $adviser->id)->value('id');
        $this->save($instructor, $section, $research, 'proposal', []);
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $adviser->id]);
        $this->assertSame('active', DB::table('research_assignments')->where('id', $id)->value('status'));
        $this->assertSame(1, DB::table('research_assignments')->where('user_id', $adviser->id)->count());
        $this->save($instructor, $section, $research, 'proposal', []);
        DB::table('research_assignments')->where('id', $id)->update(['status' => 'revoked']);
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $adviser->id]);
        $this->assertSame('revoked', DB::table('research_assignments')->where('id', $id)->value('status'));
    }

    public function test_duplicates_are_retained_as_history_without_duplicate_active_grants_or_notifications(): void
    {
        [$instructor, $section, $research] = $this->project();
        $adviser = $this->person('adviser');
        $inactiveId = $this->grant($research, $adviser, ['status' => 'inactive', 'designation' => 'Adviser']);
        $acceptedId = $this->grant($research, $adviser, ['status' => 'accepted', 'designation' => 'Adviser']);
        $duplicateId = $this->grant($research, $adviser, ['status' => 'active', 'designation' => 'Adviser']);
        $payload = ['adviser_id' => $adviser->id];
        $this->save($instructor, $section, $research, 'proposal', $payload);
        $notifications = DB::table('notifications')->count();
        $this->save($instructor, $section, $research, 'proposal', $payload);
        $this->assertSame($notifications, DB::table('notifications')->count());
        $this->assertSame(3, DB::table('research_assignments')->where('user_id', $adviser->id)->count());
        $this->assertSame('inactive', DB::table('research_assignments')->where('id', $inactiveId)->value('status'));
        $this->assertSame('accepted', DB::table('research_assignments')->where('id', $acceptedId)->value('status'));
        $this->assertSame('inactive', DB::table('research_assignments')->where('id', $duplicateId)->value('status'));
        $this->assertSame(1, DB::table('research_assignments')->where('user_id', $adviser->id)->whereIn('status', ['active', 'accepted', 'confirmed'])->count());
        app(AuditService::class)->shouldHaveReceived('log')->withArgs(fn ($actor, $action) => $action === 'PROJECT_TEAM_UPDATED')->twice();
    }

    public function test_representative_endpoint_preserves_both_stages_and_correct_monitoring_sections(): void
    {
        [$instructor, $section, $research] = $this->project();
        $office = $this->person('research-office');
        $proposal = $this->person('research-office');
        $final = $this->person('research-office');
        $url = '/api/office/research/'.$research->id.'/representative';
        $this->withSession(['user_id' => $office->id])->putJson($url, ['user_id' => $proposal->id], self::ORIGIN)->assertOk();
        $this->putJson($url, ['user_id' => $final->id, 'defense_type' => 'final'], self::ORIGIN)->assertOk();
        $this->assertSame('active', DB::table('research_assignments')->where('user_id', $proposal->id)->value('status'));
        $this->assertSame('active', DB::table('research_assignments')->where('user_id', $final->id)->value('status'));
        $this->assertSame(['research-office', 'Research Rep'], app(DefenseMonitoringAuthorization::class)->section($final, $research, 'after_final_defense'));
        $this->assertNull(app(DefenseMonitoringAuthorization::class)->section($final, $research, 'after_proposal_defense'));
        $this->putJson($url, ['user_id' => null, 'defense_type' => 'proposal'], self::ORIGIN)->assertOk();
        $this->assertSame('active', DB::table('research_assignments')->where('user_id', $final->id)->value('status'));
        $this->assertSame($final->id, ResearchProjectTeamMember::where('defense_type', 'final')->where('team_role', 'research_office_representative')->value('user_id'));
    }

    public function test_an_older_inactive_duplicate_cannot_bypass_a_revoked_grant(): void
    {
        [$instructor, $section, $research] = $this->project();
        $adviser = $this->person('adviser');
        $this->grant($research, $adviser, ['designation' => 'Adviser', 'status' => 'inactive']);
        $this->grant($research, $adviser, ['designation' => 'Adviser', 'status' => 'revoked']);
        $snapshot = DB::table('research_assignments')->where('user_id', $adviser->id)->orderBy('id')->get()->toJson();
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $adviser->id]);
        $this->assertSame($snapshot, DB::table('research_assignments')->where('user_id', $adviser->id)->orderBy('id')->get()->toJson());
        $this->assertNull(app(DefenseMonitoringAuthorization::class)->section($adviser, $research, 'after_proposal_defense'));
    }

    public function test_duplicate_team_grant_does_not_replace_an_independent_research_wide_grant(): void
    {
        [$instructor, $section, $research] = $this->project();
        $adviser = $this->person('adviser');
        $teamId = $this->grant($research, $adviser, ['designation' => 'Adviser']);
        $independentId = $this->grant($research, $adviser, ['designation' => null, 'status' => 'confirmed']);
        $snapshot = DB::table('research_assignments')->where('id', $independentId)->first();
        $this->save($instructor, $section, $research, 'proposal', ['adviser_id' => $adviser->id]);
        $this->save($instructor, $section, $research, 'proposal', []);
        $this->assertEquals($snapshot, DB::table('research_assignments')->where('id', $independentId)->first());
        $this->assertSame('inactive', DB::table('research_assignments')->where('id', $teamId)->value('status'));
        $this->assertSame(1, DB::table('research_assignments')->where('user_id', $adviser->id)->whereIn('status', ['active', 'accepted', 'confirmed'])->count());
        $this->assertNull(app(DefenseMonitoringAuthorization::class)->section($adviser, $research, 'after_proposal_defense'));
    }

    public function test_unauthorized_users_cannot_save_either_stage_or_the_representative(): void
    {
        [$instructor, $section, $research] = $this->project();
        $otherInstructor = $this->person('instructor');
        $adviser = $this->person('adviser');
        foreach (['proposal', 'final'] as $stage) {
            $this->withSession(['user_id' => $otherInstructor->id])->putJson($this->url($section, $research), ['defense_type' => $stage, 'adviser_id' => $adviser->id], self::ORIGIN)->assertForbidden();
        }
        $this->withSession(['user_id' => $adviser->id])->putJson('/api/office/research/'.$research->id.'/representative', ['user_id' => null], self::ORIGIN)->assertForbidden();
        $this->assertSame(0, ResearchProjectTeamMember::count());
        $this->assertSame(0, DB::table('research_assignments')->count());
        $this->assertSame('submitted', ResearchDocument::findOrFail($research->id)->submission_status);
    }

    private function project(): array
    {
        $instructor = $this->person('instructor');
        $section = ClassSection::create(['instructor_id' => $instructor->id, 'name' => 'Isolated AR-05 section']);
        $research = ResearchDocument::factory()->create(['section_id' => $section->id, 'submission_status' => 'submitted']);

        return [$instructor, $section, $research];
    }

    private function person(string $role): User
    {
        return User::factory()->create(['role' => $role]);
    }

    private function completeTeam(): array
    {
        return [
            'adviser_id' => $this->person('adviser')->id,
            'research_office_representative_id' => $this->person('research-office')->id,
            'chair_id' => $this->person('panel')->id,
            'panel_member_ids' => [$this->person('panel')->id, $this->person('panel')->id, $this->person('panel')->id],
        ];
    }

    private function teamUserIds(array $payload): array
    {
        return [$payload['adviser_id'], $payload['research_office_representative_id'], $payload['chair_id'], ...$payload['panel_member_ids']];
    }

    private function save(User $instructor, ClassSection $section, ResearchDocument $research, string $stage, array $payload): void
    {
        $this->withSession(['user_id' => $instructor->id])->putJson($this->url($section, $research), ['defense_type' => $stage, ...$payload], self::ORIGIN)->assertOk();
    }

    private function grant(ResearchDocument $research, User $person, array $attributes = []): int
    {
        return DB::table('research_assignments')->insertGetId(array_merge([
            'research_document_id' => $research->id, 'user_id' => $person->id, 'assignment_role' => $person->role,
            'assignment_scope' => 'research', 'defense_id' => null, 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ], $attributes));
    }

    private function url(ClassSection $section, ResearchDocument $research): string
    {
        return '/api/instructor/sections/'.$section->id.'/documents/'.$research->id.'/team';
    }

    private function monitoringBody(string $stage): array
    {
        return ['monitoring_stage' => 'after_'.$stage.'_defense', 'activity' => 'Isolated authorization check.', 'status' => 'pending', 'signature_status' => 'unsigned'];
    }
}
