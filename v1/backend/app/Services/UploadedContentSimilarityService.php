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
        private readonly UploadedContentTextCache $textCache,
        private readonly PublicRepositorySimilarityService $similarity,
    ) {}

    /** @param list<UploadedFile> $uploads
     * @return array{matches: array<int, array<string, mixed>>, extracted_text: string}
     */
    public function compare(array $uploads): array
    {
        if ($uploads === [] || count($uploads) > 20 || array_filter($uploads, fn ($upload): bool => ! $upload instanceof UploadedFile) !== []) {
            throw new UploadedContentUnreadableException;
        }
        usort($uploads, fn (UploadedFile $first, UploadedFile $second): int => $this->fileOrder($first->getClientOriginalName()) <=> $this->fileOrder($second->getClientOriginalName()));

        $privateRoot = storage_path('app/private');
        $root = $privateRoot.DIRECTORY_SEPARATOR.'similarity-content-upload';
        $directory = $root.DIRECTORY_SEPARATOR.Str::random(40);
        $scoringParts = [];

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
                $text = $this->textCache->remember($sha256, fn (): string => $this->extractor->extractRaw($canonicalPath));
                if (trim($text) === '') {
                    throw new UploadedContentUnreadableException;
                }
                $cleanText = trim($text);
                $scoringParts[] = $cleanText;
            }
        } catch (ManuscriptTextExtractionException $exception) {
            throw new UploadedContentUnreadableException(previous: $exception);
        } catch (UploadedContentUnreadableException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw new UploadedContentUnreadableException;
        } finally {
            $this->removeTemporaryDirectory($directory);
        }

        return [
            'matches' => $this->similarity->compareUploadedContent(implode("\n\n", $scoringParts)),
            'extracted_text' => implode("\n\n", $scoringParts),
        ];
    }

    /** @return array{int, int, string, string} */
    private function fileOrder(string $filename): array
    {
        $normalized = basename(str_replace('\\', '/', $filename));
        $lowered = mb_strtolower($normalized);
        $rank = preg_match('/front|cover|prelim|title.?page|table.?of.?contents|\btoc\b/u', $lowered) ? 0
            : (preg_match('/full.?manuscript|manuscript|thesis|final.?binding/u', $lowered) ? 1
                : (preg_match('/content|body|chapter|kabanata/u', $lowered) ? 2
                    : (preg_match('/source.?code|appendix|appendices|reference|bibliography|minutes/u', $lowered) ? 4 : 3)));
        preg_match('/(?:chapter|kabanata)[\s_-]*(\d+)/u', $lowered, $chapter);

        return [$rank, isset($chapter[1]) ? (int) $chapter[1] : 0, $lowered, $normalized];
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
