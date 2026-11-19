<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Throwable;

class UploadedContentSimilarityService
{
    public function __construct(
        private readonly ManuscriptTextExtractor $extractor,
        private readonly PublicRepositorySimilarityService $similarity,
        private readonly SimilarityProcessRunner $runner,
    ) {}

    /** @param list<UploadedFile> $uploads
     * @return array{matches: array<int, array<string, mixed>>, diagnostics: list<array<string, mixed>>, extracted_text: string}
     */
    public function compare(array $uploads): array
    {
        if ($uploads === [] || count($uploads) > 20 || array_filter($uploads, fn ($upload): bool => ! $upload instanceof UploadedFile) !== []) {
            throw new UploadedContentUnreadableException;
        }
        $privateRoot = storage_path('app/private');
        $root = $privateRoot.DIRECTORY_SEPARATOR.'similarity-content-upload';
        $directory = $root.DIRECTORY_SEPARATOR.Str::random(40);
        $parts = [];
        $diagnostics = [];
        $seenHashes = [];
        $seenTexts = [];
        $extracted = [];

        try {
            $canonicalPrivateRoot = realpath($privateRoot);
            if ($canonicalPrivateRoot === false || is_link($root)) {
                throw new UploadedContentUnreadableException;
            }
            if (! File::isDirectory($root) && ! File::makeDirectory($root, 0700, true)) {
                throw new UploadedContentUnreadableException;
            }
            if (! File::makeDirectory($directory, 0700, true)) {
                throw new UploadedContentUnreadableException;
            }

            $canonicalRoot = realpath($root);
            if ($canonicalRoot === false || ! str_starts_with(strtolower($canonicalRoot), strtolower($canonicalPrivateRoot.DIRECTORY_SEPARATOR))) {
                throw new UploadedContentUnreadableException;
            }

            foreach ($uploads as $index => $upload) {
                $extension = strtolower($upload->getClientOriginalExtension());
                if ($extension !== 'pdf') {
                    throw new UploadedContentUnreadableException;
                }
                $path = $directory.DIRECTORY_SEPARATOR.'upload-'.$index.'.'.$extension;
                $upload->move($directory, basename($path));
                @chmod($path, 0600);
                $canonicalPath = realpath($path);
                if ($canonicalPath === false || ! str_starts_with(strtolower($canonicalPath), strtolower($canonicalRoot.DIRECTORY_SEPARATOR))) {
                    throw new UploadedContentUnreadableException;
                }
                $sha256 = hash_file('sha256', $canonicalPath);
                if (! is_string($sha256)) {
                    throw new UploadedContentUnreadableException;
                }
                if (isset($seenHashes[$sha256])) {
                    $diagnostics[] = $this->diagnostic($index, 'duplicate', 'exact_duplicate');

                    continue;
                }
                $seenHashes[$sha256] = true;
                try {
                    $cleanText = trim($this->extractor->extractRaw($canonicalPath));
                } catch (ManuscriptTextExtractionException) {
                    $diagnostics[] = $this->diagnostic($index, 'error', 'extraction_failed');

                    continue;
                }
                if ($cleanText === '') {
                    $diagnostics[] = $this->diagnostic($index, 'error', 'no_readable_text');

                    continue;
                }
                $textHash = hash('sha256', preg_replace('/\s+/u', ' ', mb_strtolower($cleanText)) ?? $cleanText);
                if (isset($seenTexts[$textHash])) {
                    $diagnostics[] = $this->diagnostic($index, 'duplicate', 'duplicate_content', strlen($cleanText), [], $cleanText);

                    continue;
                }
                $seenTexts[$textHash] = true;
                $extracted[] = ['index' => $index, 'text' => $cleanText, 'sha256' => $sha256];
            }

            if ($extracted !== []) {
                $scopeResults = $this->runner->detectUploadedContentChaptersBatch(array_column($extracted, 'text'));
                foreach ($extracted as $position => $file) {
                    $chapters = $scopeResults[$position];
                    if ($chapters === []) {
                        $diagnostics[] = $this->diagnostic($file['index'], 'excluded', 'supporting_document', strlen($file['text']), [], $file['text']);

                        continue;
                    }
                    $parts[] = [...$file, 'chapters' => $chapters];
                    $diagnostics[] = $this->diagnostic($file['index'], 'included', null, strlen($file['text']), $chapters, $file['text']);
                }
            }
        } catch (UploadedContentUnreadableException|UploadedContentInvalidScopeException|SimilarityProcessException|PublicRepositorySimilarityCapacityException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw new UploadedContentUnreadableException;
        } finally {
            $this->removeTemporaryDirectory($directory);
        }

        if ($parts === [] && $diagnostics !== [] && count(array_filter($diagnostics, fn (array $diagnostic): bool => $diagnostic['status'] === 'error')) === count($diagnostics)) {
            throw new UploadedContentUnreadableException;
        }

        [$canonical, $selectedIndexes] = $this->canonicalManuscript($parts);
        $selectedHashes = array_values(array_map(
            fn (array $part): string => $part['sha256'],
            array_filter($parts, fn (array $part): bool => in_array($part['index'], $selectedIndexes, true)),
        ));
        $diagnostics = array_map(function (array $diagnostic) use ($selectedIndexes): array {
            if ($diagnostic['status'] === 'included' && ! in_array($diagnostic['index'], $selectedIndexes, true)) {
                return [...$diagnostic, 'status' => 'excluded', 'reason' => 'covered_by_canonical_manuscript', 'kind' => 'manuscript', 'eligible' => false];
            }

            return $diagnostic;
        }, $diagnostics);
        usort($diagnostics, fn (array $left, array $right): int => $left['index'] <=> $right['index']);

        return ['matches' => $this->similarity->compareUploadedContent($canonical, $selectedHashes), 'diagnostics' => $diagnostics, 'extracted_text' => $canonical];
    }

    /** @param list<array{index: int, text: string}> $files */
    public function canonicalText(array $files): string
    {
        $parts = [];
        foreach ($files as $file) {
            $text = trim($file['text']);
            if ($text === '') {
                continue;
            }
            try {
                $chapters = $this->runner->detectUploadedContentChapters($text);
                $parts[] = ['index' => $file['index'], 'text' => $text, 'chapters' => $chapters, 'sha256' => ''];
            } catch (UploadedContentChapterOneNotFoundException) {
                continue;
            }
        }

        return $this->canonicalManuscript($parts)[0];
    }

    /** @param list<array{index: int, text: string, chapters: list<int>}> $parts */
    /** @return array{string, list<int>} */
    private function canonicalManuscript(array $parts): array
    {
        if ($parts === []) {
            throw new UploadedContentChapterOneNotFoundException;
        }
        $withChapterOne = array_values(array_filter($parts, fn (array $part): bool => in_array(1, $part['chapters'], true)));
        if ($withChapterOne === []) {
            throw new UploadedContentChapterOneNotFoundException;
        }
        usort($withChapterOne, fn (array $left, array $right): int => count($right['chapters']) <=> count($left['chapters']) ?: $left['index'] <=> $right['index']);
        $primary = $withChapterOne[0];
        $this->runner->detectUploadedContentChapters($primary['text'], true);
        $selectedParts = [$primary];
        $coveredChapters = array_fill_keys($primary['chapters'], true);
        $remaining = array_values(array_filter($parts, fn (array $part): bool => $part['index'] !== $primary['index']));
        usort($remaining, fn (array $left, array $right): int => min($left['chapters']) <=> min($right['chapters']) ?: $left['index'] <=> $right['index']);
        foreach ($remaining as $part) {
            $uncovered = array_values(array_filter($part['chapters'], fn (int $chapter): bool => ! isset($coveredChapters[$chapter])));
            if ($uncovered === []) {
                continue;
            }
            if (count($uncovered) !== count($part['chapters']) || min($part['chapters']) <= max(array_keys($coveredChapters))) {
                throw new UploadedContentChapterOrderException('chapter_order_invalid');
            }
            $selectedParts[] = $part;
            foreach ($part['chapters'] as $chapter) {
                $coveredChapters[$chapter] = true;
            }
        }

        return [implode("\n\n", array_map(fn (array $part): string => $part['text'], $selectedParts)), array_column($selectedParts, 'index')];
    }

    /** @return array<string, mixed> */
    private function diagnostic(int $index, string $status, ?string $reason, int $textLength = 0, array $chapters = [], ?string $extractedText = null): array
    {
        return ['index' => $index, 'status' => $status, 'reason' => $reason, 'extraction_success' => $status !== 'error', 'text_length' => $textLength, 'detected_chapters' => $chapters, 'kind' => $status === 'included' ? 'manuscript' : ($status === 'excluded' ? 'supporting_document' : 'unknown'), 'eligible' => $status === 'included', 'extracted_text' => $extractedText];
    }

    private function removeTemporaryDirectory(string $directory): void
    {
        try {
            if (File::isDirectory($directory) && (! File::deleteDirectory($directory) || File::isDirectory($directory))) {
                throw new UploadedContentUnreadableException;
            }
        } catch (UploadedContentUnreadableException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw new UploadedContentUnreadableException;
        }
    }
}
