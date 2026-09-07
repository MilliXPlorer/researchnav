<?php

namespace App\Services;

use App\Models\User;
use App\Models\UserRole;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminUserService
{
    public function __construct(private readonly AuditService $audit) {}

    /** @param array{role?: string, access_status?: string} $changes */
    public function update(User $actor, string $targetId, array $changes, Request $request): User
    {
        return DB::transaction(function () use ($actor, $targetId, $changes, $request): User {
            $lockedActor = User::query()->with('roleDefinition')->lockForUpdate()->find($actor->id);
            $target = User::query()->with('roleDefinition')->lockForUpdate()->find($targetId);

            if ($lockedActor === null || ! DomainAuthorization::isActiveAdministrator($lockedActor)) {
                throw new AdminUserMutationException('ADMINISTRATOR_ACCESS_REVOKED');
            }
            if ($target === null) {
                throw (new ModelNotFoundException)->setModel(User::class, [$targetId]);
            }
            if ($lockedActor->is($target)) {
                throw new AdminUserMutationException('SELF_MODIFICATION_NOT_ALLOWED');
            }
            if (($changes['access_status'] ?? null) === 'invited'
                && ($target->confirmed_at !== null || $target->google_sub !== null)) {
                throw new AdminUserMutationException('INVALID_ACCESS_TRANSITION');
            }

            $targetWasActiveAdministrator = DomainAuthorization::isActiveAdministrator($target);
            $newRole = $changes['role'] ?? $target->role;
            $newAccessStatus = $changes['access_status'] ?? $target->access_status;
            $targetWillBeActiveAdministrator = $newRole === 'admin' && $newAccessStatus === 'active';
            if ($targetWasActiveAdministrator && ! $targetWillBeActiveAdministrator && ! $this->hasAnotherActiveAdministrator($target->id)) {
                throw new AdminUserMutationException('LAST_ACTIVE_ADMIN_REQUIRED');
            }

            if (($changes['role'] ?? null) === UserRole::RESEARCH_EDITOR) {
                $editorRoleId = UserRole::query()->where('slug', UserRole::RESEARCH_EDITOR)->where('is_active', true)->value('id');
                if ($editorRoleId === null) {
                    throw new AdminUserMutationException('RESEARCH_EDITOR_ROLE_UNAVAILABLE');
                }
                unset($changes['role']);
                $target->role_id = $editorRoleId;
                $target->is_admin = false;
            } elseif (isset($changes['role'])) {
                $roleSlug = User::canonicalSlugForLegacyRole($changes['role']);
                $target->role_id = UserRole::query()->where('slug', $roleSlug)->value('id');
            }
            $target->fill($changes);
            if (! $target->isDirty()) {
                return $target;
            }
            $target->save();
            $target->refresh();
            $this->audit->log($lockedActor, 'ADMIN_USER_UPDATED', $target, $this->description($changes), $request);

            return $target;
        }, 3);
    }

    private function hasAnotherActiveAdministrator(string $targetId): bool
    {
        return User::query()->whereKeyNot($targetId)->where('role', 'admin')->where('is_admin', true)
            ->where('access_status', 'active')->where('account_status', 'active')
            ->whereHas('roleDefinition', fn ($query) => $query->where('slug', UserRole::ADMINISTRATOR)->where('is_active', true))
            ->lockForUpdate()->exists();
    }

    /** @param array{role?: string, access_status?: string} $changes */
    private function description(array $changes): string
    {
        $parts = [];
        if (isset($changes['role'])) {
            $parts[] = 'role='.$changes['role'];
        }
        if (isset($changes['access_status'])) {
            $parts[] = 'access_status='.$changes['access_status'];
        }

        return 'Administrator updated user '.implode(', ', $parts).'.';
    }
}
