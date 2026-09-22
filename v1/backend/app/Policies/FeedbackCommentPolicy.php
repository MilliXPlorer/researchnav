<?php

namespace App\Policies;

use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\DocumentReviewAuthorization;
use App\Services\DomainAuthorization;

class FeedbackCommentPolicy
{
    public function view(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $research)
            || $this->create($user, $research);
    }

    public function viewConsolidated(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $research);
    }

    public function create(User $user, ResearchDocument $research): bool
    {
        return DocumentReviewAuthorization::canAuthor($user, $research);
    }

    public function update(User $user, FeedbackComment $feedback): bool
    {
        return DomainAuthorization::isActiveAccount($user)
            && $feedback->user_id === $user->id
            && $this->create($user, $feedback->researchDocument);
    }

    public function researcherAction(User $user, FeedbackComment $feedback): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $feedback->researchDocument);
    }
}
