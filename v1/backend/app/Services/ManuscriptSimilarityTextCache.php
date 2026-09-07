<?php

namespace App\Services;

use App\Models\DocumentFile;
use Closure;
use Illuminate\Support\Facades\Cache;

class ManuscriptSimilarityTextCache
{
    public function remember(DocumentFile $file, Closure $extract): string
    {
        return Cache::rememberForever($this->key($file), $extract);
    }

    public function put(DocumentFile $file, string $text): void
    {
        if (trim($text) !== '') {
            Cache::forever($this->key($file), $text);
        }
    }

    public function forget(DocumentFile $file): void
    {
        Cache::forget($this->key($file));
    }

    private function key(DocumentFile $file): string
    {
        return 'manuscript-similarity-text:'.hash('sha256', implode('|', [
            (string) $file->research_document_id,
            (string) $file->file_path,
            (string) $file->file_size,
            (string) $file->version_number,
        ]));
    }
}
