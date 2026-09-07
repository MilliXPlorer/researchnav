<?php

namespace App\Policies;

use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\DomainAuthorization;

class FeedbackCommentPolicy
{
    public function create(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isOffice($user) || $this->isAssignedReviewer($user, $research);
    }

    public function update(User $user, FeedbackComment $feedback): bool
    {
        return (DomainAuthorization::isActiveAccount($user) && $feedback->user_id === $user->id && $this->isAssignedReviewer($user, $feedback->researchDocument))
            || DomainAuthorization::isOffice($user)
            || $this->isAssignedReviewer($user, $feedback->researchDocument);
    }

    public function researcherAction(User $user, FeedbackComment $feedback): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $feedback->researchDocument);
    }

    private function isAssignedReviewer(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isAssignedReviewer($user, $research);
    }
}
