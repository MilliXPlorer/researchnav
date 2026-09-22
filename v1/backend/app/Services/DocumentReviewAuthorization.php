<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\User;
use App\Models\UserRole;

class DocumentReviewAuthorization
{
    public static function canAuthor(User $user, ResearchDocument $research): bool
    {
        if (DomainAuthorization::isOffice($user)) {
            return true;
        }

        return DomainAuthorization::hasAnyRole($user, [
            'adviser',
            'instructor',
            'panel',
            UserRole::RESEARCH_ADVISER,
            UserRole::RESEARCH_INSTRUCTOR,
            UserRole::RESEARCH_PANELIST,
        ]) && DomainAuthorization::isAssignedRecordReader($user, $research);
    }
}
