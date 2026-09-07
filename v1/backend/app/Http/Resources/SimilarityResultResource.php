<?php

namespace App\Http\Resources;

use App\Services\SimilarityScorePolicy;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SimilarityResultResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $policy = app(SimilarityScorePolicy::class);
        $isCurrent = $this->algorithm_version === $policy->algorithmVersion();
        $decision = $this->canonicalDecision();
        $titleScore = $this->title_similarity_score;
        $contentScore = $this->content_similarity_score;
        // An older algorithm's final score is historical evidence, not an
        // official weighted overall. Never derive a weighted score from it.
        $overallScore = $isCurrent ? $this->overall_similarity_score : null;

        return [
            'id' => $this->id,
            'source_research_id' => $this->source_research_id,
            'matched_research_id' => $this->matched_research_id,
            'source_title' => $this->source_title,
            'matched_title' => $this->matched_title,
            'tfidf_score' => $this->tfidf_score,
            'title_similarity_score' => $titleScore,
            'title_similarity_percentage' => $titleScore === null ? null : SimilarityScorePolicy::percentage($titleScore),
            'title_weight' => $isCurrent ? $this->title_weight : null,
            'title_weighted_contribution' => $isCurrent && $titleScore !== null && $this->title_weight !== null ? SimilarityScorePolicy::percentage(SimilarityScorePolicy::multiply($titleScore, $this->title_weight)) : null,
            'content_similarity_score' => $contentScore,
            'content_similarity_percentage' => $contentScore === null ? null : SimilarityScorePolicy::percentage($contentScore),
            'content_weight' => $isCurrent ? $this->content_weight : null,
            'content_weighted_contribution' => $isCurrent && $contentScore !== null && $this->content_weight !== null ? SimilarityScorePolicy::percentage(SimilarityScorePolicy::multiply($contentScore, $this->content_weight)) : null,
            'overall_similarity_score' => $overallScore,
            'overall_similarity_percentage' => $overallScore === null ? null : SimilarityScorePolicy::percentage($overallScore),
            'classification' => $isCurrent ? $this->classification : null,
            ...$decision,
            'cosine_score' => $this->cosine_score,
            'fasttext_score' => $this->fasttext_score,
            // Historical score evidence; use overall_similarity_score for the
            // official current weighted value.
            'final_similarity_score' => $isCurrent ? $overallScore : $this->final_similarity_score,
            'score_status' => $this->score_status,
            'threshold' => $this->threshold,
            'contextual_analysis' => $this->contextual_analysis,
            'matched_terms' => $this->matched_terms,
            'analysis_type' => $this->analysis_type,
            'algorithm_version' => $this->algorithm_version,
            'analyzed_at' => $this->analyzed_at?->toISOString(),
        ];
    }
}
