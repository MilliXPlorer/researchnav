<?php

namespace App\Http\Controllers;

use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Models\UserRole;
use App\Notifications\ResearchActivityNotification;
use App\Services\DomainAuthorization;
use App\Services\MonitoringService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class SupportAssignmentController extends DomainController
{
    private const ROLES = ['statistician', 'librarian', 'research_editor'];

    public function eligible(Request $request): JsonResponse
    {
        $input = $request->validate([
            'research_document_id' => ['required', 'integer', 'exists:research_documents,id'],
            'role' => ['required', Rule::in(self::ROLES)],
            'search' => ['nullable', 'string', 'max:100'],
        ]);
        $research = ResearchDocument::query()->findOrFail($input['research_document_id']);
        $this->allowed($this->isActiveResearcherParticipant($this->actor($request), $research));
        $search = trim((string) ($input['search'] ?? ''));

        if (Str::length($search) === 1) {
            return response()->json(['data' => []])->header('Cache-Control', 'private, no-store');
        }

        $role = $input['role'];
        $users = User::query()
            ->where('account_status', 'active')
            ->where('access_status', 'active')
            ->where('role', $role)
            ->whereHas('roleDefinition', fn ($query) => $query->where('slug', $role)->where('is_active', true))
            ->whereNotIn('id', $this->currentOrPendingReviewerIds($research->id))
            ->tap(fn ($query) => $this->applySearch($query, $search))
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->limit(20)
            ->get()
            ->map(fn (User $user) => ['id' => $user->id, 'name' => $user->profileName(), 'email' => $user->email, 'role' => $role])
            ->values();

        return response()->json(['data' => $users])->header('Cache-Control', 'private, no-store');
    }

    public function index(Request $request, ResearchDocument $researchDocument): JsonResponse
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isResearcherParticipant($actor, $researchDocument)
            || DomainAuthorization::isAssignedRecordReader($actor, $researchDocument)
            || DomainAuthorization::isOffice($actor));

        return response()->json(['data' => $this->assignments($researchDocument)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->allowed($this->isActiveResearcherParticipant($actor, $researchDocument));
        $input = $request->validate([
            'user_id' => ['required', 'string', 'exists:users,id'],
            'assignment_role' => ['required', Rule::in(self::ROLES)],
            'replace_current' => ['sometimes', 'boolean'],
            'expected_current_assignment_id' => ['nullable', 'integer'],
        ]);

        try {
            $assignment = DB::transaction(function () use ($actor, $researchDocument, $input, $activity): ReviewAssignment {
                $research = ResearchDocument::query()->whereKey($researchDocument->id)->lockForUpdate()->firstOrFail();
                $users = User::query()
                    ->whereIn('id', collect([$actor->id, $input['user_id']])->unique()->sort()->values())
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('id');
                $lockedActor = $users->get($actor->id);
                $selected = $users->get($input['user_id']);
                $roleIds = $users->pluck('role_id')->filter()->unique()->sort()->values();
                UserRole::query()->whereIn('id', $roleIds)->orderBy('id')->lockForUpdate()->get();
                $users->each(function (User $user): void {
                    $user->unsetRelation('roleDefinition');
                    $user->load('roleDefinition');
                });
                $isParticipant = $research->section_id !== null && DB::table('class_section_members')
                    ->where('class_section_id', $research->section_id)
                    ->where('research_document_id', $research->id)
                    ->where('user_id', $actor->id)
                    ->lockForUpdate()
                    ->exists();
                $this->allowed($lockedActor !== null && $isParticipant && $this->isActiveResearcher($lockedActor));

                if ($selected === null || ! $this->isEligibleSupportUser($selected, $input['assignment_role'])) {
                    throw ValidationException::withMessages(['user_id' => ['The selected user is not eligible for this support role.']]);
                }

                $assignments = ReviewAssignment::query()
                    ->where('research_document_id', $research->id)
                    ->whereIn(ReviewAssignment::column('review_role'), self::ROLES)
                    ->lockForUpdate()
                    ->get();
                $roleAssignments = $assignments->filter(
                    fn (ReviewAssignment $item) => $item->review_role === $input['assignment_role']
                );
                $pending = $roleAssignments->first(fn (ReviewAssignment $item) => $this->isPending($item));
                $current = $roleAssignments->first(fn (ReviewAssignment $item) => $this->isActive($item));
                if ($pending !== null) {
                    throw new ConflictHttpException('A pending support request already exists for this role.');
                }
                if ($current !== null && (string) $current->reviewer_id === (string) $selected->id) {
                    throw ValidationException::withMessages(['user_id' => ['This person is already the current choice for this support role.']]);
                }
                if ($current !== null && ! ($input['replace_current'] ?? false)) {
                    throw new ConflictHttpException('A current assignment already exists for this role. Choose Change to replace it.');
                }
                $expectedCurrentId = $input['expected_current_assignment_id'] ?? null;
                if (($current !== null && (string) $expectedCurrentId !== (string) $current->id)
                    || ($current === null && $expectedCurrentId !== null)) {
                    throw new ConflictHttpException('This support assignment changed. Refresh and try again.');
                }
                if ($assignments->contains(fn (ReviewAssignment $item) => (string) $item->reviewer_id === (string) $selected->id
                    && ($this->isPending($item) || $this->isActive($item)))) {
                    throw ValidationException::withMessages(['user_id' => ['This person already has an active or pending support assignment for this research project.']]);
                }

                $assignment = ReviewAssignment::query()->create([
                    'research_document_id' => $research->id,
                    'reviewer_id' => $selected->id,
                    'review_role' => $input['assignment_role'],
                    'assigned_by' => $lockedActor->id,
                    'is_active' => false,
                    'status' => 'requested',
                    'designation' => $this->supportDesignation($input['assignment_role']),
                    'support_pending_slot' => ReviewAssignment::supportsPendingSlot() ? true : null,
                    'support_history_slot' => ReviewAssignment::supportsHistorySlot() ? (string) Str::uuid() : null,
                ]);
                $activity->log($research, 'SUPPORT_ASSIGNMENT_REQUESTED', $lockedActor, ($current === null ? 'Requested ' : 'Changed ').$input['assignment_role'].' support.', $current?->status, 'requested', 'open');
                $selected->notify(new ResearchActivityNotification($research, 'SUPPORT_ASSIGNMENT_REQUESTED', 'Research support request', 'You were requested as '.$input['assignment_role'].'.', '/research/'.$research->id));

                return $assignment;
            });
        } catch (QueryException $exception) {
            if ($this->isUniqueConstraintViolation($exception)) {
                throw new ConflictHttpException('A support request already exists or is being processed for this role.');
            }

            throw $exception;
        }

        return response()->json(['data' => $this->payload($assignment->fresh(['reviewer']))], 201);
    }

    public function inbox(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $role = $this->roleFor($actor);
        $this->allowed(in_array($role, self::ROLES, true));
        $statusColumn = ReviewAssignment::column('is_active');
        $items = ReviewAssignment::query()->where(ReviewAssignment::column('reviewer_id'), $actor->id)
            ->where(ReviewAssignment::column('review_role'), $role)
            ->when(ReviewAssignment::supportsStatus(), fn ($query) => $query->whereIn('status', ['requested', 'pending']), fn ($query) => $query->where($statusColumn, false))
            ->with(['researchDocument.authors', 'reviewer'])->latest()->get()->map(fn (ReviewAssignment $item) => $this->payload($item));

        return response()->json(['data' => $items])->header('Cache-Control', 'private, no-store');
    }

    public function respond(Request $request, ReviewAssignment $reviewAssignment, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $input = $request->validate(['decision' => ['required', 'in:accept,decline']]);
        $status = $input['decision'] === 'accept' ? 'accepted' : 'declined';
        $assignment = DB::transaction(function () use ($actor, $reviewAssignment, $status, $activity): ReviewAssignment {
            $researchId = ReviewAssignment::query()->whereKey($reviewAssignment->id)->value('research_document_id');
            abort_unless($researchId !== null, 404);
            $research = ResearchDocument::query()->whereKey($researchId)->lockForUpdate()->firstOrFail();
            $lockedActor = User::query()->whereKey($actor->id)->lockForUpdate()->first();
            abort_unless($lockedActor !== null, 403);
            UserRole::query()->whereKey($lockedActor->role_id)->lockForUpdate()->first();
            $lockedActor->load('roleDefinition');
            $assignments = ReviewAssignment::query()
                ->where('research_document_id', $research->id)
                ->where(ReviewAssignment::column('review_role'), $reviewAssignment->review_role)
                ->lockForUpdate()
                ->get();
            $assignment = $assignments->firstWhere('id', $reviewAssignment->id);
            if ($assignment === null
                || $assignment->reviewer_id !== $lockedActor->id
                || $assignment->review_role !== $this->roleFor($lockedActor)
                || ! $this->isPending($assignment)) {
                abort(403, 'This support request is not available to the current user.');
            }

            if ($status === 'accepted') {
                $assignments->filter(fn (ReviewAssignment $item) => $item->id !== $assignment->id && $this->isActive($item))
                    ->each(function (ReviewAssignment $previous) use ($research, $assignment): void {
                        $previous->status = 'replaced';
                        $previous->is_active = false;
                        $previous->save();
                        $previous->reviewer?->notify(new ResearchActivityNotification(
                            $research,
                            'SUPPORT_ASSIGNMENT_REPLACED',
                            'Research support assignment updated',
                            'Your '.$assignment->review_role.' assignment for this study was replaced.',
                            '/research/'.$research->id,
                        ));
                    });
            }
            $assignment->status = $status;
            $assignment->is_active = $status === 'accepted';
            if (ReviewAssignment::supportsPendingSlot()) {
                $assignment->support_pending_slot = null;
            }
            $assignment->save();
            $activity->log($research, 'SUPPORT_ASSIGNMENT_'.strtoupper($status), $lockedActor, ucfirst($assignment->review_role).' request '.$status.'.', 'requested', $status, $status);
            $requester = User::query()->find($assignment->assigned_by);
            $requester?->notify(new ResearchActivityNotification($research, 'SUPPORT_ASSIGNMENT_'.strtoupper($status), 'Research support request '.$status, $lockedActor->profileName().' '.$status.' your '.$assignment->review_role.' request.', '/research/'.$research->id));

            return $assignment;
        });

        return response()->json(['data' => $this->payload($assignment->fresh(['reviewer', 'researchDocument.authors']))]);
    }

    private function supportDesignation(string $role): string
    {
        return match ($role) {
            'statistician' => 'Statistician',
            'librarian' => 'Librarian',
            'research_editor' => 'Editor',
            default => ucfirst(str_replace('_', ' ', $role)),
        };
    }

    private function roleFor(User $user): string
    {
        foreach (self::ROLES as $role) {
            if ($this->isEligibleSupportUser($user, $role)) {
                return $role;
            }
        }

        return '';
    }

    private function isActiveResearcherParticipant(User $user, ResearchDocument $research): bool
    {
        return $this->isActiveResearcher($user) && DomainAuthorization::isResearcherParticipant($user, $research);
    }

    private function isActiveResearcher(User $user): bool
    {
        return $user->access_status === 'active'
            && DomainAuthorization::isResearcher($user);
    }

    private function isEligibleSupportUser(User $user, string $role): bool
    {
        return $user->account_status === 'active'
            && $user->access_status === 'active'
            && $user->role === $role
            && $user->roleDefinition?->slug === $role
            && $user->roleDefinition?->is_active === true;
    }

    private function isPending(ReviewAssignment $assignment): bool
    {
        return in_array((string) $assignment->status, ['requested', 'pending'], true);
    }

    private function isActive(ReviewAssignment $assignment): bool
    {
        return $assignment->is_active || in_array((string) $assignment->status, ['accepted', 'confirmed', 'active'], true);
    }

    private function currentOrPendingReviewerIds(int $researchId)
    {
        $activeColumn = ReviewAssignment::column('is_active');

        return ReviewAssignment::query()
            ->where('research_document_id', $researchId)
            ->whereIn(ReviewAssignment::column('review_role'), self::ROLES)
            ->when(
                $activeColumn === 'status',
                fn ($query) => $query->whereIn('status', ['requested', 'pending', 'accepted', 'confirmed', 'active']),
                fn ($query) => $query->where(function ($query): void {
                    $query->whereIn('status', ['requested', 'pending', 'accepted', 'confirmed', 'active'])
                        ->orWhere('is_active', true);
                }),
            )
            ->pluck(ReviewAssignment::column('reviewer_id'));
    }

    private function applySearch($query, string $search): void
    {
        $driver = DB::connection()->getDriverName();
        $name = $driver === 'sqlite'
            ? "LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(middle_name, '') || ' ' || COALESCE(last_name, '')))"
            : "LOWER(CONCAT_WS(' ', first_name, middle_name, last_name))";
        foreach (preg_split('/\s+/', $search, -1, PREG_SPLIT_NO_EMPTY) as $token) {
            $like = '%'.$this->escapeLike(Str::lower($token)).'%';
            $query->where(function ($query) use ($name, $like): void {
                $query->whereRaw("{$name} LIKE ? ESCAPE ?", [$like, '\\'])
                    ->orWhereRaw('LOWER(email) LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    private function isUniqueConstraintViolation(QueryException $exception): bool
    {
        return in_array((string) $exception->getCode(), ['23000', '23505'], true)
            || in_array($exception->errorInfo[1] ?? null, [19, 1062], true);
    }

    private function assignments(ResearchDocument $research): array
    {
        return ReviewAssignment::query()->where('research_document_id', $research->id)->whereIn(ReviewAssignment::column('review_role'), self::ROLES)->with('reviewer')->latest()->get()->map(fn ($item) => $this->payload($item))->all();
    }

    private function payload(ReviewAssignment $assignment): array
    {
        return ['id' => $assignment->id, 'research_document_id' => $assignment->research_document_id, 'research_title' => $assignment->researchDocument?->title, 'researchers' => $assignment->researchDocument?->authors?->pluck('author_name')->values()->all() ?? [], 'user_id' => $assignment->reviewer_id, 'name' => $assignment->reviewer?->profileName(), 'assignment_role' => $assignment->review_role, 'status' => $assignment->status, 'created_at' => $assignment->created_at?->toISOString()];
    }
}
