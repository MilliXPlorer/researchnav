<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use Illuminate\Support\Collection;
use Throwable;
use ZipArchive;

/** Builds private, bounded ZIP archives for already-authorized manuscript files. */
class GroupedManuscriptArchiveBuilder
{
    private const DEFAULT_MAXIMUM_FILES = 100;

    private const DEFAULT_MAXIMUM_SOURCE_BYTES = 104_857_600;

    public function __construct(
        private readonly PrivateDocumentFileResolver $files,
    ) {}

    /**
     * @param  Collection<int, DocumentFile>  $selectedFiles
     */
    public function build(ResearchDocument $research, Collection $selectedFiles): GroupedManuscriptArchive
    {
        if (! class_exists(ZipArchive::class)) {
            throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
        }

        $files = $selectedFiles
            ->sortBy(fn (DocumentFile $file): string => sprintf('%010d:%s:%020d', $file->file_order ?? PHP_INT_MAX, $file->original_filename, $file->id))
            ->values();
        $this->ensureLimits($files);

        $resolvedFiles = [];
        $totalSize = 0;
        try {
            foreach ($files as $file) {
                $resolved = $this->files->resolve($research, $file);
                $totalSize += $resolved['size'];
                if ($totalSize > $this->maximumSourceBytes()) {
                    throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
                }
                $resolvedFiles[] = ['file' => $file, 'resolved' => $resolved];
            }
        } catch (Throwable $exception) {
            throw $this->unavailable($exception);
        }

        $folder = $this->safeSegment($research->import_group_name ?: $research->title, 'Manuscript');
        $archive = new GroupedManuscriptArchive($this->temporaryPath(), $folder.'.zip');
        $zip = new ZipArchive;
        $isOpen = false;

        try {
            if ($zip->open($archive->path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
            }
            $isOpen = true;
            $usedNames = [];
            foreach ($resolvedFiles as ['file' => $file, 'resolved' => $resolved]) {
                $name = $this->uniqueFilename($this->safeSegment($file->original_filename, 'manuscript'), $usedNames);
                $entry = $folder.'/'.$name;
                if (! $this->isSafeEntry($entry)) {
                    throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
                }
                $contents = $this->readSource($resolved['absolute_path'], $resolved['size']);
                if ($contents === false || ! $zip->addFromString($entry, $contents)) {
                    throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
                }
            }
            if (! $zip->close()) {
                throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
            }
            $isOpen = false;

            return $archive;
        } catch (Throwable $exception) {
            if ($isOpen) {
                $zip->close();
            }
            $archive->cleanup();

            throw $this->unavailable($exception);
        }
    }

    /** @param Collection<int, DocumentFile> $files */
    private function ensureLimits(Collection $files): void
    {
        if ($files->isEmpty() || $files->count() > $this->maximumFiles()) {
            throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
        }
    }

    private function maximumFiles(): int
    {
        return max(1, (int) config('researchnav.grouped_downloads.maximum_files', self::DEFAULT_MAXIMUM_FILES));
    }

    private function maximumSourceBytes(): int
    {
        return max(1, (int) config('researchnav.grouped_downloads.maximum_source_bytes', self::DEFAULT_MAXIMUM_SOURCE_BYTES));
    }

    private function temporaryPath(): string
    {
        $directory = storage_path('app/private/grouped-downloads');
        if ((! is_dir($directory) && ! @mkdir($directory, 0700, true)) || ! is_writable($directory)) {
            throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
        }
        $path = tempnam($directory, 'researchnav-zip-');
        if ($path === false) {
            throw new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
        }

        return $path;
    }

    private function readSource(string $path, int $expectedSize): string|false
    {
        $handle = @fopen($path, 'rb');
        if ($handle === false) {
            return false;
        }
        try {
            // Read one extra byte to fail closed when the source changes after
            // resolution instead of exceeding the verified aggregate limit.
            $contents = stream_get_contents($handle, $expectedSize + 1);
        } finally {
            fclose($handle);
        }

        return is_string($contents) && strlen($contents) === $expectedSize ? $contents : false;
    }

    private function safeSegment(mixed $value, string $fallback): string
    {
        $value = is_string($value) ? $value : '';
        $value = str_replace(["\0", "\r", "\n", '/', '\\'], ' ', $value);
        $value = preg_replace('/[^A-Za-z0-9._ -]+/', ' ', $value) ?? '';
        $value = trim(preg_replace('/\s+/', ' ', $value) ?? '', ' .');
        $value = substr($value, 0, 180);

        return $value === '' || $value === '.' || $value === '..' ? $fallback : $value;
    }

    /** @param array<string, true> $usedNames */
    private function uniqueFilename(string $name, array &$usedNames): string
    {
        $extension = pathinfo($name, PATHINFO_EXTENSION);
        $stem = $extension === '' ? $name : substr($name, 0, -(strlen($extension) + 1));
        $candidate = $name;
        $suffix = 1;
        while (isset($usedNames[strtolower($candidate)])) {
            $suffix++;
            $label = ' ('.$suffix.')';
            $candidate = substr($stem, 0, max(1, 180 - strlen($label) - ($extension === '' ? 0 : strlen($extension) + 1))).$label.($extension === '' ? '' : '.'.$extension);
        }
        $usedNames[strtolower($candidate)] = true;

        return $candidate;
    }

    private function isSafeEntry(string $entry): bool
    {
        return ! str_starts_with($entry, '/')
            && ! preg_match('/^[A-Za-z]:/', $entry)
            && ! str_contains($entry, '\\')
            && ! str_contains($entry, "\0")
            && ! str_contains($entry, '/../')
            && ! str_contains($entry, '/./');
    }

    private function unavailable(Throwable $exception): GroupedManuscriptArchiveException
    {
        if ($exception instanceof GroupedManuscriptArchiveException) {
            return $exception;
        }

        report($exception);

        return new GroupedManuscriptArchiveException('The manuscript archive is unavailable.');
    }
}
