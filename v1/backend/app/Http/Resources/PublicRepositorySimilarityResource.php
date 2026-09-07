<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicRepositorySimilarityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['research']->id,
            'title' => $this->resource['research']->title,
            'abstract' => $this->resource['research']->abstract,
            'keywords' => $this->resource['research']->keywords,
            'publication_year' => $this->resource['research']->publication_year,
            'institution_name' => $this->resource['research']->institution_name,
            'institution_location' => $this->resource['research']->institution_location,
            'academic_unit' => $this->resource['research']->academic_unit,
            'degree_program' => $this->resource['research']->degree_program,
            'manuscript_date_label' => $this->resource['research']->manuscript_date_label,
            'abstract_provenance' => $this->resource['research']->abstract_provenance,
            'research_stage' => $this->resource['research']->research_stage,
            'has_downloadable_manuscript' => $this->resource['research']->files
                ->contains(fn ($file): bool => $file->is_current && $file->document_type === 'final_manuscript'),
            'authors' => PublicResearchAuthorResource::collection($this->resource['research']->authors),
            'category' => new CategoryResource($this->resource['research']->category),
            'title_similarity_score' => $this->resource['title_similarity_score'],
            'title_similarity_percentage' => $this->resource['title_similarity_percentage'],
            'title_weight' => $this->resource['title_weight'],
            'title_weighted_contribution' => $this->resource['title_weighted_contribution'],
            'content_similarity_score' => $this->resource['content_similarity_score'],
            'content_similarity_percentage' => $this->resource['content_similarity_percentage'],
            'content_weight' => $this->resource['content_weight'],
            'content_weighted_contribution' => $this->resource['content_weighted_contribution'],
            'overall_similarity_score' => $this->resource['overall_similarity_score'],
            'overall_similarity_percentage' => $this->resource['overall_similarity_percentage'],
            'classification' => $this->resource['classification'],
            'overall_flagged' => $this->resource['overall_flagged'],
            'title_match_alert' => $this->resource['title_match_alert'],
            'adviser_review_required' => $this->resource['adviser_review_required'],
            'flag_reason' => $this->resource['flag_reason'],
            'algorithm_version' => $this->resource['algorithm_version'],
            'analyzed_at' => now()->toISOString(),
            'score_status' => $this->resource['score_status'],
            // Existing public consumers use query_* aliases; each points to the
            // same policy-calculated component/overall value.
            'query_title_similarity_score' => $this->resource['title_similarity_score'],
            'query_title_similarity_percentage' => $this->resource['title_similarity_percentage'],
            'query_content_similarity_score' => $this->resource['content_similarity_score'],
            'query_content_similarity_percentage' => $this->resource['content_similarity_percentage'],
            'query_similarity_score' => $this->resource['overall_similarity_score'],
            'query_similarity_percentage' => $this->resource['overall_similarity_percentage'],
            'matched_terms' => $this->resource['matched_terms'],
            'fasttext_support_score' => $this->resource['fasttext_support_score'],
        ];
    }
}
