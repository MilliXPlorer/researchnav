<?php

namespace App\Services;

use App\Models\ResearchDocument;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Schema;

class PublicRepositorySimilarityService
{
    public function __construct(
        private readonly SimilarityProcessRunner $process,
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
        $this->configureMemoryLimit();
        $maximumCandidates = min(1000, max(1, (int) config('researchnav.similarity.maximum_candidates')));
        $candidates = $this->eligibleCandidates($maximumCandidates);
        $candidateSnapshots = $this->candidateSnapshots($candidates);

        if ($candidates->count() > $maximumCandidates) {
            throw new PublicRepositorySimilarityCapacityException('Public similarity candidate limit exceeded.');
        }

        $results = $this->process->runQuery($query, $candidates);
        $candidateIds = $candidates->pluck('id')->map(fn ($id): int => (int) $id)->all();
        $currentCandidates = $this->eligibleCandidatesById($candidateIds);

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

    /** @return array<int, array<string, mixed>> */
    public function compareTitle(string $query): array
    {
        $candidates = $this->eligibleCandidates(min(1000, max(1, (int) config('researchnav.similarity.maximum_candidates'))));
        $results = $this->process->runTitleQuery($query, $candidates);
        $results = array_values(array_filter(
            $results,
            fn (array $result): bool => $result['title_similarity_score'] !== '0.000000000000',
        ));
        $byId = $candidates->keyBy('id');

        return array_map(function (array $result) use ($byId): array {
            /** @var ResearchDocument $research */
            $research = $byId->get($result['matched_research_id']);
            $score = $result['title_similarity_score'];

            return [
                'research' => $research,
                ...$result,
                'fasttext_support_score' => $result['fasttext_support_score'],
                'title_weight' => '1.000000000000',
                'title_weighted_contribution' => SimilarityScorePolicy::percentage($score),
                'overall_similarity_score' => $score,
                'overall_similarity_percentage' => SimilarityScorePolicy::percentage($score),
                'algorithm_version' => 'title-only-v1',
            ];
        }, $results);
    }

    /** @return array<int, array<string, mixed>> */
    public function compareContent(string $query): array
    {
        return $this->compareStandaloneContent($query, false);
    }

    /** @return array<int, array<string, mixed>> */
    public function compareUploadedContent(string $uploadedContent): array
    {
        return $this->compareStandaloneContent($uploadedContent, true);
    }

    /** @return array<int, array<string, mixed>> */
    private function compareStandaloneContent(string $content, bool $uploaded): array
    {
        $this->configureMemoryLimit();
        $candidates = $this->eligibleCandidates(min(250, max(1, (int) config('researchnav.similarity.maximum_candidates'))));
        $results = array_values(array_filter(
            $uploaded
                ? $this->process->runUploadedContentQuery($content, $candidates)
                : $this->process->runContentTextQuery($content, $candidates),
            fn (array $result): bool => $result['content_similarity_score'] !== null
                && $result['content_similarity_score'] !== '0.000000000000',
        ));
        $byId = $candidates->keyBy('id');

        return array_map(function (array $result) use ($byId): array {
            /** @var ResearchDocument $research */
            $research = $byId->get($result['matched_research_id']);
            $score = $result['content_similarity_score'];

            return [
                'research' => $research,
                ...$result,
                'fasttext_support_score' => $result['fasttext_support_score'],
                'title_similarity_percentage' => $score === null ? null : SimilarityScorePolicy::percentage($score),
                'title_weight' => '1.000000000000',
                'title_weighted_contribution' => $score === null ? null : SimilarityScorePolicy::percentage($score),
                'content_similarity_percentage' => $score === null ? null : SimilarityScorePolicy::percentage($score),
                'content_weight' => '1.000000000000',
                'content_weighted_contribution' => $score === null ? null : SimilarityScorePolicy::percentage($score),
                'overall_similarity_score' => $score,
                'overall_similarity_percentage' => $score === null ? null : SimilarityScorePolicy::percentage($score),
                'algorithm_version' => 'content-only-v1',
            ];
        }, $results);
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
        $relations = ['authors', 'category', 'sdgs', 'files'];
        if (Schema::hasTable('manuscript_search_documents')) {
            $relations[] = 'manuscriptSearchDocument';
        }

        return $relations;
    }

    private function configureMemoryLimit(): void
    {
        $limit = (string) config('researchnav.similarity.php_memory_limit');
        if (preg_match('/\A(?:[1-9]\d{2}|[1-9]\d{3})M\z/', $limit) !== 1) {
            $limit = '512M';
        }
        ini_set('memory_limit', $limit);
    }
}
