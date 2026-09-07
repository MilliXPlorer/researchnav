<?php

namespace App\Policies;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\DomainAuthorization;

class DocumentFilePolicy
{
    public function upload(User $user, ResearchDocument $research, string $documentType): bool
    {
        if (! in_array($documentType, DocumentFile::TYPES, true)) {
            return false;
        }

        if (in_array($research->submission_status, ['draft', 'revision_required'], true)) {
            return $documentType !== 'final_manuscript'
                && (DomainAuthorization::isResearcherParticipant($user, $research)
                    || DomainAuthorization::isActiveAdministrator($user));
        }

        return $research->submission_status === 'approved'
            && in_array($documentType, ['final_manuscript', 'attachment'], true)
            && (DomainAuthorization::isOffice($user) || DomainAuthorization::isActiveAdministrator($user));
    }

    public function view(User $user, DocumentFile $file): bool
    {
        $r = $file->researchDocument;

        if ($r->import_source_sha256 !== null && ! ($file->is_current
            && $file->document_type === 'final_manuscript'
            && $r->submission_status === 'archived'
            && $r->archive_status === 'archived'
            && in_array($r->visibility, ['registered_only', 'public'], true))) {
            return DomainAuthorization::isOffice($user);
        }

        return DomainAuthorization::isResearcherParticipant($user, $r)
            || DomainAuthorization::isOffice($user)
            || DomainAuthorization::isAssignedRecordReader($user, $r)
            || ($file->is_current && $file->document_type === 'final_manuscript' && $r->submission_status === 'archived' && $r->archive_status === 'archived' && in_array($r->visibility, ['registered_only', 'public'], true));
    }

    public function manage(User $user, DocumentFile $file): bool
    {
        $research = $file->researchDocument;

        if (! DomainAuthorization::isActiveAccount($user)) {
            return false;
        }

        if ($research->import_source_sha256 !== null && $research->submission_status === 'archived') {
            return DomainAuthorization::isOffice($user);
        }

        if (in_array($research->submission_status, ['draft', 'revision_required'], true)) {
            return $file->document_type !== 'final_manuscript'
                && (DomainAuthorization::isResearcherParticipant($user, $research) || DomainAuthorization::isActiveAdministrator($user));
        }

        return $research->submission_status === 'approved'
            && in_array($file->document_type, ['final_manuscript', 'attachment'], true)
            && (DomainAuthorization::isActiveAdministrator($user) || DomainAuthorization::isOffice($user));
    }
}
