<?php

namespace App\Services;

use App\Models\ResearchDocument;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Schema;

class PublicRepositorySimilarityService
{
    public function __construct(
        private readonly SimilarityProcessRunner $process,
    ) {}

    /**
     * Compare an unpersisted visitor query with every matching public archive,
     * rank the complete result set, and then return one ten-study page.
     *
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator<int, array<string, mixed>>
     */
    public function compare(array $filters): LengthAwarePaginator
    {
        $this->configureMemoryLimit();
        $query = trim((string) $filters['q']);
        $page = max(1, (int) ($filters['page'] ?? 1));
        $candidates = $this->matchingCandidates($query, $filters);
        $candidateSnapshots = $this->candidateSnapshots($candidates);

        if ($candidates->isEmpty()) {
            return new LengthAwarePaginator([], 0, 10, $page, ['path' => request()->url(), 'pageName' => 'page']);
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

        $mapped = array_map(function (array $result) use ($byId): array {
            /** @var ResearchDocument $research */
            $research = $byId->get($result['matched_research_id']);

            return [
                'research' => $research,
                ...$result,
                'matched_terms' => $result['matched_terms'],
                'fasttext_support_score' => $result['fasttext_support_score'],
            ];
        }, $nonzeroResults);

        if (($filters['sort'] ?? 'relevance') !== 'relevance') {
            $direction = $filters['sort'] === 'oldest' ? 1 : -1;
            usort($mapped, function (array $first, array $second) use ($direction): int {
                $yearComparison = ((int) $first['research']->publication_year <=> (int) $second['research']->publication_year) * $direction;

                return $yearComparison !== 0
                    ? $yearComparison
                    : ((int) $first['research']->id <=> (int) $second['research']->id);
            });
        }

        $total = count($mapped);
        $lastPage = max(1, (int) ceil($total / 10));
        $page = min($page, $lastPage);

        return new LengthAwarePaginator(
            array_slice($mapped, ($page - 1) * 10, 10),
            $total,
            10,
            $page,
            ['path' => request()->url(), 'pageName' => 'page'],
        );
    }

    /** @param array<string, mixed> $filters */
    private function matchingCandidates(string $term, array $filters): Collection
    {
        $query = ResearchDocument::query()
            ->select('research_documents.*')
            ->with($this->candidateRelations())
            ->whereNull('research_documents.deleted_at')
            ->where('submission_status', 'archived')
            ->where('archive_status', 'archived')
            ->where('visibility', 'public');

        $terms = collect(preg_split('/[^\pL\pN]+/u', $term) ?: [])
            ->map(fn (string $value): string => trim($value))
            ->filter(fn (string $value): bool => mb_strlen($value) >= 2)
            ->unique()
            ->values();
        $query->where(function (Builder $matches) use ($terms): void {
            foreach ($terms as $term) {
                $like = $this->like($term);
                $matches->orWhere(function (Builder $match) use ($like): void {
                    $match->whereRaw("research_documents.title LIKE ? ESCAPE '!'", [$like])
                        ->orWhereRaw("research_documents.abstract LIKE ? ESCAPE '!'", [$like])
                        ->orWhereRaw("research_documents.keywords LIKE ? ESCAPE '!'", [$like])
                        ->orWhereHas('authors', fn (Builder $authors) => $authors->whereRaw("author_name LIKE ? ESCAPE '!'", [$like]));

                    if (Schema::hasTable('manuscript_search_documents')) {
                        $match->orWhereHas('manuscriptSearchDocument', fn (Builder $document) => $document
                            ->where('extraction_status', 'ready')
                            ->whereRaw("body_text LIKE ? ESCAPE '!'", [$like]));
                    }
                });
            }
        });

        if ($yearFrom = $filters['year_from'] ?? null) {
            $query->where('publication_year', '>=', $yearFrom);
        }
        if ($yearTo = $filters['year_to'] ?? null) {
            $query->where('publication_year', '<=', $yearTo);
        }
        if ($category = $filters['category'] ?? null) {
            $query->whereHas('category', fn (Builder $categories) => $categories->where('slug', $category)->orWhere('name', $category));
        }
        if ($institute = $filters['institute'] ?? null) {
            $query->where('institute', $institute);
        }
        foreach ($filters['sdg_ids'] ?? [] as $sdgId) {
            $query->whereHas('sdgs', fn (Builder $sdgs) => $sdgs->where('sdgs.id', $sdgId));
        }

        match ($filters['sort'] ?? 'relevance') {
            'oldest' => $query->orderBy('publication_year'),
            default => $query->orderByDesc('publication_year'),
        };

        $maximumCandidates = min(1000, max(1, (int) config('researchnav.similarity.maximum_candidates')));
        $candidates = $query->orderBy('title')->orderBy('research_documents.id')->limit($maximumCandidates + 1)->get();
        if ($candidates->count() > $maximumCandidates) {
            throw new PublicRepositorySimilarityCapacityException('Public similarity candidate limit exceeded.');
        }

        return $candidates;
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

    private function like(string $value): string
    {
        return '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value).'%';
    }
}
