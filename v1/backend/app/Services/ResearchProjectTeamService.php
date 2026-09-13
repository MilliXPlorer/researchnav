<?php

namespace App\Services;

use App\Exceptions\ApiValidationException;
use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ResearchProjectTeamService
{
    public function __construct(private readonly AuditService $audit) {}

    private const ELIGIBLE_ROLES = [
        'adviser' => 'adviser',
        'research_office_representative' => 'research-office',
        'chair' => 'panel',
        'panel_member' => 'panel',
    ];

    public function candidates(ClassSection $section, ResearchDocument $document, string $teamRole, ?string $search): array
    {
        $this->assertNested($section, $document);
        $query = User::query()
            ->where('role', self::ELIGIBLE_ROLES[$teamRole])
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

    public function get(ClassSection $section, ResearchDocument $document): array
    {
        $this->assertNested($section, $document);
        $members = ResearchProjectTeamMember::query()->with('user')->where('research_document_id', $document->id)
            ->orderBy('position')->orderBy('id')->get();

        return [
            'section_id' => $section->id,
            'research_document_id' => $document->id,
            'adviser' => $this->member($members->firstWhere('team_role', 'adviser')),
            'research_office_representative' => $this->member($members->firstWhere('team_role', 'research_office_representative')),
            'chair' => $this->member($members->firstWhere('team_role', 'chair')),
            'panel_members' => $members->where('team_role', 'panel_member')->map(fn ($member) => $this->member($member))->values()->all(),
            'complete' => $members->whereIn('team_role', ['adviser', 'research_office_representative', 'chair'])->count() === 3
                && $members->where('team_role', 'panel_member')->isNotEmpty(),
        ];
    }

    public function replace(User $actor, ClassSection $section, ResearchDocument $document, array $input): array
    {
        $this->assertNested($section, $document);
        $slots = [
            'adviser' => array_filter([$input['adviser_id'] ?? null]),
            'research_office_representative' => array_filter([$input['research_office_representative_id'] ?? null]),
            'chair' => array_filter([$input['chair_id'] ?? null]),
            'panel_member' => array_values(array_filter($input['panel_member_ids'] ?? [])),
        ];
        $allIds = collect($slots)->flatten()->values();
        if ($allIds->unique()->count() !== $allIds->count()) {
            throw new ApiValidationException(['team' => ['Each person may only hold one project role.']]);
        }

        DB::transaction(function () use ($actor, $document, $slots, $allIds): void {
            ResearchDocument::query()->lockForUpdate()->findOrFail($document->id);
            $users = User::query()->whereIn('id', $allIds)->lockForUpdate()->get()->keyBy('id');
            foreach ($slots as $teamRole => $ids) {
                foreach ($ids as $id) {
                    $user = $users->get($id);
                    if ($user === null || $user->role !== self::ELIGIBLE_ROLES[$teamRole]
                        || $user->access_status !== 'active' || $user->account_status !== 'active') {
                        throw new ApiValidationException([$teamRole => ['The selected account is not eligible for this role.']]);
                    }
                }
            }
            ResearchProjectTeamMember::query()->where('research_document_id', $document->id)->delete();
            foreach ($slots as $teamRole => $ids) {
                foreach (array_values($ids) as $index => $id) {
                    ResearchProjectTeamMember::query()->create([
                        'research_document_id' => $document->id,
                        'user_id' => $id,
                        'team_role' => $teamRole,
                        'position' => $teamRole === 'panel_member' ? $index + 1 : null,
                        'assigned_by' => $actor->id,
                    ]);
                }
            }
        });

        return $this->get($section, $document);
    }

    public function replaceRole(User $actor, ClassSection $section, ResearchDocument $document, string $teamRole, ?string $userId, ?Request $request = null): array
    {
        $this->assertNested($section, $document);
        if (! array_key_exists($teamRole, self::ELIGIBLE_ROLES)) {
            throw new ApiValidationException(['team_role' => ['Unknown project role.']]);
        }

        DB::transaction(function () use ($actor, $document, $teamRole, $userId, $request): void {
            ResearchDocument::query()->lockForUpdate()->findOrFail($document->id);
            ResearchProjectTeamMember::query()->where('research_document_id', $document->id)
                ->where('team_role', $teamRole)->lockForUpdate()->get();
            if ($userId !== null && $userId !== '') {
                $samePerson = ResearchProjectTeamMember::query()->where('research_document_id', $document->id)
                    ->where('user_id', $userId)->where('team_role', '!=', $teamRole)->exists();
                if ($samePerson) {
                    throw new ApiValidationException([$teamRole => ['Each person may only hold one project role.']]);
                }
                $user = User::query()->lockForUpdate()->findOrFail($userId);
                if ($user->role !== self::ELIGIBLE_ROLES[$teamRole]
                    || $user->access_status !== 'active' || $user->account_status !== 'active') {
                    throw new ApiValidationException([$teamRole => ['The selected account is not eligible for this role.']]);
                }
            }
            ResearchProjectTeamMember::query()->where('research_document_id', $document->id)
                ->where('team_role', $teamRole)->delete();
            if ($userId !== null && $userId !== '') {
                ResearchProjectTeamMember::query()->create([
                    'research_document_id' => $document->id,
                    'user_id' => $userId,
                    'team_role' => $teamRole,
                    'position' => $teamRole === 'panel_member' ? 1 : null,
                    'assigned_by' => $actor->id,
                ]);
            }
            $this->audit->log($actor, 'PROJECT_TEAM_UPDATED', $document, "Updated the {$teamRole} assignment for a research project.", $request);
        });

        return $this->get($section, $document);
    }

    private function assertNested(ClassSection $section, ResearchDocument $document): void
    {
        abort_unless((int) $document->section_id === (int) $section->id, 404);
    }

    private function member(?ResearchProjectTeamMember $member): ?array
    {
        return $member === null ? null : $this->person($member->user, $member->team_role);
    }

    private function person(User $user, string $teamRole): array
    {
        return ['user_id' => $user->id, 'name' => $user->displayName(), 'email' => $user->email, 'team_role' => $teamRole];
    }
}
