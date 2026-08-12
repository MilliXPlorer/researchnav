<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SimilarityResultResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'source_research_id' => $this->source_research_id, 'matched_research_id' => $this->matched_research_id, 'source_title' => $this->source_title, 'matched_title' => $this->matched_title, 'tfidf_score' => $this->tfidf_score, 'cosine_score' => $this->cosine_score, 'fasttext_score' => $this->fasttext_score, 'final_similarity_score' => $this->final_similarity_score, 'threshold' => $this->threshold, 'is_flagged' => $this->is_flagged, 'contextual_analysis' => $this->contextual_analysis, 'matched_terms' => $this->matched_terms, 'analysis_type' => $this->analysis_type, 'analyzed_at' => $this->analyzed_at?->toISOString()];
    }
}
