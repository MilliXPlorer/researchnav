<?php

namespace App\Policies;

use App\Models\ResearchDocument;
use App\Models\Revision;
use App\Models\User;
use App\Services\DomainAuthorization;

class RevisionPolicy
{
    public function create(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::canReview($user, $research);
    }

    public function resubmit(User $user, Revision $revision): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $revision->researchDocument)
            || DomainAuthorization::isActiveAdministrator($user);
    }
}
