<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\User;
use App\Models\UserRole;

class DomainAuthorization
{
    /** @param array<int, string> $roles Legacy roles or canonical slugs. */
    public static function hasAnyRole(User $user, array $roles): bool
    {
        if ($user->is_admin) {
            return true;
        }

        $canonical = $user->roleDefinition?->slug ?? User::canonicalSlugForLegacyRole($user->role);
        $legacy = $user->role;

        foreach ($roles as $role) {
            if ($role === $legacy || $role === $canonical) {
                return true;
            }

            try {
                if (User::canonicalSlugForLegacyRole($role) === $canonical) {
                    return true;
                }
            } catch (\InvalidArgumentException) {
                // Canonical slugs are compared directly above.
            }
        }

        return false;
    }

    public static function isReviewer(User $user): bool
    {
        return self::hasAnyRole($user, ['adviser', 'instructor', UserRole::RESEARCH_ADVISER, UserRole::RESEARCH_INSTRUCTOR]);
    }

    public static function isOffice(User $user): bool
    {
        // The canonical research_office role also represents several historical
        // roles.  Those roles must remain readable, but must not inherit office
        // authority merely through their compatibility mapping.
        return $user->is_admin || $user->role === 'research-office';
    }

    public static function isAssignedReviewer(User $user, ResearchDocument $research): bool
    {
        return self::isReviewer($user)
            && $research->reviewAssignments()->where('reviewer_id', $user->id)->where('is_active', true)->exists();
    }

    public static function canReview(User $user, ResearchDocument $research): bool
    {
        return self::isOffice($user) || self::isAssignedReviewer($user, $research);
    }
}
