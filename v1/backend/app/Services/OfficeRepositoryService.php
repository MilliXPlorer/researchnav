<?php

namespace App\Services;

use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
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
            $document = ResearchDocument::withTrashed()->whereKey($documentId)->lockForUpdate()->firstOrFail();
            $actor = $this->currentOfficeActor($actor);
            if ($document->trashed()) {
                return null;
            }

            $this->ensureInstituteProgramPair($document, $data);
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
            if (array_key_exists('authors', $data)) {
                $this->syncAuthors($document, $data['authors']);
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
            $document = ResearchDocument::withTrashed()->whereKey($documentId)->lockForUpdate()->firstOrFail();
            $actor = $this->currentOfficeActor($actor);
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
        return DB::transaction(function () use ($actor, $documentId, $request): ?ResearchDocument {
            $document = ResearchDocument::onlyTrashed()->whereKey($documentId)->lockForUpdate()->first();
            $actor = $this->currentOfficeActor($actor);
            if ($document === null) {
                return null;
            }

            $description = "Restored {$document->submission_reference} from the repository recycle bin.";
            ResearchDocument::withoutTimestamps(fn () => $document->restore());
            $this->monitoring->log($document, 'OFFICE_REPOSITORY_RESTORED', $actor, $description, $document->submission_status, $document->submission_status, 'open');
            $this->audit->log($actor, 'OFFICE_REPOSITORY_RESTORED', $document, $description, $request);

            if ($this->isEligibleForReindex($document)) {
                DB::afterCommit(function () use ($document): void {
                    try {
                        $this->manuscriptSearch->reindex((int) $document->id, true, true);
                    } catch (Throwable $exception) {
                        Log::warning('Office repository restore projection reindex failed.', [
                            'research_document_id' => (int) $document->id,
                            'exception' => $exception::class,
                        ]);
                    }
                });
            }

            return $document;
        });
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

    /** @param array<string, mixed> $data */
    private function ensureInstituteProgramPair(ResearchDocument $document, array $data): void
    {
        if (! array_key_exists('institute', $data) && ! array_key_exists('degree_program', $data)) {
            return;
        }

        $institute = array_key_exists('institute', $data) ? $data['institute'] : $document->institute;
        $program = array_key_exists('degree_program', $data) ? $data['degree_program'] : $document->degree_program;
        if ($program !== null && ! in_array($program, ResearchDocument::PROGRAMS_BY_INSTITUTE[$institute] ?? [], true)) {
            throw ValidationException::withMessages([
                'degree_program' => ['Select a program offered by the chosen institute.'],
            ]);
        }
    }

    private function isEligibleForReindex(ResearchDocument $document): bool
    {
        return in_array($document->submission_status, ['approved', 'archived'], true)
            && $document->archive_status === 'archived'
            && $document->visibility === 'public';
    }

    /**
     * Preserve an existing author's relationship metadata whenever possible.
     * Unchanged names keep their row when reordered; otherwise, remaining rows
     * are treated as renamed in their existing order. Excess rows are removed
     * and new names are created without a linked user or correspondence flag.
     *
     * @param  array<int, string>  $authorNames
     */
    private function syncAuthors(ResearchDocument $document, array $authorNames): void
    {
        $authorNames = array_values($authorNames);
        $existingAuthors = $document->authors()
            ->orderBy('author_order')
            ->orderBy('id')
            ->get()
            ->values();
        $availableAuthors = $existingAuthors->keyBy('id');
        $authorsByName = $existingAuthors->keyBy(
            fn (ResearchAuthor $author): string => mb_strtolower(trim($author->author_name)),
        );
        $assignments = [];

        foreach ($authorNames as $index => $authorName) {
            $matchingAuthor = $authorsByName->get(mb_strtolower(trim($authorName)));
            if ($matchingAuthor === null || ! $availableAuthors->has($matchingAuthor->id)) {
                continue;
            }

            $assignments[$index] = $matchingAuthor;
            $availableAuthors->forget($matchingAuthor->id);
        }

        foreach (array_keys($authorNames) as $index) {
            if (array_key_exists($index, $assignments)) {
                continue;
            }

            $matchingAuthor = $availableAuthors->shift();
            if ($matchingAuthor !== null) {
                $assignments[$index] = $matchingAuthor;
            }
        }

        ResearchAuthor::query()
            ->where('research_document_id', $document->id)
            ->whereKey($availableAuthors->keys())
            ->delete();

        $temporaryOrder = ((int) $existingAuthors->max('author_order')) + $existingAuthors->count() + 1;
        $temporaryPrefix = '__office_repository_author_'.Str::uuid().'_';
        foreach ($assignments as $index => $author) {
            $author->update([
                'author_name' => $temporaryPrefix.$author->id,
                'author_order' => $temporaryOrder + $index,
            ]);
        }

        foreach ($authorNames as $index => $authorName) {
            if (isset($assignments[$index])) {
                $assignments[$index]->update([
                    'author_name' => trim($authorName),
                    'author_order' => $index + 1,
                ]);

                continue;
            }

            ResearchAuthor::query()->create([
                'research_document_id' => $document->id,
                'user_id' => null,
                'author_name' => trim($authorName),
                'author_order' => $index + 1,
                'is_corresponding_author' => false,
            ]);
        }
    }
}
