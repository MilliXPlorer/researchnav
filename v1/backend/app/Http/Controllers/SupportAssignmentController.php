<?php

namespace App\Http\Controllers;

use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Services\DomainAuthorization;
use App\Services\MonitoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SupportAssignmentController extends DomainController
{
    private const ROLES = ['statistician', 'librarian', 'research_editor'];

    public function eligible(Request $request): JsonResponse
    {
        $this->allowed(DomainAuthorization::isResearcher($this->actor($request)));
        $role = $request->validate(['role' => ['required', Rule::in(self::ROLES)]])['role'];
        $users = User::query()->with('roleDefinition')->where('account_status', 'active')->get()
            ->filter(fn (User $user) => $this->roleFor($user) === $role)
            ->map(fn (User $user) => ['id' => $user->id, 'name' => $user->profileName(), 'email' => $user->email, 'role' => $role])->values();

        return response()->json(['data' => $users]);
    }

    public function index(Request $request, ResearchDocument $researchDocument): JsonResponse
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isResearcherParticipant($actor, $researchDocument)
            || DomainAuthorization::isAssignedRecordReader($actor, $researchDocument)
            || DomainAuthorization::isOffice($actor));

        return response()->json(['data' => $this->assignments($researchDocument)]);
    }

    public function store(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isResearcherParticipant($actor, $researchDocument));
        $input = $request->validate([
            'user_id' => ['required', 'string', 'exists:users,id'],
            'assignment_role' => ['required', Rule::in(self::ROLES)],
            'replace_current' => ['sometimes', 'boolean'],
        ]);
        $selected = User::query()->with('roleDefinition')->findOrFail($input['user_id']);
        if ($this->roleFor($selected) !== $input['assignment_role'] || ! DomainAuthorization::isActiveAccount($selected)) {
            throw ValidationException::withMessages(['user_id' => ['The selected user is not eligible for this support role.']]);
        }
        $statusColumn = ReviewAssignment::column('is_active');
        $current = ReviewAssignment::query()->where('research_document_id', $researchDocument->id)
            ->where(ReviewAssignment::column('review_role'), $input['assignment_role'])
            ->when($statusColumn === 'status', fn ($query) => $query->whereIn($statusColumn, ['requested', 'pending', 'accepted', 'confirmed', 'active']))
            ->latest('id')
            ->first();
        if ($current !== null && ! ($input['replace_current'] ?? false)) {
            throw ValidationException::withMessages(['assignment_role' => ['A current request or assignment already exists for this role. Choose Change to replace it.']]);
        }
        if ($current !== null && (string) $current->reviewer_id === (string) $selected->id) {
            throw ValidationException::withMessages(['user_id' => ['This person is already the current choice for this support role.']]);
        }
        $assignment = DB::transaction(function () use ($actor, $selected, $researchDocument, $input, $current, $activity) {
            if ($current !== null) {
                $previousReviewer = $current->reviewer;
                $current->status = 'replaced';
                $current->is_active = false;
                $current->save();
                $previousReviewer?->notify(new ResearchActivityNotification(
                    $researchDocument,
                    'SUPPORT_ASSIGNMENT_REPLACED',
                    'Research support assignment updated',
                    'Your '.$input['assignment_role'].' assignment for this study was replaced.',
                    '/research/'.$researchDocument->id,
                ));
            }
            $assignment = ReviewAssignment::query()->create([
                'research_document_id' => $researchDocument->id,
                'reviewer_id' => $selected->id,
                'review_role' => $input['assignment_role'],
                'assigned_by' => $actor->id,
                'is_active' => false,
                'status' => 'requested',
                'designation' => $this->supportDesignation($input['assignment_role']),
            ]);
            $activity->log($researchDocument, 'SUPPORT_ASSIGNMENT_REQUESTED', $actor, ($current === null ? 'Requested ' : 'Changed ').$input['assignment_role'].' support.', $current?->status, 'requested', 'open');
            $selected->notify(new ResearchActivityNotification($researchDocument, 'SUPPORT_ASSIGNMENT_REQUESTED', 'Research support request', 'You were requested as '.$input['assignment_role'].'.', '/research/'.$researchDocument->id));

            return $assignment;
        });

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
            ->when($statusColumn === 'status', fn ($query) => $query->whereIn($statusColumn, ['requested', 'pending']), fn ($query) => $query->where($statusColumn, false))
            ->with(['researchDocument.authors', 'reviewer'])->latest()->get()->map(fn (ReviewAssignment $item) => $this->payload($item));

        return response()->json(['data' => $items]);
    }

    public function respond(Request $request, ReviewAssignment $reviewAssignment, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $input = $request->validate(['decision' => ['required', 'in:accept,decline']]);
        if ($reviewAssignment->reviewer_id !== $actor->id || $reviewAssignment->review_role !== $this->roleFor($actor) || ! in_array($reviewAssignment->status, ['requested', 'pending'], true)) {
            abort(403, 'This support request is not available to the current user.');
        }
        $status = $input['decision'] === 'accept' ? 'accepted' : 'declined';
        DB::transaction(function () use ($actor, $reviewAssignment, $status, $activity): void {
            $reviewAssignment->status = $status;
            $reviewAssignment->is_active = $status === 'accepted';
            $reviewAssignment->save();
            $research = $reviewAssignment->researchDocument;
            $activity->log($research, 'SUPPORT_ASSIGNMENT_'.strtoupper($status), $actor, ucfirst($reviewAssignment->review_role).' request '.$status.'.', 'requested', $status, $status);
            $requester = User::query()->find($reviewAssignment->assigned_by);
            $requester?->notify(new ResearchActivityNotification($research, 'SUPPORT_ASSIGNMENT_'.strtoupper($status), 'Research support request '.$status, $actor->profileName().' '.$status.' your '.$reviewAssignment->review_role.' request.', '/research/'.$research->id));
        });

        return response()->json(['data' => $this->payload($reviewAssignment->fresh(['reviewer', 'researchDocument.authors']))]);
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
        return $user->roleDefinition?->slug === 'research_editor' ? 'research_editor' : $user->role;
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
