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
        return ($research->submitted_by === $user->id && in_array($research->submission_status, ['draft', 'revision_required'], true))
            || (DomainAuthorization::isOffice($user) && $research->submission_status === 'approved' && in_array($documentType, ['final_manuscript', 'attachment'], true));
    }

    public function view(User $user, DocumentFile $file): bool
    {
        $r = $file->researchDocument;

        if ($r->import_source_sha256 !== null) {
            return DomainAuthorization::isOffice($user);
        }

        return $r->submitted_by === $user->id
            || DomainAuthorization::isOffice($user)
            || DomainAuthorization::isAssignedReviewer($user, $r)
            || ($file->is_current && $r->submission_status === 'archived' && $r->archive_status === 'archived' && in_array($r->visibility, ['registered_only', 'public'], true));
    }
}
