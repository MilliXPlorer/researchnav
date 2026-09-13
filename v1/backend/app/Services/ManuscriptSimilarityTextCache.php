<?php

namespace App\Services;

use App\Models\DocumentFile;
use Closure;
use Illuminate\Support\Facades\Cache;

class ManuscriptSimilarityTextCache
{
    private const FORMAT_VERSION = 'incremental-document-parts-pymupdf-v1';

    /** @return list<string> */
    public function remember(DocumentFile|iterable $files, Closure $extract): array
    {
        $files = $files instanceof DocumentFile ? [$files] : [...$files];

        return Cache::rememberForever(
            $this->key($files),
            fn (): array => $extract(),
        );
    }

    public function forget(DocumentFile $file): void
    {
        Cache::forget($this->key([$file]));
    }

    /** @param list<DocumentFile> $files */
    private function key(array $files): string
    {
        $identity = [self::FORMAT_VERSION];
        foreach ($files as $file) {
            array_push($identity, (string) $file->research_document_id, (string) $file->file_order,
                (string) $file->file_path, (string) $file->file_size, (string) ($file->content_sha256 ?? ''), (string) $file->version_number);
        }

        return 'manuscript-similarity-text:'.hash('sha256', implode('|', $identity));
    }
}
