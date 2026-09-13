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

        $first = $cache->remember($file, function () use (&$extractions): array {
            $extractions++;

            return ['Complete extracted ', 'manuscript text.'];
        });
        $second = $cache->remember($file, function () use (&$extractions): array {
            $extractions++;

            return ['Should not be used.'];
        });

        $this->assertSame($first, $second);
        $this->assertSame('Complete extracted manuscript text.', implode('', $first));
        $this->assertSame(1, $extractions);
    }

    public function test_legacy_metadata_cache_entries_are_not_reused(): void
    {
        Cache::flush();
        $file = new DocumentFile([
            'research_document_id' => 10,
            'file_path' => 'Institute of Computer Studies/2026/Title/manuscript.pdf',
            'file_size' => 100,
            'version_number' => 1,
        ]);
        $legacyKey = 'manuscript-similarity-text:'.hash('sha256', implode('|', [
            '10',
            $file->file_path,
            '100',
            '1',
        ]));
        Cache::forever($legacyKey, 'First five pages only.');

        $parts = (new ManuscriptSimilarityTextCache)->remember(
            $file,
            fn (): array => ['Full document extraction.'],
        );

        $this->assertSame('Full document extraction.', implode('', $parts));
    }

    public function test_ordered_group_uses_one_cache_entry(): void
    {
        Cache::flush();
        $files = collect([
            new DocumentFile(['research_document_id' => 10, 'file_order' => 1, 'file_path' => 'front.pdf', 'file_size' => 10, 'content_sha256' => str_repeat('a', 64), 'version_number' => 1]),
            new DocumentFile(['research_document_id' => 10, 'file_order' => 2, 'file_path' => 'manuscript.pdf', 'file_size' => 20, 'content_sha256' => str_repeat('b', 64), 'version_number' => 2]),
        ]);
        $calls = 0;
        $cache = new ManuscriptSimilarityTextCache;
        $first = $cache->remember($files, function () use (&$calls) {
            $calls++;

            return ['front ', 'body'];
        });
        $second = $cache->remember($files, function () use (&$calls) {
            $calls++;

            return ['unused'];
        });
        $this->assertSame($first, $second);
        $this->assertSame(1, $calls);
    }
}
