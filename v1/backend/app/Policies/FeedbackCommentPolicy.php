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
        return ($feedback->user_id === $user->id && $this->isAssignedReviewer($user, $feedback->researchDocument))
            || DomainAuthorization::isOffice($user)
            || $this->isAssignedReviewer($user, $feedback->researchDocument);
    }

    private function isAssignedReviewer(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isReviewer($user)
            && $research->reviewAssignments()->where('reviewer_id', $user->id)->where('is_active', true)->exists();
    }
}
