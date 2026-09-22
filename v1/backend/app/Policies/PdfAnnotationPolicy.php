<?php

namespace App\Policies;

use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\DocumentReviewAuthorization;
use App\Services\DomainAuthorization;

class PdfAnnotationPolicy
{
    public function view(User $user, ResearchDocument $research): bool
    {
        return $this->viewConsolidated($user, $research) || $this->create($user, $research);
    }

    public function viewConsolidated(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $research);
    }

    public function create(User $user, ResearchDocument $research): bool
    {
        return DocumentReviewAuthorization::canAuthor($user, $research);
    }
}
