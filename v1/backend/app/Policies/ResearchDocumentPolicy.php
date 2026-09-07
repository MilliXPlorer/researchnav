<?php

namespace App\Policies;

use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\DomainAuthorization;

class ResearchDocumentPolicy
{
    public function view(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $research)
            || DomainAuthorization::isOffice($user)
            || DomainAuthorization::isAssignedRecordReader($user, $research)
            || ($research->submission_status === 'archived' && $research->archive_status === 'archived' && in_array($research->visibility, ['registered_only', 'public'], true));
    }

    public function update(User $user, ResearchDocument $research): bool
    {
        if ($research->import_source_sha256 !== null && $research->submission_status === 'archived') {
            return DomainAuthorization::isOffice($user);
        }

        return (DomainAuthorization::isResearcherParticipant($user, $research) || DomainAuthorization::isActiveAdministrator($user))
            && in_array($research->submission_status, ['draft', 'revision_required'], true);
    }

    public function delete(User $user, ResearchDocument $research): bool
    {
        return $research->import_source_sha256 !== null && DomainAuthorization::isOffice($user);
    }

    public function viewInternal(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $research)
            || DomainAuthorization::canReview($user, $research)
            || DomainAuthorization::isAssignedRecordReader($user, $research);
    }

    public function submit(User $user, ResearchDocument $research): bool
    {
        return (DomainAuthorization::isResearcherParticipant($user, $research) || DomainAuthorization::isActiveAdministrator($user))
            && $research->submission_status === 'draft';
    }

    public function transition(User $user, ResearchDocument $research, string $target): bool
    {
        return $target === 'approved'
            ? DomainAuthorization::isOffice($user)
            : DomainAuthorization::canReview($user, $research);
    }

    public function archive(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isOffice($user);
    }

    public function reportProgress(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::isResearcherParticipant($user, $research)
            && $research->import_source_sha256 === null
            && $research->research_stage === 'ongoing'
            && in_array($research->submission_status, ['draft', 'submitted', 'under_review', 'revision_required', 'approved'], true);
    }
}
