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
            'cosine_score' => '0.500000',
            'final_similarity_score' => '0.500000',
            'analysis_type' => 'title',
            'analyzed_at' => now(),
        ];
    }
}
