<?php

namespace App\Services;

use Closure;
use Illuminate\Support\Facades\Cache;
use Throwable;

class UploadedContentTextCache
{
    public function remember(string $sha256, Closure $extract): string
    {
        $ttl = max(1, min(3600, (int) config('researchnav.similarity.upload_text_cache_ttl_seconds', 900)));
        $key = 'similarity-upload-text:v1:'.$sha256;

        try {
            $cached = Cache::get($key);
            if (is_string($cached) && trim($cached) !== '') {
                return $cached;
            }
        } catch (Throwable) {
            // Cache availability must not make a valid upload unreadable.
        }

        $text = $extract();
        if (! is_string($text)) {
            throw new ManuscriptTextExtractionException('The extractor returned invalid text.');
        }

        try {
            Cache::put($key, $text, $ttl);
        } catch (Throwable) {
            // Extraction remains authoritative when the cache is unavailable.
        }

        return $text;
    }
}
