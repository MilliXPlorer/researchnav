<?php

namespace App\Services;

use App\Models\AccessRequest;
use App\Models\User;
use App\Notifications\AccessRequestNotification;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

/**
 * Workspace access requests for accounts that Google has already authenticated.
 *
 * This is the approval half of the documented registration workflow. It never
 * creates an account and never handles a credential: the applicant is already
 * signed in with Google and is simply asking an administrator to assign a role.
 */
class AccessRequestService
{
    public function __construct(private readonly AuditService $audit) {}

    /** Roles an applicant may ask for. Administrator is never self-requestable. */
    public const REQUESTABLE_ROLES = [
        'researcher', 'adviser', 'instructor', 'panel',
        'statistician', 'coordinator', 'librarian', 'research-office', 'academics',
    ];

    /**
     * @param  array{requested_role: string, full_name?: string|null, program?: string|null, justification?: string|null}  $data
     */
    public function submit(User $actor, array $data, Request $request): AccessRequest
    {
        return DB::transaction(function () use ($actor, $data, $request): AccessRequest {
            $locked = User::query()->lockForUpdate()->find($actor->id);

            if ($locked === null) {
                throw new AccessRequestException('ACCOUNT_NOT_FOUND');
            }

            // An account that already has active access has nothing to request.
            if ($locked->access_status === 'active') {
                throw new AccessRequestException('ACCESS_ALREADY_GRANTED');
            }

            $alreadyPending = AccessRequest::query()
                ->where('user_id', $locked->id)
                ->where('status', 'pending')
                ->lockForUpdate()
                ->exists();

            if ($alreadyPending) {
                throw new AccessRequestException('REQUEST_ALREADY_PENDING');
            }

            $accessRequest = AccessRequest::query()->create([
                'user_id' => $locked->id,
                'requested_role' => $data['requested_role'],
                'status' => 'pending',
                'full_name' => $data['full_name'] ?? null,
                'program' => $data['program'] ?? null,
                'justification' => $data['justification'] ?? null,
                'requested_at' => now(),
            ]);

            $this->audit->log(
                $locked,
                'ACCESS_REQUEST_SUBMITTED',
                $accessRequest,
                "Requested the {$accessRequest->requested_role} workspace role.",
                $request,
            );

            return $accessRequest;
        }, 3);
    }

    /** The applicant's own most recent request, used to show them its status. */
    public function latestFor(User $actor): ?AccessRequest
    {
        return AccessRequest::query()
            ->where('user_id', $actor->id)
            ->latest('requested_at')
            ->latest('id')
            ->first();
    }

    public function paginate(?string $status, int $perPage): LengthAwarePaginator
    {
        return AccessRequest::query()
            ->with(['user:id,email,access_status,role', 'decidedBy:id,email'])
            ->when($status !== null, fn (Builder $query) => $query->where('status', $status))
            ->orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
            ->latest('requested_at')
            ->latest('id')
            ->paginate($perPage);
    }

    /**
     * Approving assigns the granted role and activates the account. Rejecting
     * records the decision and leaves the account without access.
     *
     * @param  array{decision: string, granted_role?: string|null, decision_remarks?: string|null}  $data
     */
    public function decide(User $actor, int|string $accessRequestId, array $data, Request $request): AccessRequest
    {
        return DB::transaction(function () use ($actor, $accessRequestId, $data, $request): AccessRequest {
            $lockedActor = User::query()->with('roleDefinition')->lockForUpdate()->find($actor->id);

            if ($lockedActor === null || ! DomainAuthorization::isActiveAdministrator($lockedActor)) {
                throw new AccessRequestException('ADMINISTRATOR_ACCESS_REVOKED');
            }

            $accessRequest = AccessRequest::query()->lockForUpdate()->find($accessRequestId);

            if ($accessRequest === null) {
                throw new AccessRequestException('REQUEST_NOT_FOUND');
            }

            if ($accessRequest->status !== 'pending') {
                throw new AccessRequestException('REQUEST_ALREADY_DECIDED');
            }

            $applicant = User::query()->lockForUpdate()->find($accessRequest->user_id);

            if ($applicant === null) {
                throw new AccessRequestException('ACCOUNT_NOT_FOUND');
            }

            if ($lockedActor->is($applicant)) {
                throw new AccessRequestException('SELF_DECISION_NOT_ALLOWED');
            }

            $approved = $data['decision'] === 'approve';
            $grantedRole = $data['granted_role'] ?? $accessRequest->requested_role;

            if ($approved) {
                // Administrator access is provisioned directly, never granted here.
                if ($grantedRole === 'admin') {
                    throw new AccessRequestException('ROLE_NOT_GRANTABLE');
                }

                $applicant->fill(['role' => $grantedRole, 'access_status' => 'active']);
                $applicant->confirmed_at ??= now();
                $applicant->save();
            }

            $accessRequest->fill([
                'status' => $approved ? 'approved' : 'rejected',
                'requested_role' => $approved ? $grantedRole : $accessRequest->requested_role,
                'decided_by' => $lockedActor->id,
                'decision_remarks' => $data['decision_remarks'] ?? null,
                'decided_at' => now(),
            ])->save();

            $applicant->notify(new AccessRequestNotification(
                $approved ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_REJECTED',
                $approved ? 'Workspace access approved' : 'Workspace access not approved',
                $approved
                    ? "Your account was granted the {$grantedRole} workspace."
                    : 'Your access request was reviewed and not approved.',
            ));

            $this->audit->log(
                $lockedActor,
                $approved ? 'ACCESS_REQUEST_APPROVED' : 'ACCESS_REQUEST_REJECTED',
                $accessRequest,
                $approved
                    ? "Granted the {$grantedRole} workspace to {$applicant->email}."
                    : "Rejected the access request from {$applicant->email}.",
                $request,
            );

            return $accessRequest->fresh(['user', 'decidedBy']);
        }, 3);
    }
}
