<?php

namespace App\Policies;

use App\Models\ResearchDocument;
use App\Models\TitleValidation;
use App\Models\User;
use App\Services\DomainAuthorization;

class TitleValidationPolicy
{
    public function create(User $user, ResearchDocument $research): bool
    {
        return (DomainAuthorization::isResearcherParticipant($user, $research)
                || DomainAuthorization::isActiveAdministrator($user))
            && $research->import_source_sha256 === null
            && in_array($research->submission_status, ['draft', 'submitted', 'under_review', 'revision_required'], true);
    }

    public function recommend(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isAssignedReviewer($user, $research);
    }

    public function update(User $user, TitleValidation $validation): bool
    {
        return DomainAuthorization::isOffice($user);
    }
}
