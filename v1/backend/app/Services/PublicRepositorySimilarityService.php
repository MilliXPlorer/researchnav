<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class PublicRepositorySimilarityService
{
    public function __construct(
        private readonly SimilarityProcessRunner $process,
        private readonly SupabaseStorageService $storage,
        private readonly ManuscriptTextExtractor $extractor,
        private readonly ManuscriptSimilarityTextCache $textCache,
    ) {}

    /**
     * Compare an unpersisted visitor query with every currently eligible public
     * archive. This deliberately has no audit, monitoring, notification, or
     * database-write side effect.
     *
     * @return array<int, array<string, mixed>>
     */
    public function compare(string $query): array
    {
        $maximumCandidates = min(250, max(1, (int) config('researchnav.similarity.maximum_candidates')));
        $candidates = $this->withCloudManuscriptContent($this->eligibleCandidates($maximumCandidates));
        $candidateSnapshots = $this->candidateSnapshots($candidates);

        if ($candidates->count() > $maximumCandidates) {
            throw new PublicRepositorySimilarityCapacityException('Public similarity candidate limit exceeded.');
        }

        $results = $this->process->runQuery($query, $candidates);
        $candidateIds = $candidates->pluck('id')->map(fn ($id): int => (int) $id)->all();
        $currentCandidates = $this->withCloudManuscriptContent($this->eligibleCandidatesById($candidateIds));

        if ($currentCandidates->pluck('id')->sort()->values()->all() !== collect($candidateIds)->sort()->values()->all()) {
            throw new PublicRepositorySimilarityCatalogChangedException('Public similarity catalog changed during scoring.');
        }
        if ($this->candidateSnapshots($currentCandidates) !== $candidateSnapshots) {
            throw new PublicRepositorySimilarityCatalogChangedException('Public similarity catalog changed during scoring.');
        }

        $byId = $currentCandidates->keyBy('id');

        $nonzeroResults = array_values(array_filter(
            $results,
            fn (array $result): bool => $result['title_similarity_score'] !== '0.000000000000'
                || ($result['overall_similarity_score'] !== null && $result['overall_similarity_score'] !== '0.000000000000'),
        ));

        return array_map(function (array $result) use ($byId): array {
            /** @var ResearchDocument $research */
            $research = $byId->get($result['matched_research_id']);

            return [
                'research' => $research,
                ...$result,
                'matched_terms' => $result['matched_terms'],
                'fasttext_support_score' => $result['fasttext_support_score'],
            ];
        }, $nonzeroResults);
    }

    /** @return Collection<int, ResearchDocument> */
    private function eligibleCandidates(int $maximumCandidates): Collection
    {
        return ResearchDocument::query()
            ->with($this->candidateRelations())
            ->whereNull('deleted_at')
            ->where('submission_status', 'archived')
            ->where('archive_status', 'archived')
            ->where('visibility', 'public')
            ->orderBy('id')
            ->limit($maximumCandidates + 1)
            ->get();
    }

    /** @param array<int, int> $candidateIds
     * @return Collection<int, ResearchDocument>
     */
    private function eligibleCandidatesById(array $candidateIds): Collection
    {
        return ResearchDocument::query()
            ->with($this->candidateRelations())
            ->whereIn('id', $candidateIds)
            ->whereNull('deleted_at')
            ->where('submission_status', 'archived')
            ->where('archive_status', 'archived')
            ->where('visibility', 'public')
            ->get();
    }

    /** @return array<int, array{title: string, projection_id: ?int, projection_status: ?string, projection_source_sha256: ?string, projection_body_sha256: ?string, projection_extractor_version: ?string}> */
    private function candidateSnapshots(Collection $candidates): array
    {
        return $candidates->sortBy('id')->mapWithKeys(function (ResearchDocument $candidate): array {
            $projection = $candidate->relationLoaded('manuscriptSearchDocument')
                ? $candidate->getRelation('manuscriptSearchDocument')
                : null;

            return [(int) $candidate->id => [
                'title' => $candidate->title,
                'projection_id' => $projection?->id,
                'projection_status' => $projection?->extraction_status,
                'projection_source_sha256' => $projection?->source_sha256,
                'projection_body_sha256' => $projection?->body_text === null ? null : hash('sha256', $projection->body_text),
                'projection_extractor_version' => $projection?->extractor_version,
            ]];
        })->all();
    }

    /** @return array<int, string> */
    private function candidateRelations(): array
    {
        $relations = ['authors', 'category', 'files'];
        if (Schema::hasTable('manuscript_search_documents')) {
            $relations[] = 'manuscriptSearchDocument';
        }

        return $relations;
    }

    /** @param Collection<int, ResearchDocument> $candidates
     * @return Collection<int, ResearchDocument>
     */
    private function withCloudManuscriptContent(Collection $candidates): Collection
    {
        foreach ($candidates as $candidate) {
            if ($candidate->relationLoaded('manuscriptSearchDocument')
                && $candidate->getRelation('manuscriptSearchDocument') !== null) {
                continue;
            }

            /** @var DocumentFile|null $file */
            $file = $candidate->files
                ->where('is_current', true)
                ->where('document_type', 'final_manuscript')
                ->sortByDesc('uploaded_at')
                ->first();
            if (! $file instanceof DocumentFile || ! $this->storage->isSupabasePath($file->file_path)
                || ! in_array($file->file_extension, ['pdf', 'docx'], true)) {
                continue;
            }

            $temporaryPath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
                .DIRECTORY_SEPARATOR.'researchnav-'.Str::uuid().'.'.$file->file_extension;

            try {
                $text = $this->textCache->remember($file, function () use ($file, $temporaryPath): string {
                    $contents = $this->storage->download($file->file_path);
                    if (file_put_contents($temporaryPath, $contents, LOCK_EX) !== strlen($contents)) {
                        throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
                    }

                    return $this->extractor->extract($temporaryPath);
                });
                $candidate->setRelation('manuscriptSearchDocument', new ManuscriptSearchDocument([
                    'source_sha256' => $candidate->import_source_sha256
                        ?? hash('sha256', $file->file_path.'|'.$file->file_size),
                    'body_text' => $text,
                    'extraction_status' => 'ready',
                    'extractor_version' => config('researchnav.manuscript_search.extractor_version'),
                ]));
            } catch (SupabaseStorageException|ManuscriptTextExtractionException) {
                // Title similarity remains available when remote content cannot be extracted.
            } finally {
                if (is_file($temporaryPath)) {
                    @unlink($temporaryPath);
                }
            }
        }

        return $candidates;
    }
}
