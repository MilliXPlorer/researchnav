<?php

namespace Tests\Unit;

use App\Services\ManuscriptTextParts;
use Tests\TestCase;

class ManuscriptTextPartsTest extends TestCase
{
    public function test_parts_are_ordered_contiguous_and_reconstruct_the_exact_text(): void
    {
        config()->set('researchnav.manuscript_search.part_characters', 24);
        $text = "CHAPTER 1 Introduction\nFirst paragraph continues here.\nSecond paragraph ends.";

        $parts = app(ManuscriptTextParts::class)->split($text);

        $this->assertGreaterThan(1, count($parts));
        $this->assertSame($text, implode('', $parts));
        foreach (array_slice($parts, 0, -1) as $part) {
            $this->assertMatchesRegularExpression('/\s$/', $part);
        }
    }

    public function test_a_word_longer_than_the_limit_is_not_split(): void
    {
        config()->set('researchnav.manuscript_search.part_characters', 5);
        $text = 'extraordinary word';

        $parts = app(ManuscriptTextParts::class)->split($text);

        $this->assertSame(['extraordinary ', 'word'], $parts);
        $this->assertSame($text, implode('', $parts));
    }
}
