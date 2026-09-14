<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/** Resolves only verified, local files from the private research namespace. */
class PrivateDocumentFileResolver
{
    private const MAXIMUM_BYTES = 26_214_400;

    /** @return array{path:string,absolute_path:string,size:int} */
    public function resolve(ResearchDocument $research, DocumentFile $file): array
    {
        $path = $this->expectedPath($research, $file);
        $disk = Storage::disk('researchnav_private');
        if (! $disk->exists($path)) {
            throw new NotFoundHttpException;
        }

        // The configured private disk is intentionally local. FilesystemAdapter
        // keeps this check compatible with Laravel's Storage::fake() adapter.
        if (! method_exists($disk, 'path')) {
            throw new NotFoundHttpException;
        }
        $root = realpath((string) $disk->path(''));
        $candidate = (string) $disk->path($path);
        $realPath = realpath($candidate);
        if ($root === false || $realPath === false || is_link($candidate) || ! is_file($realPath) || ! is_readable($realPath) || ! $this->isContained($root, $realPath)) {
            throw new NotFoundHttpException;
        }

        $size = filesize($realPath);
        if ($size === false || $size < 1 || $size > self::MAXIMUM_BYTES) {
            throw new NotFoundHttpException;
        }

        return ['path' => $path, 'absolute_path' => $realPath, 'size' => $size];
    }

    /** @param array{absolute_path:string} $resolved */
    public function isPdf(array $resolved): bool
    {
        $handle = @fopen($resolved['absolute_path'], 'rb');
        if ($handle === false) {
            return false;
        }
        try {
            $signature = fread($handle, 5);
        } finally {
            fclose($handle);
        }
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($resolved['absolute_path']);

        return $signature === '%PDF-' && $mime === 'application/pdf';
    }

    /** @return resource */
    public function open(array $resolved)
    {
        $handle = @fopen($resolved['absolute_path'], 'rb');
        if ($handle === false) {
            throw new NotFoundHttpException;
        }

        return $handle;
    }

    private function expectedPath(ResearchDocument $research, DocumentFile $file): string
    {
        $filename = $file->stored_filename;
        if (! is_string($filename) || $filename === '' || $filename !== basename($filename) || str_contains($filename, "\0") || str_contains($filename, '/') || str_contains($filename, '\\')) {
            throw new NotFoundHttpException;
        }
        $path = 'research/'.$research->id.'/'.$filename;
        if ($file->research_document_id !== $research->id || $file->file_path !== $path) {
            throw new NotFoundHttpException;
        }

        return $path;
    }

    private function isContained(string $root, string $path): bool
    {
        $root = rtrim(str_replace('\\', '/', $root), '/');
        $path = str_replace('\\', '/', $path);

        return str_starts_with(strtolower($path), strtolower($root).'/');
    }
}
