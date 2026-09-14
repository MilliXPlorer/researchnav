<?php

namespace App\Services;

use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SimilarityService
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly MonitoringService $monitoring,
        private readonly SimilarityProcessRunner $process,
        private readonly ManuscriptSimilarityContentService $content,
        private readonly SimilarityScorePolicy $policy,
    ) {}

    /**
     * Run title-only comparison against every archived public candidate and
     * persist the entire checked set in one transaction.
     *
     * @return \Illuminate\Support\Collection<int, SimilarityResult>
     */
    public function check(User $actor, ResearchDocument $source, ?Request $request = null): \Illuminate\Support\Collection
    {
        $actor = $this->currentActor($actor);
        $source = ResearchDocument::query()->findOrFail($source->id);
        if (! $this->canViewInternal($actor, $source)) {
            throw $this->notAuthorized();
        }

        $sourceId = (int) $source->id;
        $sourceTitle = $source->title;
        $sourceSnapshot = clone $source;
        $maximumCandidates = (int) config('researchnav.similarity.maximum_candidates');
        $candidates = ResearchDocument::query()
            ->with('manuscriptSearchDocument')
            ->whereKeyNot($sourceId)
            ->where('submission_status', 'archived')
            ->where('archive_status', 'archived')
            ->where('visibility', 'public')
            ->whereNull('deleted_at')
            ->orderBy('id')
            ->limit($maximumCandidates + 1)
            ->get();
        $candidateSnapshots = $this->candidateSnapshots($candidates);

        if ($candidates->count() > $maximumCandidates) {
            throw new SimilarityProcessException('Archived public candidate limit exceeded.');
        }

        // This is intentionally captured before the worker starts. It records
        // unavailable inputs too, without extracting them; the runner remains
        // responsible for the one bounded source extraction it may need.
        $sourceInputFingerprint = $this->content->sourceFingerprint($sourceSnapshot);

        // Run before the transaction: unavailable FastText and malformed child
        // output can never result in partial database writes.
        $results = $this->process->run($sourceSnapshot, $candidates);

        return DB::transaction(function () use ($actor, $sourceId, $sourceTitle, $sourceInputFingerprint, $results, $request, $candidates, $candidateSnapshots): \Illuminate\Support\Collection {
            $source = ResearchDocument::withTrashed()->lockForUpdate()->find($sourceId);
            if (! $source || $source->trashed() || $source->title !== $sourceTitle) {
                throw new SimilarityProcessException('The comparison source changed during processing.');
            }

            // The runner snapshots its selected source before it starts the
            // worker. Re-read every component while holding the source lock,
            // including unavailable inputs: a newly-ready projection, a file
            // appearing, or provenance/body/version change must never be
            // persisted as if it had participated in this score.
            if ($sourceInputFingerprint !== $this->content->sourceFingerprint($source, lock: true)) {
                throw new SimilarityProcessException('The comparison source changed during processing.');
            }

            $actor = $this->currentActor($actor);
            if (! $this->canViewInternal($actor, $source)) {
                throw $this->notAuthorized();
            }

            $candidateIds = collect($results)->pluck('matched_research_id')->map(fn ($id): int => (int) $id)->all();
            $expectedCandidateIds = $candidates->pluck('id')->map(fn ($id): int => (int) $id)->all();
            sort($candidateIds);
            sort($expectedCandidateIds);
            if ($candidateIds !== $expectedCandidateIds) {
                throw (new ModelNotFoundException)->setModel(ResearchDocument::class, $candidateIds);
            }

            $eligibleCandidates = $this->eligibleCandidates($candidateIds, true);
            if ($eligibleCandidates->count() !== count($candidateIds)) {
                throw new SimilarityProcessException('A comparison candidate is no longer archived and public.');
            }
            if ($this->candidateSnapshots($eligibleCandidates) !== $candidateSnapshots) {
                throw new SimilarityProcessException('A comparison candidate changed during processing.');
            }

            return collect($results)->map(function (array $result) use ($actor, $source, $request): SimilarityResult {
                return $this->storeResult($actor, $source, [
                    ...$result,
                    'analysis_type' => 'document',
                ], $request);
            });
        });
    }

    /** @param array<string, mixed> $data */
    public function storeResult(User $actor, ResearchDocument $source, array $data, ?Request $request = null): SimilarityResult
    {
        if ((int) $data['matched_research_id'] === $source->id) {
            throw ValidationException::withMessages(['matched_research_id' => ['A research document cannot be compared with itself.']]);
        }

        return DB::transaction(function () use ($actor, $source, $data, $request): SimilarityResult {
            $source = ResearchDocument::withTrashed()->lockForUpdate()->findOrFail($source->id);
            if ($source->trashed()) {
                throw $this->notAuthorized();
            }

            $actor = $this->currentActor($actor);
            if (! $this->canViewInternal($actor, $source)) {
                throw $this->notAuthorized();
            }
            $matched = $this->eligibleCandidates([(int) $data['matched_research_id']], true)->first();
            if (! $matched) {
                throw new SimilarityProcessException('A comparison candidate is no longer archived and public.');
            }
            $calculated = $this->policy->evaluate(
                $data['title_similarity_score'] ?? null,
                $data['content_similarity_score'] ?? null,
            );
            $result = SimilarityResult::query()->create([
                'source_research_id' => $source->id, 'matched_research_id' => $matched->id,
                'source_title' => $source->title, 'matched_title' => $matched->title,
                'tfidf_score' => $calculated['overall_similarity_score'],
                'title_similarity_score' => $calculated['title_similarity_score'],
                'content_similarity_score' => $calculated['content_similarity_score'],
                'title_weight' => $calculated['title_weight'], 'content_weight' => $calculated['content_weight'],
                'score_status' => $calculated['overall_similarity_score'] === null ? 'content_unavailable' : 'scored',
                'cosine_score' => $calculated['overall_similarity_score'],
                'fasttext_score' => $data['fasttext_score'] ?? null, 'final_similarity_score' => $calculated['overall_similarity_score'],
                'overall_similarity_score' => $calculated['overall_similarity_score'], 'classification' => $calculated['classification'],
                'overall_flagged' => $calculated['overall_flagged'], 'title_match_alert' => $calculated['title_match_alert'],
                'adviser_review_required' => $calculated['adviser_review_required'], 'flag_reason' => $calculated['flag_reason'],
                'threshold' => $this->policy->highThreshold(), 'contextual_analysis' => $data['contextual_analysis'] ?? null,
                'matched_terms' => $data['matched_terms'] ?? null, 'analysis_type' => $data['analysis_type'],
                'algorithm_version' => $calculated['algorithm_version'],
                'source_content_sha256' => $data['source_content_sha256'] ?? null,
                'matched_content_sha256' => $data['matched_content_sha256'] ?? null,
                'analyzed_at' => now(),
            ]);
            $this->monitoring->log($source, 'SIMILARITY_CHECK_COMPLETED', $actor, 'Stored trusted similarity result.', null, null, 'open');
            $this->audit->log($actor, 'SIMILARITY_CHECK_COMPLETED', $result, 'Stored trusted similarity result.', $request);
            if ($result->adviser_review_required) {
                $this->monitoring->log($source, 'SIMILARITY_REVIEW_REQUIRED', $actor, 'Similarity result requires adviser review.', null, null, 'flagged');
                $source->submitter?->notify(new ResearchActivityNotification($source, 'SIMILARITY_REVIEW_REQUIRED', 'Similarity review required', 'A trusted similarity result requires adviser review.'));
            }

            return $result->load(['sourceResearch', 'matchedResearch']);
        });
    }

    /** @return Collection<int, SimilarityResult> */
    public function relatedStudies(ResearchDocument $research)
    {
        return SimilarityResult::query()
            ->latestPerPair()
            ->where('source_research_id', $research->id)
            ->whereHas('matchedResearch', fn ($query) => $this->eligibleCandidatesQuery($query))
            ->with(['matchedResearch' => fn ($query) => $this->eligibleCandidatesQuery($query)])
            ->where(function ($query): void {
                $query->where('score_status', '!=', 'scored')
                    ->orWhere('overall_similarity_score', '>', '0.000000000000')
                    // Historical rows have no official weighted overall, but
                    // remain readable evidence and must not disappear.
                    ->orWhereNull('algorithm_version')
                    ->orWhere('algorithm_version', '!=', $this->policy->algorithmVersion());
            })
            ->orderByRaw('CASE WHEN overall_similarity_score IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('overall_similarity_score')
            ->orderByDesc('title_similarity_score')
            ->orderBy('matched_research_id')
            ->get();
    }

    /** @param array<int, int> $candidateIds */
    private function eligibleCandidates(array $candidateIds, bool $lock = false): Collection
    {
        $query = $this->eligibleCandidatesQuery(ResearchDocument::query()
            ->whereIn('id', $candidateIds)
            ->orderBy('id'));

        $candidates = $lock ? $query->lockForUpdate()->get() : $query->get();

        return $candidates->load('manuscriptSearchDocument');
    }

    private function eligibleCandidatesQuery($query)
    {
        return $query
            ->where('submission_status', 'archived')
            ->where('archive_status', 'archived')
            ->where('visibility', 'public')
            ->whereNull('deleted_at');
    }

    /** @return array<int, array{title: string, projection_id: ?int, projection_status: ?string, projection_source_sha256: ?string, projection_body_sha256: ?string, projection_extractor_version: ?string}> */
    private function candidateSnapshots(Collection $candidates): array
    {
        $projections = ManuscriptSearchDocument::query()
            ->whereIn('research_document_id', $candidates->pluck('id'))
            ->lockForUpdate()
            ->get()
            ->keyBy('research_document_id');

        return $candidates->sortBy('id')->mapWithKeys(function (ResearchDocument $candidate) use ($projections): array {
            $projection = $projections->get($candidate->id);

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

    private function currentActor(User $actor): User
    {
        $current = User::query()->lockForUpdate()->find($actor->id);
        if ($current === null || ! DomainAuthorization::isActiveAccount($current)) {
            throw $this->notAuthorized();
        }

        return $current;
    }

    private function canViewInternal(User $actor, ResearchDocument $source): bool
    {
        return (DomainAuthorization::isActiveAccount($actor) && $source->submitted_by === $actor->id)
            || DomainAuthorization::canReview($actor, $source);
    }

    private function notAuthorized(): ValidationException
    {
        return ValidationException::withMessages(['authorization' => ['The actor is not authorized to check this research.']]);
    }
}
