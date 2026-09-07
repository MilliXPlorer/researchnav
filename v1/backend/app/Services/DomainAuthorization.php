<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Models\UserRole;

class DomainAuthorization
{
    public static function isActiveAccount(User $user): bool
    {
        return $user->account_status === 'active';
    }

    public static function isActiveAdministrator(User $user): bool
    {
        return self::isActiveAccount($user)
            && $user->is_admin
            && $user->role === 'admin'
            && $user->roleDefinition?->slug === UserRole::ADMINISTRATOR
            && $user->roleDefinition?->is_active === true;
    }

    /** @param array<int, string> $roles Legacy roles or canonical slugs. */
    public static function hasAnyRole(User $user, array $roles): bool
    {
        if (! self::isActiveAccount($user)) {
            return false;
        }

        $roleDefinition = $user->roleDefinition;
        if ($roleDefinition === null || ! $roleDefinition->is_active) {
            return false;
        }

        $canonical = $roleDefinition->slug;
        $legacy = $user->role;

        foreach ($roles as $role) {
            if ($role === $legacy || $role === $canonical) {
                return true;
            }
        }

        return false;
    }

    public static function isReviewer(User $user): bool
    {
        return self::hasAnyRole($user, ['adviser', 'instructor', UserRole::RESEARCH_ADVISER, UserRole::RESEARCH_INSTRUCTOR]);
    }

    public static function isResearcher(User $user): bool
    {
        return self::hasAnyRole($user, ['researcher', UserRole::RESEARCHER]);
    }

    /**
     * Researcher workflow actions require both the active researcher identity
     * and ownership.  Do not substitute a matching submitted_by value for the
     * role check: compatibility roles can own historical rows.
     */
    public static function isResearcherOwner(User $user, ResearchDocument $research): bool
    {
        return self::isResearcher($user) && $research->submitted_by === $user->id;
    }

    public static function isResearcherParticipant(User $user, ResearchDocument $research): bool
    {
        return self::isResearcher($user)
            && ($research->submitted_by === $user->id
                || $research->authors()->where('user_id', $user->id)->exists());
    }

    public static function isOffice(User $user): bool
    {
        // The canonical research_office role also represents several historical
        // roles.  Those roles must remain readable, but must not inherit office
        // authority merely through their compatibility mapping.
        return self::isActiveAdministrator($user)
            || ($user->role === 'research-office' && self::hasAnyRole($user, [UserRole::RESEARCH_OFFICE]));
    }

    public static function isAssignedReviewer(User $user, ResearchDocument $research): bool
    {
        return ReviewAssignment::identityCompatible()
            && self::isReviewer($user)
            && $research->reviewAssignments()
                ->where(ReviewAssignment::column('reviewer_id'), $user->id)
                ->where(ReviewAssignment::column('review_role'), $user->role)
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true)
                ->exists();
    }

    public static function canReview(User $user, ResearchDocument $research): bool
    {
        return self::isOffice($user) || self::isAssignedReviewer($user, $research);
    }

    /** Assigned panelists and statisticians may read a record but cannot use reviewer mutations. */
    public static function isAssignedRecordReader(User $user, ResearchDocument $research): bool
    {
        return ReviewAssignment::identityCompatible()
            && (self::isAssignedReviewer($user, $research)
            || (self::hasAnyRole($user, ['panel', 'statistician', UserRole::RESEARCH_PANELIST, UserRole::STATISTICIAN])
                && $research->reviewAssignments()
                    ->where(ReviewAssignment::column('reviewer_id'), $user->id)
                    ->where(ReviewAssignment::column('review_role'), $user->role)
                    ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true)
                    ->exists()));
    }
}
