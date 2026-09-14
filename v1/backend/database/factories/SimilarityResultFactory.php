<?php

namespace Database\Factories;

use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<SimilarityResult> */
class SimilarityResultFactory extends Factory
{
    protected $model = SimilarityResult::class;

    public function definition(): array
    {
        return [
            'source_research_id' => ResearchDocument::factory(),
            'matched_research_id' => ResearchDocument::factory(),
            'source_title' => fake()->sentence(6),
            'matched_title' => fake()->sentence(6),
            'tfidf_score' => '0.500000000000',
            'title_similarity_score' => '0.500000000000',
            'content_similarity_score' => '0.500000000000',
            'title_weight' => '0.300000000000',
            'content_weight' => '0.700000000000',
            'cosine_score' => '0.500000000000',
            'final_similarity_score' => '0.500000000000',
            'analysis_type' => 'title',
            'algorithm_version' => 'title-content-weighted-v1',
            'analyzed_at' => now(),
        ];
    }

    /** Historical fixtures keep their old score/version semantics explicitly. */
    public function legacy(): static
    {
        return $this->state(fn (): array => [
            'title_similarity_score' => null,
            'content_similarity_score' => null,
            'title_weight' => null,
            'content_weight' => null,
            'overall_similarity_score' => null,
            'classification' => null,
            'algorithm_version' => 'title-tfidf-cosine-v1',
        ]);
    }
}
