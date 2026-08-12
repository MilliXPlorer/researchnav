<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SimilarityService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring) {}

    /** @param array<string, mixed> $data */
    public function storeResult(User $actor, ResearchDocument $source, array $data, ?Request $request = null): SimilarityResult
    {
        if ((int) $data['matched_research_id'] === $source->id) {
            throw ValidationException::withMessages(['matched_research_id' => ['A research document cannot be compared with itself.']]);
        }

        return DB::transaction(function () use ($actor, $source, $data, $request): SimilarityResult {
            $matched = ResearchDocument::query()->findOrFail($data['matched_research_id']);
            $result = SimilarityResult::query()->create([
                'source_research_id' => $source->id, 'matched_research_id' => $matched->id,
                'source_title' => $source->title, 'matched_title' => $matched->title,
                'tfidf_score' => $data['tfidf_score'] ?? null, 'cosine_score' => $data['cosine_score'] ?? 0,
                'fasttext_score' => $data['fasttext_score'] ?? null, 'final_similarity_score' => $data['final_similarity_score'],
                // Threshold is a server rule, not an algorithm assertion.
                'threshold' => SimilarityResult::FLAG_THRESHOLD, 'contextual_analysis' => $data['contextual_analysis'] ?? null,
                'matched_terms' => $data['matched_terms'] ?? null, 'analysis_type' => $data['analysis_type'], 'analyzed_at' => now(),
            ]);
            $this->monitoring->log($source, 'SIMILARITY_CHECK_COMPLETED', $actor, 'Stored trusted similarity result.', null, null, 'open');
            $this->audit->log($actor, 'SIMILARITY_CHECK_COMPLETED', $result, 'Stored trusted similarity result.', $request);
            if ($result->is_flagged) {
                $this->monitoring->log($source, 'TITLE_FLAGGED', $actor, 'Similarity result exceeded the 0.700000 storage rule.', null, null, 'flagged');
                $source->submitter?->notify(new ResearchActivityNotification($source, 'TITLE_FLAGGED', 'Title flagged', 'A trusted similarity result was flagged for review.'));
            }

            return $result->load(['sourceResearch', 'matchedResearch']);
        });
    }

    /** @return Collection<int, SimilarityResult> */
    public function relatedStudies(ResearchDocument $research)
    {
        return SimilarityResult::query()->where('source_research_id', $research->id)->with('matchedResearch')->orderByDesc('final_similarity_score')->get();
    }
}
