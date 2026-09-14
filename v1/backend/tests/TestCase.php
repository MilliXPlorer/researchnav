<?php

namespace Tests;

use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    protected function assignResearcherToDocument(User $researcher, ResearchDocument $research): void
    {
        if ($research->section_id === null) {
            $section = ClassSection::query()->create([
                'instructor_id' => User::factory()->create(['role' => 'instructor'])->id,
                'name' => 'Assigned section '.fake()->unique()->numberBetween(1, 999999),
            ]);
            $research->update(['section_id' => $section->id]);
        }

        DB::table('class_section_members')->insert([
            'class_section_id' => $research->section_id,
            'research_document_id' => $research->id,
            'user_id' => $researcher->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
