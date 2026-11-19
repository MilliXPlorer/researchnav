<?php

namespace App\Services;

use App\Exceptions\ApiValidationException;
use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Models\UserRole;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ResearchProjectTeamService
{
    public function __construct(private readonly AuditService $audit) {}

    private function teamHasDefenseType(): bool
    {
        return Schema::hasColumn('research_project_team_members', 'defense_type');
    }

    private function reviewHasDefenseType(): bool
    {
        return Schema::hasColumn((new ReviewAssignment)->getTable(), 'defense_type');
    }

    private const ELIGIBLE_ROLES = [
        'researcher' => 'researcher',
        'adviser' => 'adviser',
        'research_office_representative' => 'research-office',
        'chair' => 'panel',
        'panel_member' => 'panel',
    ];

    /**
     * Canonical slugs for each project role. The research-office slot also
     * accepts historical compatibility accounts (coordinator / academics)
     * that share the same canonical research_office identity.
     */
    private const ELIGIBLE_CANONICAL = [
        'researcher' => UserRole::RESEARCHER,
        'adviser' => UserRole::RESEARCH_ADVISER,
        'research_office_representative' => UserRole::RESEARCH_OFFICE,
        'chair' => UserRole::RESEARCH_PANELIST,
        'panel_member' => UserRole::RESEARCH_PANELIST,
    ];

    private const ELIGIBLE_LEGACY = [
        'researcher' => ['researcher'],
        'adviser' => ['adviser'],
        'research_office_representative' => ['research-office', 'coordinator', 'academics'],
        'chair' => ['panel'],
        'panel_member' => ['panel'],
    ];

    private const SUPPORT_ROLES = ['statistician', 'librarian', 'research_editor'];

    public function candidates(ClassSection $section, ResearchDocument $document, string $teamRole, ?string $search): array
    {
        $this->assertNested($section, $document);
        if (! array_key_exists($teamRole, self::ELIGIBLE_ROLES)) {
            throw new ApiValidationException(['team_role' => ['Unknown project role.']]);
        }

        $canonical = self::ELIGIBLE_CANONICAL[$teamRole];
        $legacy = self::ELIGIBLE_LEGACY[$teamRole];
        $query = User::query()
            ->where(function ($roleQuery) use ($legacy, $canonical): void {
                $roleQuery->whereIn('role', $legacy)
                    ->orWhereIn('role_id', UserRole::query()->where('slug', $canonical)->select('id'))
                    ->orWhereHas('roleDefinition', fn ($roles) => $roles->where('slug', $canonical));
            })
            ->where('access_status', 'active')
            ->where('account_status', 'active');
        if ($search !== null && trim($search) !== '') {
            $needle = '%'.trim($search).'%';
            $query->where(fn ($users) => $users->where('email', 'like', $needle)
                ->orWhere('first_name', 'like', $needle)
                ->orWhere('last_name', 'like', $needle));
        }

        return $query->orderBy('last_name')->orderBy('first_name')->get()
            ->map(fn (User $user) => $this->person($user, $teamRole))->values()->all();
    }

    public function get(
        ClassSection $section,
        ResearchDocument $document,
        string $defenseType = 'proposal'
    ): array {
        $this->assertNested($section, $document);
        if (! in_array($defenseType, ['proposal', 'final'], true)) {
            throw new ApiValidationException(['defense_type' => ['Unknown defense type.']]);
        }
        $members = ResearchProjectTeamMember::query()
            ->with('user')
            ->where('research_document_id', $document->id)
            ->when($this->teamHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
            ->orderBy('position')
            ->orderBy('id')
            ->get();
        $section->loadMissing('instructor');

        $support = $this->currentSupportAssignments($document);
        $activeSupport = $support['active'];
        $pendingSupport = $support['pending'];
        $panelCount = $members->where('team_role', 'panel_member')->count();
        $hasPreDefenseActors = $members->firstWhere('team_role', 'adviser') !== null
            && $this->supportAccepted($activeSupport->get('research_editor'))
            && $this->supportAccepted($activeSupport->get('statistician'))
            && $this->supportAccepted($activeSupport->get('librarian'));
        $hasPostDefenseActors = $members->firstWhere('team_role', 'adviser') !== null
            && $members->firstWhere('team_role', 'research_office_representative') !== null
            && $members->firstWhere('team_role', 'chair') !== null
            && $panelCount === 3
            && $this->supportAccepted($activeSupport->get('research_editor'))
            && $this->supportAccepted($activeSupport->get('librarian'));

        return [
            'section_id' => $section->id,
            'research_document_id' => $document->id,
            'defense_type' => $defenseType,
            'instructor' => $section->instructor === null ? null : $this->person($section->instructor, 'instructor'),
            'researchers' => $members
                ->where('team_role', 'researcher')
                ->map(fn ($member) => $this->member($member))
                ->values()
                ->all(),
            'adviser' => $this->member($members->firstWhere('team_role', 'adviser')),
            'research_office_representative' => $this->member($members->firstWhere('team_role', 'research_office_representative')),
            'chair' => $this->member($members->firstWhere('team_role', 'chair')),
            'panel_members' => $members->where('team_role', 'panel_member')->map(fn ($member) => $this->member($member))->values()->all(),
            'support_assignments' => [
                'editor' => $this->supportPayload($activeSupport->get('research_editor')),
                'statistician' => $this->supportPayload($activeSupport->get('statistician')),
                'librarian' => $this->supportPayload($activeSupport->get('librarian')),
            ],
            'pending_support_assignments' => [
                'editor' => $this->supportPayload($pendingSupport->get('research_editor')),
                'statistician' => $this->supportPayload($pendingSupport->get('statistician')),
                'librarian' => $this->supportPayload($pendingSupport->get('librarian')),
            ],
            'pre_defense_ready' => $hasPreDefenseActors,
            'post_defense_ready' => $hasPostDefenseActors,
            'complete' => $members->whereIn('team_role', ['adviser', 'research_office_representative', 'chair'])->count() === 3
                && $panelCount === 3,
        ];
    }

    public function replace(
        User $actor,
        ClassSection $section,
        ResearchDocument $document,
        string $defenseType,
        array $input,
        ?Request $request = null
    ): array {
        $this->assertNested($section, $document);
        $slots = [
            'researcher' => array_values(array_filter($input['researcher_ids'] ?? [])),
            'adviser' => array_values(array_filter([$input['adviser_id'] ?? null])),
            'research_office_representative' => array_values(array_filter([$input['research_office_representative_id'] ?? null])),
            'chair' => array_values(array_filter([$input['chair_id'] ?? null])),
            'panel_member' => array_values(array_filter($input['panel_member_ids'] ?? [])),
        ];
        if (count($slots['panel_member']) > 3) {
            throw new ApiValidationException(['panel_member_ids' => ['A research study can have a maximum of three panel members.']]);
        }

        $allIds = collect($slots)->flatten()->values();
        if ($allIds->unique()->count() !== $allIds->count()) {
            throw new ApiValidationException(['team' => ['Each person may only hold one project role.']]);
        }

        DB::transaction(function () use ($actor, $section, $document, $defenseType, $slots, $allIds, $request): void {
            ResearchDocument::query()->lockForUpdate()->findOrFail($document->id);
            $previousMembers = ResearchProjectTeamMember::query()
                ->where('research_document_id', $document->id)->lockForUpdate()->get();
            $before = ResearchProjectTeamMember::query()
                ->where('research_document_id', $document->id)
                ->when($this->teamHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
                ->get()
                ->groupBy('team_role')
                ->map(fn (Collection $items) => $items->pluck('user_id')->values()->all());
            $users = User::query()->whereIn('id', $allIds)->lockForUpdate()->get()->keyBy('id');
            foreach ($slots as $teamRole => $ids) {
                foreach ($ids as $id) {
                    $user = $users->get($id);
                    if ($user === null || ! $this->isEligible($user, $teamRole)) {
                        throw new ApiValidationException([$teamRole => ['The selected account is not eligible for this role.']]);
                    }
                }
            }

            ResearchProjectTeamMember::query()
                ->where('research_document_id', $document->id)
                ->when($this->teamHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
                ->delete();
            foreach ($slots as $teamRole => $ids) {
                foreach (array_values($ids) as $index => $id) {
                    ResearchProjectTeamMember::query()->create([
                        'research_document_id' => $document->id,
                        'user_id' => $id,
                        'team_role' => $teamRole,
                        'position' => $teamRole === 'panel_member' ? $index + 1 : null,
                        'assigned_by' => $actor->id,
                    ] + ($this->teamHasDefenseType() ? ['defense_type' => $defenseType] : []));
                }
            }

            $this->syncCoreReviewAssignments(
                $actor,
                $section,
                $document,
                $defenseType,
                $slots,
                $previousMembers
            );
            $this->notifyNewAssignments($document, $users, $slots, $before);
            $this->audit->log($actor, 'PROJECT_TEAM_UPDATED', $document, 'Updated the research project actor assignments.', $request);
        });

        return $this->get($section, $document, $defenseType);
    }

    public function replaceRole(
        User $actor,
        ClassSection $section,
        ResearchDocument $document,
        string $defenseType,
        string $teamRole,
        ?string $userId,
        ?Request $request = null
    ): array {
        $this->assertNested($section, $document);

        if (! array_key_exists($teamRole, self::ELIGIBLE_ROLES)) {
            throw new ApiValidationException([
                'team_role' => ['Unknown project role.'],
            ]);
        }

        DB::transaction(function () use (
            $actor,
            $section,
            $document,
            $defenseType,
            $teamRole,
            $userId,
            $request
        ): void {
            ResearchDocument::query()
                ->lockForUpdate()
                ->findOrFail($document->id);

            $previousMembers = ResearchProjectTeamMember::query()
                ->where('research_document_id', $document->id)->lockForUpdate()->get();

            $existing = ResearchProjectTeamMember::query()
                ->where('research_document_id', $document->id)
                ->when($this->teamHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
                ->where('team_role', $teamRole)
                ->lockForUpdate()
                ->get();

            if ($userId !== null && $userId !== '') {
                $user = User::query()
                    ->lockForUpdate()
                    ->findOrFail($userId);

                if (! $this->isEligible($user, $teamRole)) {
                    throw new ApiValidationException([
                        $teamRole => ['The selected account is not eligible for this role.'],
                    ]);
                }

                $conflicting = ResearchProjectTeamMember::query()
                    ->where('research_document_id', $document->id)
                    ->when($this->teamHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
                    ->where('user_id', $userId)
                    ->where('team_role', '!=', $teamRole)
                    ->lockForUpdate()
                    ->get();

                foreach ($conflicting as $member) {
                    if ($this->sameCanonicalRole($member->team_role, $teamRole)) {
                        throw new ApiValidationException([
                            $teamRole => ['Each person may only hold one project role.'],
                        ]);
                    }

                    $member->delete();
                }
            }

            ResearchProjectTeamMember::query()
                ->where('research_document_id', $document->id)
                ->when($this->teamHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
                ->where('team_role', $teamRole)
                ->delete();

            if ($userId !== null && $userId !== '') {
                ResearchProjectTeamMember::query()->create([
                    'research_document_id' => $document->id,
                    'user_id' => $userId,
                    'team_role' => $teamRole,
                    'position' => $teamRole === 'panel_member' ? 1 : null,
                    'assigned_by' => $actor->id,
                ] + ($this->teamHasDefenseType() ? ['defense_type' => $defenseType] : []));
            }

            $members = ResearchProjectTeamMember::query()
                ->where('research_document_id', $document->id)
                ->when($this->teamHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
                ->get();

            $slots = [
                'adviser' => $members
                    ->where('team_role', 'adviser')
                    ->pluck('user_id')
                    ->values()
                    ->all(),

                'research_office_representative' => $members
                    ->where('team_role', 'research_office_representative')
                    ->pluck('user_id')
                    ->values()
                    ->all(),

                'chair' => $members
                    ->where('team_role', 'chair')
                    ->pluck('user_id')
                    ->values()
                    ->all(),

                'panel_member' => $members
                    ->where('team_role', 'panel_member')
                    ->pluck('user_id')
                    ->values()
                    ->all(),
            ];

            $this->syncCoreReviewAssignments(
                $actor,
                $section,
                $document,
                $defenseType,
                $slots,
                $previousMembers
            );

            if (
                $userId !== null
                && $userId !== ''
                && ! $existing->pluck('user_id')->contains($userId)
            ) {
                $user = User::query()->find($userId);

                $user?->notify(new ResearchActivityNotification(
                    $document,
                    'RESEARCH_PROJECT_ACTOR_ASSIGNED',
                    'Research study assignment',
                    'You were assigned as '.$this->roleLabel($teamRole).' for this study.',
                    '/research/'.$document->id,
                ));
            }

            $this->audit->log(
                $actor,
                'PROJECT_TEAM_UPDATED',
                $document,
                "Updated the {$teamRole} assignment for a research project.",
                $request
            );
        });

        return $this->get($section, $document, $defenseType);
    }

    private function syncCoreReviewAssignments(
        User $actor,
        ClassSection $section,
        ResearchDocument $document,
        string $defenseType,
        array $slots,
        Collection $previousMembers
    ): void {
        if (! ReviewAssignment::identityCompatible()) {
            return;
        }

        $desired = [
            ['user_id' => $section->instructor_id, 'review_role' => 'instructor', 'designation' => 'Instructor'],
        ];
        foreach ($slots['adviser'] as $id) {
            $desired[] = ['user_id' => $id, 'review_role' => 'adviser', 'designation' => 'Adviser'];
        }
        foreach ($slots['research_office_representative'] as $id) {
            $desired[] = ['user_id' => $id, 'review_role' => 'research-office', 'designation' => 'Research Rep'];
        }
        foreach ($slots['chair'] as $id) {
            $desired[] = ['user_id' => $id, 'review_role' => 'panel', 'designation' => 'panel_chair'];
        }
        foreach (array_values($slots['panel_member']) as $index => $id) {
            $desired[] = ['user_id' => $id, 'review_role' => 'panel', 'designation' => 'panel_'.($index + 1)];
        }

        if ((new ReviewAssignment)->getTable() === 'research_assignments' && ! $this->reviewHasDefenseType()) {
            $this->syncCanonicalCoreReviewAssignments($actor, $section, $document, $desired, $previousMembers);

            return;
        }

        $wantedKeys = collect($desired)->map(fn ($item) => $item['user_id'].'|'.$item['review_role'])->all();
        $coreRoles = ['adviser', 'instructor', 'panel', 'research-office'];
        $existing = ReviewAssignment::query()
            ->where('research_document_id', $document->id)
            ->when($this->reviewHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
            ->whereIn(ReviewAssignment::column('review_role'), $coreRoles)
            ->get();
        foreach ($existing as $assignment) {
            $key = $assignment->reviewer_id.'|'.$assignment->review_role;
            if (! in_array($key, $wantedKeys, true)) {
                $assignment->is_active = false;
                $assignment->status = 'inactive';
                $assignment->save();
            }
        }

        foreach ($desired as $item) {
            $assignment = ReviewAssignment::query()
                ->where('research_document_id', $document->id)
                ->when($this->reviewHasDefenseType(), fn ($query) => $query->where('defense_type', $defenseType))
                ->where(ReviewAssignment::column('reviewer_id'), $item['user_id'])
                ->where(ReviewAssignment::column('review_role'), $item['review_role'])
                ->first() ?? new ReviewAssignment;
            $assignment->research_document_id = $document->id;
            if ($this->reviewHasDefenseType()) {
                $assignment->defense_type = $defenseType;
            }
            $assignment->reviewer_id = $item['user_id'];
            $assignment->review_role = $item['review_role'];
            $assignment->assigned_by = $actor->id;
            $assignment->is_active = true;
            $assignment->status = 'active';
            $assignment->designation = $item['designation'];
            $assignment->save();
        }
    }

    private function syncCanonicalCoreReviewAssignments(
        User $actor,
        ClassSection $section,
        ResearchDocument $document,
        array $selected,
        Collection $previousMembers
    ): void {
        $currentMembers = ResearchProjectTeamMember::query()
            ->where('research_document_id', $document->id)->lockForUpdate()->get();
        $required = $this->coreAssignmentsForMembers($section, $currentMembers);
        $previous = $this->coreAssignmentsForMembers($section, $previousMembers);
        $activeStatuses = ['accepted', 'confirmed', 'active'];
        // Team-generated canonical grants are research-scoped. Never repurpose
        // a defense-scoped grant or revoke unrelated research-wide reviewers.
        $existing = ReviewAssignment::query()->where('research_document_id', $document->id)
            ->where('assignment_scope', 'research')->whereNull('defense_id')
            ->whereIn('assignment_role', ['adviser', 'instructor', 'panel', 'research-office'])
            ->orderBy('id')->lockForUpdate()->get()
            ->groupBy(fn ($assignment) => $assignment->reviewer_id.'|'.$assignment->review_role);

        foreach (array_diff_key($previous, $required) as $key => $unused) {
            foreach ($existing->get($key, collect()) as $assignment) {
                if (in_array($assignment->status, $activeStatuses, true) && $this->isTeamCoreAssignment($assignment)) {
                    $assignment->status = 'inactive';
                    $assignment->save();
                }
            }
        }

        foreach (collect($selected)->keyBy(fn ($item) => $item['user_id'].'|'.$item['review_role']) as $key => $item) {
            $records = $existing->get($key, collect());
            $activeRecords = $records->filter(fn ($record) => in_array($record->status, $activeStatuses, true));
            $assignment = $activeRecords->first(fn ($record) => ! $this->isTeamCoreAssignment($record))
                ?? $activeRecords->first() ?? $records->first();
            $newTeamMembership = ! array_key_exists($key, $previous);
            $mayReactivate = $newTeamMembership && $records->every(fn ($record) => $record->status === 'inactive' && $this->isTeamCoreAssignment($record));
            if ($assignment !== null && $activeRecords->isEmpty()
                && ! $mayReactivate) {
                // An incidental save must not undo a separately revoked or
                // inactive assignment for an unchanged team membership.
                continue;
            }
            if ($assignment === null) {
                $assignment = new ReviewAssignment;
                $assignment->research_document_id = $document->id;
                $assignment->reviewer_id = $item['user_id'];
                $assignment->review_role = $item['review_role'];
                $assignment->assignment_scope = 'research';
                $assignment->defense_id = null;
            }
            if (! $assignment->exists || $activeRecords->isEmpty()) {
                $assignment->assigned_by = $actor->id;
                $assignment->status = 'active';
            }
            // One generic grant can represent different panel/chair positions;
            // AR-04 resolves the actual designation from the selected team.
            if (! $assignment->exists || $this->isTeamCoreAssignment($assignment)) {
                $assignment->designation = $required[$key]['designation'];
            }
            if ($assignment->isDirty()) {
                $assignment->save();
            }
            foreach ($activeRecords as $duplicate) {
                if ($duplicate->id !== $assignment->id) {
                    $duplicate->status = 'inactive';
                    $duplicate->save();
                }
            }
        }
    }

    private function isTeamCoreAssignment(ReviewAssignment $assignment): bool
    {
        // These are the established labels written by this synchronizer. Keep
        // independent/custom research-wide grants intact when a team is cleared.
        return match ($assignment->review_role) {
            'instructor' => $assignment->designation === 'Instructor',
            'adviser' => $assignment->designation === 'Adviser',
            'research-office' => $assignment->designation === 'Research Rep',
            'panel' => in_array($assignment->designation, ['panel_chair', 'panel_member', 'panel_1', 'panel_2', 'panel_3'], true),
            default => false,
        };
    }

    /** @return array<string, array{user_id:string, review_role:string, designation:string}> */
    private function coreAssignmentsForMembers(ClassSection $section, Collection $members): array
    {
        $required = [$section->instructor_id.'|instructor' => [
            'user_id' => $section->instructor_id, 'review_role' => 'instructor', 'designation' => 'Instructor',
        ]];
        foreach ($members->sortBy(fn ($member) => [$member->defense_type === 'final' ? 1 : 0, $member->position ?? 0, $member->id]) as $member) {
            [$role, $designation] = match ($member->team_role) {
                'adviser' => ['adviser', 'Adviser'],
                'research_office_representative' => ['research-office', 'Research Rep'],
                'chair' => ['panel', 'panel_chair'],
                'panel_member' => ['panel', $member->position === null ? 'panel_member' : 'panel_'.$member->position],
                default => [null, null],
            };
            if ($role !== null) {
                $key = $member->user_id.'|'.$role;
                $required[$key] ??= ['user_id' => $member->user_id, 'review_role' => $role, 'designation' => $designation];
            }
        }

        return $required;
    }

    private function notifyNewAssignments(ResearchDocument $document, Collection $users, array $slots, Collection $before): void
    {
        foreach ($slots as $teamRole => $ids) {
            $previous = collect($before->get($teamRole, []));
            foreach ($ids as $id) {
                if ($previous->contains($id)) {
                    continue;
                }
                $users->get($id)?->notify(new ResearchActivityNotification(
                    $document,
                    'RESEARCH_PROJECT_ACTOR_ASSIGNED',
                    'Research study assignment',
                    'You were assigned as '.$this->roleLabel($teamRole).' for this study.',
                    '/research/'.$document->id,
                ));
            }
        }
    }

    /** @return array{active: Collection, pending: Collection} */
    private function currentSupportAssignments(ResearchDocument $document): array
    {
        if (! ReviewAssignment::identityCompatible()) {
            return ['active' => collect(), 'pending' => collect()];
        }

        $assignments = ReviewAssignment::query()
            ->where('research_document_id', $document->id)
            ->whereIn(ReviewAssignment::column('review_role'), self::SUPPORT_ROLES)
            ->with('reviewer')
            ->latest('id')
            ->get();

        return [
            'active' => $assignments->filter(fn (ReviewAssignment $assignment) => $this->isActiveSupport($assignment))
                ->unique('review_role')->keyBy('review_role'),
            'pending' => $assignments->filter(fn (ReviewAssignment $assignment) => in_array((string) $assignment->status, ['requested', 'pending'], true))
                ->unique('review_role')->keyBy('review_role'),
        ];
    }

    private function isActiveSupport(ReviewAssignment $assignment): bool
    {
        return $assignment->is_active || in_array((string) $assignment->status, ['accepted', 'confirmed', 'active'], true);
    }

    private function supportAccepted(?ReviewAssignment $assignment): bool
    {
        return $assignment !== null && in_array((string) $assignment->status, ['accepted', 'confirmed', 'active'], true);
    }

    private function supportPayload(?ReviewAssignment $assignment): ?array
    {
        if ($assignment === null) {
            return null;
        }

        return [
            'user_id' => $assignment->reviewer_id,
            'name' => $assignment->reviewer?->displayName() ?? 'Assigned account',
            'email' => $assignment->reviewer?->email,
            'assignment_role' => $assignment->review_role,
            'status' => $assignment->status ?? ($assignment->is_active ? 'active' : 'inactive'),
        ];
    }

    private function assertNested(ClassSection $section, ResearchDocument $document): void
    {
        abort_unless((int) $document->section_id === (int) $section->id, 404);
    }

    private function isEligible(User $user, string $teamRole): bool
    {
        if ($user->access_status !== 'active' || $user->account_status !== 'active') {
            return false;
        }
        if (in_array($user->role, self::ELIGIBLE_LEGACY[$teamRole] ?? [], true)) {
            return true;
        }

        return $this->canonicalForUser($user) === (self::ELIGIBLE_CANONICAL[$teamRole] ?? null);
    }

    private function sameCanonicalRole(string $leftTeamRole, string $rightTeamRole): bool
    {
        return (self::ELIGIBLE_CANONICAL[$leftTeamRole] ?? $leftTeamRole)
            === (self::ELIGIBLE_CANONICAL[$rightTeamRole] ?? $rightTeamRole);
    }

    private function canonicalForUser(User $user): ?string
    {
        $slug = $user->relationLoaded('roleDefinition') && $user->roleDefinition !== null
            ? $user->roleDefinition->slug
            : UserRole::query()->whereKey($user->role_id)->value('slug');
        if (is_string($slug) && $slug !== '') {
            return $slug;
        }
        try {
            return User::canonicalSlugForLegacyRole((string) $user->role);
        } catch (\InvalidArgumentException) {
            return null;
        }
    }

    private function member(?ResearchProjectTeamMember $member): ?array
    {
        return $member === null ? null : $this->person($member->user, $member->team_role);
    }

    private function person(User $user, string $teamRole): array
    {
        return ['user_id' => $user->id, 'name' => $user->displayName(), 'email' => $user->email, 'team_role' => $teamRole];
    }

    private function roleLabel(string $teamRole): string
    {
        return match ($teamRole) {
            'researcher' => 'Student Researcher',
            'adviser' => 'Research Adviser',
            'research_office_representative' => 'Research Office Representative',
            'chair' => 'Panel Chair',
            'panel_member' => 'Research Panel',
            default => str_replace('_', ' ', $teamRole),
        };
    }
}
