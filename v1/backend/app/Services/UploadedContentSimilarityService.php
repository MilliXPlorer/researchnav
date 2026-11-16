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
                    $diagnostics[] = $this->diagnostic($index, 'duplicate', 'duplicate_content');

                    continue;
                }
                $seenTexts[$textHash] = true;
                $chapters = $this->chapters($cleanText);
                if ($chapters === []) {
                    $diagnostics[] = $this->diagnostic($index, 'excluded', 'supporting_document', strlen($cleanText));

                    continue;
                }
                $parts[] = ['index' => $index, 'text' => $cleanText, 'chapters' => $chapters, 'sha256' => $sha256];
                $diagnostics[] = $this->diagnostic($index, 'included', null, strlen($cleanText), $chapters);
            }
        } catch (UploadedContentUnreadableException $exception) {
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
            $chapters = $this->chapters($text);
            if ($chapters !== []) {
                $parts[] = ['index' => $file['index'], 'text' => $text, 'chapters' => $chapters, 'sha256' => ''];
            }
        }

        return $this->canonicalManuscript($parts)[0];
    }

    /** @param list<array{index: int, text: string, chapters: list<int>}> $parts */
    /** @return array{string, list<int>} */
    private function canonicalManuscript(array $parts): array
    {
        if ($parts === []) {
            throw new UploadedContentInvalidScopeException;
        }
        $withChapterOne = array_values(array_filter($parts, fn (array $part): bool => in_array(1, $part['chapters'], true)));
        if ($withChapterOne === []) {
            throw new UploadedContentInvalidScopeException;
        }
        usort($withChapterOne, fn (array $left, array $right): int => count($right['chapters']) <=> count($left['chapters']) ?: $left['index'] <=> $right['index']);
        $primary = $withChapterOne[0];
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
                throw new UploadedContentInvalidScopeException;
            }
            $selectedParts[] = $part;
            foreach ($part['chapters'] as $chapter) {
                $coveredChapters[$chapter] = true;
            }
        }

        return [implode("\n\n", array_map(fn (array $part): string => $part['text'], $selectedParts)), array_column($selectedParts, 'index')];
    }

    /** @return list<int> */
    private function chapters(string $text): array
    {
        preg_match_all('/^[ \t]*(?:chapter|chpter|kabanata|tsapter)[ \t]+(?<number>10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten|viii|vii|vi|iv|iii|ii|ix|x|v|i)(?!\w)[^\r\n]*$/imu', $text, $matches);
        $numbers = array_map(fn (string $value): int => $this->chapterNumber($value), $matches['number'] ?? []);

        return array_values(array_unique(array_filter($numbers, fn (int $number): bool => $number > 0)));
    }

    private function chapterNumber(string $value): int
    {
        $normalized = mb_strtoupper($value);
        $words = ['ONE' => 1, 'TWO' => 2, 'THREE' => 3, 'FOUR' => 4, 'FIVE' => 5, 'SIX' => 6, 'SEVEN' => 7, 'EIGHT' => 8, 'NINE' => 9, 'TEN' => 10];
        $roman = ['I' => 1, 'II' => 2, 'III' => 3, 'IV' => 4, 'V' => 5, 'VI' => 6, 'VII' => 7, 'VIII' => 8, 'IX' => 9, 'X' => 10];

        return ctype_digit($normalized) ? (int) $normalized : ($words[$normalized] ?? $roman[$normalized] ?? 0);
    }

    /** @return array<string, mixed> */
    private function diagnostic(int $index, string $status, ?string $reason, int $textLength = 0, array $chapters = []): array
    {
        return ['index' => $index, 'status' => $status, 'reason' => $reason, 'extraction_success' => $status !== 'error', 'text_length' => $textLength, 'detected_chapters' => $chapters, 'kind' => $status === 'included' ? 'manuscript' : ($status === 'excluded' ? 'supporting_document' : 'unknown'), 'eligible' => $status === 'included'];
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
