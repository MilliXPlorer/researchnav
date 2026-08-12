<?php

namespace App\Policies;

use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\DomainAuthorization;

class ResearchDocumentPolicy
{
    public function view(User $user, ResearchDocument $research): bool
    {
        return $research->submitted_by === $user->id
            || DomainAuthorization::isOffice($user)
            || DomainAuthorization::isAssignedReviewer($user, $research)
            || ($research->submission_status === 'archived' && $research->archive_status === 'archived' && in_array($research->visibility, ['registered_only', 'public'], true));
    }

    public function update(User $user, ResearchDocument $research): bool
    {
        return $research->submitted_by === $user->id && $research->submission_status === 'draft';
    }

    public function viewInternal(User $user, ResearchDocument $research): bool
    {
        return $research->submitted_by === $user->id || DomainAuthorization::canReview($user, $research);
    }

    public function submit(User $user, ResearchDocument $research): bool
    {
        return $research->submitted_by === $user->id && in_array($research->submission_status, ['draft', 'revision_required'], true);
    }

    public function transition(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::canReview($user, $research);
    }

    public function archive(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isOffice($user);
    }
}
