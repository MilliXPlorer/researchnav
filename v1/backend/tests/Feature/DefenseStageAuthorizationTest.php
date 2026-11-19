<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\UsesIsolatedMonitoringDatabase;
use Tests\TestCase;

class DefenseStageAuthorizationTest extends TestCase
{
    use UsesIsolatedMonitoringDatabase;

    private const ORIGIN = ['Origin' => 'http://localhost:5173'];

    private const STAGES = ['before_proposal_defense', 'after_proposal_defense', 'before_final_defense', 'after_final_defense'];

    protected function canonicalMonitoringAssignments(): bool
    {
        return true;
    }

    #[DataProvider('managedActors')]
    public function test_managed_actor_mutations_are_limited_to_the_actual_defense_team(string $role, string $defense): void
    {
        $research = $this->research();
        $actor = $this->actor($role);
        $this->assign($research, $actor);
        $this->team($research, $actor, $defense);
        $designation = match ($role) {
            'panel' => 'Panel 2', 'adviser' => 'Adviser', 'research-office' => 'Research Rep',
        };
        $expected = array_values(array_filter(self::STAGES, fn ($stage) => str_contains($stage, '_'.$defense.'_defense')
            && ($role === 'adviser' || str_starts_with($stage, 'after_'))));
        $this->withSession(['user_id' => $actor->id])->getJson($this->url($research))
            ->assertOk()->assertJsonPath('data.editable_stages', $expected)->assertJsonCount(4, 'data.stages');

        foreach (self::STAGES as $stage) {
            $allowed = in_array($stage, $expected, true);
            $seedId = $this->entry($research, $actor, $stage, $designation);
            $body = $this->body($stage);
            $before = DB::table('monitoring_entries')->count();
            $create = $this->putJson($this->url($research), $body, self::ORIGIN);
            $allowed ? $create->assertOk() : $create->assertForbidden();
            $this->assertSame($before + ($allowed ? 1 : 0), DB::table('monitoring_entries')->count());
            $edit = $this->putJson($this->url($research), [...$body, 'entry_id' => $seedId, 'activity' => 'Edited fixture.'], self::ORIGIN);
            $allowed ? $edit->assertOk() : $edit->assertForbidden();
            $this->assertSame($allowed ? 'Edited fixture.' : 'Original fixture.', DB::table('monitoring_entries')->where('id', $seedId)->value('activity'));

            $filesBefore = Storage::disk('researchnav_private')->allFiles();
            $signature = $this->postJson($this->url($research).'/signature', [
                'monitoring_stage' => $stage, 'entry_id' => $seedId, 'signature' => $this->signature(),
            ], self::ORIGIN);
            if ($allowed) {
                $signature->assertOk();
                Storage::disk('researchnav_private')->assertExists('monitoring-signatures/'.$research->id.'/'.$stage.'/'.$seedId.'.png');
                $this->putJson($this->url($research), [...$body, 'entry_id' => $seedId, 'signature_status' => 'signed'], self::ORIGIN)->assertOk();
            } else {
                $signature->assertForbidden();
                $this->assertSame($filesBefore, Storage::disk('researchnav_private')->allFiles());
            }
            $this->postJson($this->url($research).'/verify', ['monitoring_stage' => $stage], self::ORIGIN)->assertForbidden();
            $delete = $this->deleteJson($this->url($research), ['entry_id' => $seedId], self::ORIGIN);
            $allowed ? $delete->assertOk() : $delete->assertForbidden();
            $this->assertSame(! $allowed, DB::table('monitoring_entries')->where('id', $seedId)->exists());
        }
    }

    public static function managedActors(): array
    {
        return [
            ['panel', 'proposal'], ['panel', 'final'],
            ['research-office', 'proposal'], ['research-office', 'final'],
            ['adviser', 'proposal'], ['adviser', 'final'],
        ];
    }

    public function test_panel_designation_comes_from_the_selected_stage_not_the_first_assignment(): void
    {
        $research = $this->research();
        $actor = $this->actor('panel');
        $this->assign($research, $actor, ['designation' => 'panel_1']); // Stale generic designation.
        $this->team($research, $actor, 'proposal', 'panel_member', 3);
        $this->team($research, $actor, 'final', 'chair');
        $this->withSession(['user_id' => $actor->id]);
        foreach (['after_proposal_defense' => 'Panel 3', 'after_final_defense' => 'Chair'] as $stage => $designation) {
            $this->putJson($this->url($research), $this->body($stage), self::ORIGIN)->assertOk();
            $this->assertSame($designation, DB::table('monitoring_entries')->where('monitoring_stage', $stage)->value('designation'));
        }
        // The old proposal-only endpoint must use the same Panel 3 designation.
        $this->putJson('/api/panel/research/'.$research->id.'/monitoring', $this->legacyBody(), self::ORIGIN)->assertOk();
        $this->assertSame(0, DB::table('monitoring_entries')->whereIn('designation', ['Panel Member', 'Panel 1'])->count());
    }

    public function test_signatures_and_edits_cannot_target_a_different_owned_panel_section(): void
    {
        $research = $this->research();
        $actor = $this->actor('panel');
        $this->assign($research, $actor);
        $this->team($research, $actor, 'proposal');
        $id = $this->entry($research, $actor, 'after_proposal_defense', 'Chair');
        $this->withSession(['user_id' => $actor->id]);
        $this->putJson($this->url($research), [...$this->body('after_proposal_defense'), 'entry_id' => $id], self::ORIGIN)->assertNotFound();
        $this->postJson($this->url($research).'/signature', ['monitoring_stage' => 'after_proposal_defense', 'entry_id' => $id, 'signature' => $this->signature()], self::ORIGIN)->assertNotFound();
        $this->deleteJson($this->url($research), ['entry_id' => $id], self::ORIGIN)->assertForbidden();
        DB::table('monitoring_entries')->where('id', $id)->update(['signature_status' => 'signed']);
        $this->putJson($this->url($research), [
            ...$this->body('after_proposal_defense'), 'signature_entry_id' => $id, 'signature_status' => 'signed',
        ], self::ORIGIN)->assertNotFound();
        $this->assertSame(1, DB::table('monitoring_entries')->count());
        $this->assertSame([], Storage::disk('researchnav_private')->allFiles());
        $this->assertSame('Original fixture.', DB::table('monitoring_entries')->where('id', $id)->value('activity'));
    }

    #[DataProvider('unassignedRoles')]
    public function test_unassigned_actors_cannot_mutate_any_stage_and_office_read_access_is_preserved(string $role): void
    {
        $research = $this->research();
        $actor = $this->actor($role);
        $this->withSession(['user_id' => $actor->id]);
        $read = $this->getJson($this->url($research));
        if (in_array($role, ['research-office', 'admin'], true)) {
            $read->assertOk()->assertJsonPath('data.editable_stages', []);
        } else {
            $read->assertForbidden();
        }
        foreach (self::STAGES as $stage) {
            $id = $this->entry($research, $actor, $stage, 'Panel 2');
            $this->putJson($this->url($research), $this->body($stage), self::ORIGIN)->assertForbidden();
            $this->putJson($this->url($research), [...$this->body($stage), 'entry_id' => $id], self::ORIGIN)->assertForbidden();
            $this->postJson($this->url($research).'/signature', ['monitoring_stage' => $stage, 'entry_id' => $id, 'signature' => $this->signature()], self::ORIGIN)->assertForbidden();
            $this->deleteJson($this->url($research), ['entry_id' => $id], self::ORIGIN)->assertForbidden();
            $this->postJson($this->url($research).'/verify', ['monitoring_stage' => $stage], self::ORIGIN)->assertForbidden();
        }
        $this->assertSame(4, DB::table('monitoring_entries')->count());
        $this->assertSame([], Storage::disk('researchnav_private')->allFiles());
    }

    public static function unassignedRoles(): array
    {
        return [['panel'], ['adviser'], ['research-office'], ['admin'], ['instructor']];
    }

    public function test_section_instructor_retains_all_four_stages_and_verification(): void
    {
        $instructor = $this->actor('instructor');
        $section = ClassSection::create(['instructor_id' => $instructor->id, 'name' => 'Isolated section']);
        $research = $this->research(['section_id' => $section->id]);
        $this->withSession(['user_id' => $instructor->id])->getJson($this->url($research))
            ->assertOk()->assertJsonPath('data.editable_stages', self::STAGES);
        foreach (self::STAGES as $stage) {
            $this->putJson($this->url($research), $this->body($stage), self::ORIGIN)->assertOk();
            $this->completeSections($research, $instructor, $stage);
            $this->postJson($this->url($research).'/verify', ['monitoring_stage' => $stage], self::ORIGIN)
                ->assertOk()->assertJsonPath('data.stages.'.$stage.'.verified_by', $instructor->id);
        }
        // Retain the separate instructor endpoint's original completion rules.
        DB::table('monitoring_entries')->where('monitoring_stage', 'before_proposal_defense')->update(['status' => 'completed', 'signature_status' => 'signed']);
        $this->postJson('/api/instructor/research/'.$research->id.'/monitoring/verify', ['monitoring_stage' => 'before_proposal_defense'], self::ORIGIN)->assertOk();
    }

    public function test_stage_scoped_instructor_cannot_verify_another_defense(): void
    {
        $research = $this->research();
        $actor = $this->actor('instructor');
        $defense = $this->defense($research, 'proposal');
        $this->assign($research, $actor, ['assignment_scope' => 'defense', 'defense_id' => $defense]);
        $this->withSession(['user_id' => $actor->id]);
        foreach (self::STAGES as $stage) {
            $this->completeSections($research, $actor, $stage);
            $response = $this->postJson($this->url($research).'/verify', ['monitoring_stage' => $stage], self::ORIGIN);
            str_contains($stage, '_proposal_') ? $response->assertOk() : $response->assertForbidden();
        }
        $this->assertSame(0, DB::table('monitoring_entries')->whereIn('monitoring_stage', ['before_final_defense', 'after_final_defense'])->whereNotNull('verified_by')->count());
    }

    #[DataProvider('supportActors')]
    public function test_research_wide_support_roles_keep_their_existing_pre_post_limits(string $role): void
    {
        $research = $this->research();
        $actor = $this->actor($role);
        $this->assign($research, $actor, ['status' => 'accepted']);
        $expected = $role === 'statistician' ? ['before_proposal_defense', 'before_final_defense'] : self::STAGES;
        $this->withSession(['user_id' => $actor->id])->getJson($this->url($research))->assertOk()->assertJsonPath('data.editable_stages', $expected);
        foreach (self::STAGES as $stage) {
            $response = $this->putJson($this->url($research), $this->body($stage), self::ORIGIN);
            in_array($stage, $expected, true) ? $response->assertOk() : $response->assertForbidden();
        }
    }

    public static function supportActors(): array
    {
        return [['research_editor'], ['librarian'], ['statistician']];
    }

    #[DataProvider('legacyEndpoints')]
    public function test_role_specific_endpoints_cannot_bypass_stage_authorization(string $role, string $prefix, bool $verification): void
    {
        $research = $this->research();
        $actor = $this->actor($role);
        $this->assign($research, $actor, ['assignment_scope' => 'defense', 'defense_id' => $this->defense($research, 'final')]);
        $this->team($research, $actor, 'final');
        $this->withSession(['user_id' => $actor->id]);
        $url = '/api/'.$prefix.'/research/'.$research->id.'/monitoring'.($verification ? '/verify' : '');
        $body = [...$this->legacyBody(), 'monitoring_stage' => 'before_proposal_defense'];
        $verification ? $this->postJson($url, $body, self::ORIGIN)->assertForbidden() : $this->putJson($url, $body, self::ORIGIN)->assertForbidden();
        $this->assertSame(0, DB::table('monitoring_entries')->count());
    }

    public static function legacyEndpoints(): array
    {
        return [
            ['panel', 'panel', false], ['adviser', 'adviser', false], ['instructor', 'instructor', false],
            ['research_editor', 'editor', false], ['librarian', 'librarian', false], ['statistician', 'statistician', false],
            ['instructor', 'instructor', true],
        ];
    }

    public function test_researcher_can_still_read_all_stages_but_never_edit(): void
    {
        $research = $this->research();
        $actor = $this->actor('researcher');
        $this->assignResearcherToDocument($actor, $research);
        $this->withSession(['user_id' => $actor->id])->getJson($this->url($research))->assertOk()->assertJsonCount(4, 'data.stages')->assertJsonPath('data.editable_stages', []);
        foreach (self::STAGES as $stage) {
            $this->putJson($this->url($research), $this->body($stage), self::ORIGIN)->assertForbidden();
        }
    }

    public function test_authorized_researcher_can_still_read_a_stage_signature(): void
    {
        $research = $this->research();
        $panel = $this->actor('panel');
        $this->assign($research, $panel);
        $this->team($research, $panel, 'proposal');
        $stage = 'after_proposal_defense';
        $id = $this->entry($research, $panel, $stage, 'Panel 2');
        $this->withSession(['user_id' => $panel->id])->postJson($this->url($research).'/signature', [
            'monitoring_stage' => $stage, 'entry_id' => $id, 'signature' => $this->signature(),
        ], self::ORIGIN)->assertOk();
        $this->putJson($this->url($research), [...$this->body($stage), 'entry_id' => $id, 'signature_status' => 'signed'], self::ORIGIN)->assertOk();

        $researcher = $this->actor('researcher');
        $this->assignResearcherToDocument($researcher, $research);
        $this->withSession(['user_id' => $researcher->id])->get($this->url($research).'/signature/'.$stage.'/'.$panel->id.'?entry='.$id)
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_revoked_assignment_and_missing_stage_evidence_fail_closed(): void
    {
        $research = $this->research();
        $actor = $this->actor('research-office');
        $this->assign($research, $actor, ['status' => 'revoked']);
        $this->team($research, $actor, 'proposal');
        $this->withSession(['user_id' => $actor->id])->putJson($this->url($research), $this->body('after_proposal_defense'), self::ORIGIN)->assertForbidden();
        DB::table('research_assignments')->update(['status' => 'active', 'assignment_scope' => 'defense', 'defense_id' => 999]);
        // There is no defenses table in the actual local schema or this fixture.
        $this->putJson($this->url($research), $this->body('after_proposal_defense'), self::ORIGIN)->assertForbidden();
        $this->assertSame(0, DB::table('monitoring_entries')->count());
    }

    public function test_a_defense_scope_cannot_borrow_another_studys_defense(): void
    {
        $research = $this->research();
        $other = $this->research();
        $actor = $this->actor('research-office');
        $this->team($research, $actor, 'proposal');
        $this->assign($research, $actor, ['assignment_scope' => 'defense', 'defense_id' => $this->defense($other, 'proposal')]);
        $this->withSession(['user_id' => $actor->id])->getJson($this->url($research))->assertOk()->assertJsonPath('data.editable_stages', []);
        $this->putJson($this->url($research), $this->body('after_proposal_defense'), self::ORIGIN)->assertForbidden();
        $this->assertSame(0, DB::table('monitoring_entries')->count());
    }

    private function research(array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create($attributes);
    }

    private function actor(string $role): User
    {
        return User::factory()->create(['role' => $role]);
    }

    private function assign(ResearchDocument $research, User $actor, array $attributes = []): void
    {
        DB::table('research_assignments')->insert(array_merge([
            'research_document_id' => $research->id, 'user_id' => $actor->id,
            'assignment_role' => $actor->role, 'status' => 'active', 'assignment_scope' => 'research',
        ], $attributes));
    }

    private function team(ResearchDocument $research, User $actor, string $defense, ?string $teamRole = null, int $position = 2): void
    {
        $teamRole ??= match ($actor->role) {
            'panel' => 'panel_member', 'adviser' => 'adviser',
            'research-office' => 'research_office_representative', default => null,
        };
        if ($teamRole !== null) {
            ResearchProjectTeamMember::create([
                'research_document_id' => $research->id, 'defense_type' => $defense, 'user_id' => $actor->id,
                'team_role' => $teamRole, 'position' => $teamRole === 'panel_member' ? $position : null,
            ]);
        }
    }

    private function defense(ResearchDocument $research, string $type): int
    {
        if (! Schema::hasTable('defenses')) {
            Schema::create('defenses', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('research_document_id');
                $table->string('defense_type');
            });
        }

        return DB::table('defenses')->insertGetId(['research_document_id' => $research->id, 'defense_type' => $type]);
    }

    private function entry(ResearchDocument $research, User $actor, string $stage, string $designation): int
    {
        return DB::table('monitoring_entries')->insertGetId([
            'research_document_id' => $research->id, 'reviewer_id' => $actor->id, 'reviewer_role' => $actor->role,
            'monitoring_stage' => $stage, 'designation' => $designation, 'activity' => 'Original fixture.',
            'status' => 'pending', 'signature_status' => 'unsigned', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function completeSections(ResearchDocument $research, User $actor, string $stage): void
    {
        DB::table('monitoring_entries')->where('research_document_id', $research->id)->where('monitoring_stage', $stage)->delete();
        $required = str_starts_with($stage, 'before_')
            ? ['Adviser', 'Instructor', 'Editor', 'Statistician', 'Librarian']
            : ['Adviser', 'Instructor', 'Editor', 'Librarian', 'Panel 1', 'Panel 2', 'Panel 3', 'Research Rep', 'Chair'];
        foreach ($required as $designation) {
            $id = $this->entry($research, $actor, $stage, $designation);
            DB::table('monitoring_entries')->where('id', $id)->update(['status' => 'not_applicable']);
        }
    }

    private function body(string $stage): array
    {
        return ['monitoring_stage' => $stage, 'activity' => 'Stage authorization fixture.', 'status' => 'pending', 'signature_status' => 'unsigned'];
    }

    private function legacyBody(): array
    {
        return ['activity_date' => '2026-11-10', 'activity' => 'Legacy endpoint fixture.', 'status' => 'pending', 'signature_status' => 'unsigned'];
    }

    private function signature(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('signature.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII='));
    }

    private function url(ResearchDocument $research): string
    {
        return '/api/research/'.$research->id.'/shared-monitoring';
    }
}
