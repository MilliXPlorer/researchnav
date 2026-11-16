<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\ReviewAssignment;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Read-only authorization of one actor's section in one defense stage. */
class DefenseMonitoringAuthorization
{
    private const STAGES = ['before_proposal_defense', 'after_proposal_defense', 'before_final_defense', 'after_final_defense'];

    /** @return array{string, string}|null */
    public function section(User $actor, ResearchDocument $research, string $stage): ?array
    {
        $role = $actor->roleDefinition?->slug === 'research_editor' ? 'research_editor' : $actor->role;
        if (! in_array($stage, self::STAGES, true)
            || ! in_array($role, ['adviser', 'instructor', 'panel', 'research-office', 'research_editor', 'statistician', 'librarian'], true)
            || $actor->deleted_at !== null
            || ! DomainAuthorization::hasAnyRole($actor, [$role])) {
            return null;
        }
        $before = str_starts_with($stage, 'before_');
        if (($before && in_array($role, ['panel', 'research-office'], true)) || (! $before && $role === 'statistician')) {
            return null;
        }
        // The section owner has explicit study-wide instructor authority.
        if ($role === 'instructor' && DomainAuthorization::isSectionInstructor($actor, $research)) {
            return ['instructor', 'Instructor'];
        }

        $defenseType = str_contains($stage, '_final_defense') ? 'final' : 'proposal';
        $active = ReviewAssignment::column('is_active');
        $assignments = $research->reviewAssignments()
            ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
            ->where(ReviewAssignment::column('review_role'), $role)
            ->when($active === 'status', fn ($query) => $query->whereIn($active, ['accepted', 'confirmed', 'active']), fn ($query) => $query->where($active, true))
            ->get()
            ->filter(fn (ReviewAssignment $assignment): bool => in_array($assignment->status, ['accepted', 'confirmed', 'active'], true)
                && $this->assignmentApplies($assignment, $research, $defenseType));
        if ($assignments->isEmpty()) {
            return null;
        }

        $teamRoles = match ($role) {
            'adviser' => ['adviser'],
            'panel' => ['chair', 'panel_member'],
            'research-office' => ['research_office_representative'],
            default => [],
        };
        if ($teamRoles !== []) {
            if (Schema::hasColumn('research_project_team_members', 'defense_type')) {
                // Managed roles use the selected stage's team, never a team
                // or a generic assignment belonging to another defense.
                $members = ResearchProjectTeamMember::query()
                    ->where('research_document_id', $research->id)->where('defense_type', $defenseType)
                    ->where('user_id', $actor->id)->whereIn('team_role', $teamRoles)->get();
                if ($members->count() !== 1) {
                    return null;
                }
                $member = $members->first();
                $designation = match ($member->team_role) {
                    'adviser' => 'Adviser',
                    'research_office_representative' => 'Research Rep',
                    'chair' => 'Chair',
                    'panel_member' => in_array($member->position, [1, 2, 3], true) ? 'Panel '.$member->position : null,
                };

                return $designation === null ? null : [$role, $designation];
            }

            // Older schemas may carry explicit stage assignments instead of a
            // stage-team table. Unscoped managed assignments cannot prove access.
            $assignment = $assignments->first(fn (ReviewAssignment $item): bool => $this->hasExplicitStage($item));
            if ($assignment === null) {
                return null;
            }
            $designation = match ($role) {
                'adviser' => 'Adviser',
                'research-office' => 'Research Rep',
                'panel' => $assignment->designation === 'panel_chair' ? 'Chair'
                    : (preg_match('/^panel_([1-3])$/', (string) $assignment->designation, $match) === 1 ? 'Panel '.$match[1] : null),
            };

            return $designation === null ? null : [$role, $designation];
        }

        // Existing research-wide support assignments apply to both defenses;
        // explicitly scoped support/instructor assignments were filtered above.
        return [$role, match ($role) {
            'instructor' => 'Instructor', 'research_editor' => 'Editor',
            'statistician' => 'Statistician', 'librarian' => 'Librarian',
        }];
    }

    /** @return array{string, string} */
    public function authorizeSection(User $actor, ResearchDocument $research, string $stage): array
    {
        $section = $this->section($actor, $research, $stage);
        abort_if($section === null, 403);

        return $section;
    }

    private function assignmentApplies(ReviewAssignment $assignment, ResearchDocument $research, string $defenseType): bool
    {
        if (Schema::hasColumn($assignment->getTable(), 'defense_type')) {
            return $assignment->defense_type === $defenseType;
        }
        if (! Schema::hasColumn($assignment->getTable(), 'assignment_scope')) {
            return true;
        }
        if ($assignment->assignment_scope === 'research') {
            return $assignment->defense_id === null;
        }
        if ($assignment->assignment_scope !== 'defense' || $assignment->defense_id === null
            || ! Schema::hasTable('defenses') || ! Schema::hasColumns('defenses', ['id', 'research_document_id', 'defense_type'])) {
            return false;
        }

        return DB::table('defenses')->where('id', $assignment->defense_id)
            ->where('research_document_id', $research->id)->where('defense_type', $defenseType)->exists();
    }

    private function hasExplicitStage(ReviewAssignment $assignment): bool
    {
        return Schema::hasColumn($assignment->getTable(), 'defense_type')
            || (Schema::hasColumn($assignment->getTable(), 'assignment_scope') && $assignment->assignment_scope === 'defense');
    }
}
