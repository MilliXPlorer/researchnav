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

    /** @return array<int, array<string, mixed>> */
    public function compare(UploadedFile $upload): array
    {
        $extension = strtolower($upload->getClientOriginalExtension());
        if (! in_array($extension, ['pdf', 'docx'], true)) {
            throw new UploadedContentUnreadableException;
        }

        $privateRoot = storage_path('app/private');
        $root = $privateRoot.DIRECTORY_SEPARATOR.'similarity-content-upload';
        $directory = $root.DIRECTORY_SEPARATOR.Str::random(40);
        $path = $directory.DIRECTORY_SEPARATOR.'upload.'.$extension;

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

            $upload->move($directory, basename($path));
            @chmod($path, 0600);

            $canonicalRoot = realpath($root);
            $canonicalPath = realpath($path);
            if ($canonicalRoot === false || $canonicalPath === false
                || ! str_starts_with(strtolower($canonicalRoot), strtolower($canonicalPrivateRoot.DIRECTORY_SEPARATOR))
                || ! str_starts_with(strtolower($canonicalPath), strtolower($canonicalRoot.DIRECTORY_SEPARATOR))) {
                throw new UploadedContentUnreadableException;
            }

            $sha256 = hash_file('sha256', $canonicalPath);
            if (! is_string($sha256)) {
                throw new UploadedContentUnreadableException;
            }
            $content = $this->textCache->remember(
                $sha256,
                fn (): string => $this->extractor->extract($canonicalPath),
            );
            if (trim($content) === '') {
                throw new UploadedContentUnreadableException;
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

        return $this->similarity->compareUploadedContent($content);
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
