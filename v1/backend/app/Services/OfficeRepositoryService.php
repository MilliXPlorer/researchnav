<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Throwable;

class OfficeRepositoryService
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly MonitoringService $monitoring,
        private readonly ManuscriptSearchProjectionService $manuscriptSearch,
    ) {}

    /** @param array<string, mixed> $data */
    public function update(User $actor, int $documentId, array $data, ?Request $request = null): ?ResearchDocument
    {
        return DB::transaction(function () use ($actor, $documentId, $data, $request): ?ResearchDocument {
            $actor = $this->currentOfficeActor($actor);
            $document = ResearchDocument::withTrashed()->whereKey($documentId)->lockForUpdate()->firstOrFail();
            if ($document->trashed()) {
                return null;
            }

            $metadata = $this->metadata($data);
            if (array_key_exists('abstract', $metadata)
                && $document->import_source_sha256 !== null
                && (string) $metadata['abstract'] !== (string) $document->abstract) {
                $metadata['abstract_provenance'] = 'Manually corrected by authorized Research Office personnel.';
            }

            $document->fill($metadata);
            $document->save();
            if (array_key_exists('sdg_ids', $data)) {
                $document->sdgs()->sync($data['sdg_ids']);
            }

            $description = "Updated repository metadata for {$document->submission_reference}.";
            $this->monitoring->log($document, 'OFFICE_REPOSITORY_UPDATED', $actor, $description, $document->submission_status, $document->submission_status, 'open');
            $this->audit->log($actor, 'OFFICE_REPOSITORY_UPDATED', $document, $description, $request);

            return $document;
        });
    }

    public function delete(User $actor, int $documentId, ?Request $request = null): bool
    {
        return DB::transaction(function () use ($actor, $documentId, $request): bool {
            $actor = $this->currentOfficeActor($actor);
            $document = ResearchDocument::withTrashed()->whereKey($documentId)->lockForUpdate()->firstOrFail();
            if ($document->trashed()) {
                return false;
            }

            $description = "Moved {$document->submission_reference} to the repository recycle bin.";
            $this->monitoring->log($document, 'OFFICE_REPOSITORY_DELETED', $actor, $description, $document->submission_status, $document->submission_status, 'open');
            $this->audit->log($actor, 'OFFICE_REPOSITORY_DELETED', $document, $description, $request);
            ResearchDocument::withoutTimestamps(fn () => $document->delete());

            return true;
        });
    }

    public function restore(User $actor, int $documentId, ?Request $request = null): ?ResearchDocument
    {
        $document = DB::transaction(function () use ($actor, $documentId, $request): ?ResearchDocument {
            $actor = $this->currentOfficeActor($actor);
            $document = ResearchDocument::onlyTrashed()->whereKey($documentId)->lockForUpdate()->first();
            if ($document === null) {
                return null;
            }

            $description = "Restored {$document->submission_reference} from the repository recycle bin.";
            ResearchDocument::withoutTimestamps(fn () => $document->restore());
            $this->monitoring->log($document, 'OFFICE_REPOSITORY_RESTORED', $actor, $description, $document->submission_status, $document->submission_status, 'open');
            $this->audit->log($actor, 'OFFICE_REPOSITORY_RESTORED', $document, $description, $request);

            return $document;
        });

        if ($document !== null && $this->isEligibleForReindex($document)) {
            try {
                $this->manuscriptSearch->reindex((int) $document->id, true, true);
            } catch (Throwable $exception) {
                Log::warning('Office repository restore projection reindex failed.', [
                    'research_document_id' => (int) $document->id,
                    'exception' => $exception::class,
                ]);
            }
        }

        return $document;
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function metadata(array $data): array
    {
        $metadata = array_intersect_key($data, array_flip([
            'category_id', 'title', 'abstract', 'keywords', 'publication_year', 'institute',
            'degree_program', 'manuscript_date_label', 'research_stage',
        ]));
        if (array_key_exists('title', $metadata)) {
            $metadata['normalized_title'] = str($metadata['title'])->lower()->replaceMatches('/[^a-z0-9]+/', ' ')->trim()->toString();
        }

        return $metadata;
    }

    private function currentOfficeActor(User $actor): User
    {
        $current = User::query()->with('roleDefinition')->lockForUpdate()->find($actor->id);
        if ($current === null || ! DomainAuthorization::isOffice($current)) {
            throw new AccessDeniedHttpException('Office authority is required.');
        }

        return $current;
    }

    private function isEligibleForReindex(ResearchDocument $document): bool
    {
        return in_array($document->submission_status, ['approved', 'archived'], true)
            && $document->archive_status === 'archived'
            && $document->visibility === 'public';
    }
}
