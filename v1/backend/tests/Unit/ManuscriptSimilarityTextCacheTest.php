<?php

namespace Tests\Unit;

use App\Models\DocumentFile;
use App\Services\ManuscriptSimilarityTextCache;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ManuscriptSimilarityTextCacheTest extends TestCase
{
    public function test_extracted_text_is_reused_for_the_same_immutable_file_identity(): void
    {
        Cache::flush();
        $file = new DocumentFile([
            'research_document_id' => 10,
            'file_path' => 'Institute of Computer Studies/2026/Title/manuscript.pdf',
            'file_size' => 100,
            'version_number' => 1,
        ]);
        $extractions = 0;
        $cache = new ManuscriptSimilarityTextCache;

        $first = $cache->remember($file, function () use (&$extractions): string {
            $extractions++;

            return 'Complete extracted manuscript text.';
        });
        $second = $cache->remember($file, function () use (&$extractions): string {
            $extractions++;

            return 'Should not be used.';
        });

        $this->assertSame($first, $second);
        $this->assertSame(1, $extractions);
    }
}
