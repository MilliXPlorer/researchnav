<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ResearchDocument> */
class ResearchDocumentFactory extends Factory
{
    protected $model = ResearchDocument::class;

    public function definition(): array
    {
        $title = fake()->sentence(8);

        return [
            'submitted_by' => User::factory(),
            'category_id' => Category::query()->first()?->id ?? Category::query()->create(['name' => 'General Research', 'slug' => 'general-research'])->id,
            'title' => $title,
            'normalized_title' => str($title)->lower()->replaceMatches('/[^a-z0-9]+/', ' ')->trim()->toString(),
            'abstract' => fake()->paragraph(),
            'keywords' => implode(', ', fake()->words(4)),
            'publication_year' => (int) now()->format('Y'),
            'research_stage' => 'title_proposal',
            'submission_status' => 'draft',
            'archive_status' => 'not_archived',
            'visibility' => 'private',
        ];
    }
}
