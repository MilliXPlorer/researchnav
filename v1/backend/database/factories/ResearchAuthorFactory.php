<?php

namespace Database\Factories;

use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ResearchAuthor> */
class ResearchAuthorFactory extends Factory
{
    protected $model = ResearchAuthor::class;

    public function definition(): array
    {
        return [
            'research_document_id' => ResearchDocument::factory(),
            'author_name' => fake()->name(),
            'author_order' => 1,
            'is_corresponding_author' => true,
        ];
    }
}
