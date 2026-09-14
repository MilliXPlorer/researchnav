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
        return DomainAuthorization::isOffice($user) || DomainAuthorization::canReview($user, $research);
    }

    public function update(User $user, FeedbackComment $feedback): bool
    {
        return DomainAuthorization::isOffice($user)
            || (DomainAuthorization::isActiveAccount($user)
                && $feedback->user_id === $user->id
                && DomainAuthorization::canReview($user, $feedback->researchDocument));
    }

    public function researcherAction(User $user, FeedbackComment $feedback): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $feedback->researchDocument);
    }
}
