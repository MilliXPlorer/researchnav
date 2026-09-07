<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ManuscriptSearchProjectionService
{
    private const PDF_MIME = 'application/pdf';

    private const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    public function __construct(
        private readonly ManuscriptTextExtractor $extractor,
        private readonly ManuscriptSdgClassificationService $classifications,
    ) {}

    /** @return 'indexed'|'skipped'|'failed'|'no_source'|'unsupported'|'ineligible' */
    public function reindex(int $documentId, bool $force = false, bool $retryFailed = false): string
    {
        $document = ResearchDocument::query()->find($documentId);
        if ($document === null || ! $this->isEligible($document)) {
            $this->purge($documentId);

            return 'ineligible';
        }

        $projection = ManuscriptSearchDocument::query()->where('research_document_id', $documentId)->first();
        if (! $force && $this->hasStaleReadyClassification($projection)) {
            $this->refreshReadyClassification($projection);

            return 'skipped';
        }

        $source = $this->resolveSource($document);
        if (! $force && $this->isCurrentReadyProjection($projection, $source)) {
            $this->refreshReadyClassification($projection);

            return 'skipped';
        }
        if (! $force && ! $retryFailed && $this->isCurrentFailedProjection($projection, $source)) {
            $this->invalidateClassification($projection);

            return 'skipped';
        }

        if ($source === null) {
            return $this->persistNoSource($documentId);
        }
        if ($source['extension'] === 'doc') {
            return $this->persistFailure($documentId, $source, 'UNSUPPORTED_SOURCE', 'unsupported');
        }

        try {
            $bodyText = $this->extractor->extract($source['path']);
        } catch (\Throwable) {
            return $this->persistFailure($documentId, $source, 'EXTRACTION_FAILED', 'failed');
        }
        if ($bodyText === '') {
            return $this->persistFailure($documentId, $source, 'NO_TEXT', 'failed');
        }

        return $this->persistReady($documentId, $source, $bodyText);
    }

    public function invalidate(int $documentId): void
    {
        $projection = ManuscriptSearchDocument::query()->updateOrCreate(
            ['research_document_id' => $documentId],
            $this->clearedValues(null, 'pending', null),
        );
        $this->invalidateClassification($projection);
    }

    public function purgeIneligible(): int
    {
        return ManuscriptSearchDocument::query()
            ->whereHas('researchDocument', fn ($query) => $query->whereNotIn('submission_status', ['approved', 'archived'])
                ->orWhere('archive_status', '!=', 'archived')
                ->orWhere('visibility', '!=', 'public'))
            ->orWhereDoesntHave('researchDocument')
            ->delete();
    }

    private function persistReady(int $documentId, array $source, string $bodyText): string
    {
        return DB::transaction(function () use ($documentId, $source, $bodyText): string {
            $document = ResearchDocument::query()->lockForUpdate()->find($documentId);
            if ($document === null || ! $this->isEligible($document)) {
                $this->purge($documentId);

                return 'ineligible';
            }
            if (! $this->sameSource($source, $this->resolveSource($document, true))) {
                $this->invalidate($documentId);

                return 'skipped';
            }

            $projection = ManuscriptSearchDocument::query()->updateOrCreate(
                ['research_document_id' => $documentId],
                $this->sourceValues($source) + [
                    'body_text' => $bodyText,
                    'body_text_bytes' => strlen($bodyText),
                    'body_text_chars' => mb_strlen($bodyText),
                    'extraction_status' => 'ready',
                    'error_code' => null,
                    'extractor_version' => (string) config('researchnav.manuscript_search.extractor_version'),
                    'last_attempted_at' => now(),
                    'indexed_at' => now(),
                ],
            );
            $this->classifications->classify($projection);

            return 'indexed';
        });
    }

    private function persistFailure(int $documentId, array $source, string $errorCode, string $status): string
    {
        return DB::transaction(function () use ($documentId, $source, $errorCode, $status): string {
            $document = ResearchDocument::query()->lockForUpdate()->find($documentId);
            if ($document === null || ! $this->isEligible($document)) {
                $this->purge($documentId);

                return 'ineligible';
            }
            if (! $this->sameSource($source, $this->resolveSource($document, true))) {
                $this->invalidate($documentId);

                return 'skipped';
            }
            $projection = ManuscriptSearchDocument::query()->updateOrCreate(
                ['research_document_id' => $documentId],
                $this->clearedValues($source, $status, $errorCode),
            );
            $this->invalidateClassification($projection);

            return $status === 'unsupported' ? 'unsupported' : 'failed';
        });
    }

    private function persistNoSource(int $documentId): string
    {
        return DB::transaction(function () use ($documentId): string {
            $document = ResearchDocument::query()->lockForUpdate()->find($documentId);
            if ($document === null || ! $this->isEligible($document)) {
                $this->purge($documentId);

                return 'ineligible';
            }
            if ($this->resolveSource($document, true) !== null) {
                $this->invalidate($documentId);

                return 'skipped';
            }
            $projection = ManuscriptSearchDocument::query()->updateOrCreate(
                ['research_document_id' => $documentId],
                $this->clearedValues(null, 'no_source', 'NO_SOURCE'),
            );
            $this->invalidateClassification($projection);

            return 'no_source';
        });
    }

    /** @return array{kind: string, file_id: int, path: string, extension: string, sha256: string, size: int, updated_at: ?string}|null */
    private function resolveSource(ResearchDocument $document, bool $lock = false): ?array
    {
        $files = $document->files();
        if ($lock) {
            $files->lockForUpdate();
        }
        $final = $files->where('document_type', 'final_manuscript')->where('is_current', true)
            ->orderByDesc('version_number')->orderByDesc('uploaded_at')->orderByDesc('id')->first();
        if ($final !== null) {
            return $this->verifiedSource($document, $final, 'final_manuscript');
        }

        if (! is_string($document->import_source_sha256) || preg_match('/\A[a-f0-9]{64}\z/', $document->import_source_sha256) !== 1
            || ! is_string($document->import_source_filename) || basename($document->import_source_filename) !== $document->import_source_filename
            || strtolower(pathinfo($document->import_source_filename, PATHINFO_EXTENSION)) !== 'docx') {
            return null;
        }

        $canonicalQuery = $document->files();
        if ($lock) {
            $canonicalQuery->lockForUpdate();
        }
        $canonical = $canonicalQuery
            ->whereIn('document_type', ['title_proposal', 'draft'])
            ->where('is_current', true)
            ->where('version_number', 1)
            ->where('original_filename', $document->import_source_filename)
            ->where('stored_filename', $document->import_source_sha256.'.docx')
            ->where('file_path', 'research/'.$document->id.'/'.$document->import_source_sha256.'.docx')
            ->where('file_extension', 'docx')
            ->where('mime_type', self::DOCX_MIME)
            ->get();

        if ($canonical->count() !== 1) {
            return null;
        }
        $source = $this->verifiedSource($document, $canonical->sole(), 'canonical_import');

        return $source !== null && hash_equals($document->import_source_sha256, $source['sha256']) ? $source : null;
    }

    /** @return array{kind: string, file_id: int, path: string, extension: string, sha256: string, size: int, updated_at: ?string}|null */
    private function verifiedSource(ResearchDocument $document, DocumentFile $file, string $kind): ?array
    {
        $extension = strtolower((string) $file->file_extension);
        if (! in_array($extension, ManuscriptSearchDocument::SOURCE_EXTENSIONS, true)
            || ! $this->matchesMime($extension, $file->mime_type)
            || $file->file_size === null
            || ($kind === 'final_manuscript' && ! str_starts_with($file->file_path, 'research/'.$document->id.'/'))
            || basename($file->file_path) !== $file->stored_filename) {
            return null;
        }
        $path = $this->privatePath($file->file_path);
        if ($path === null) {
            return null;
        }
        $size = filesize($path);
        $hash = hash_file('sha256', $path);
        if ($size === false || $hash === false || (int) $file->file_size !== $size) {
            return null;
        }

        return [
            'kind' => $kind,
            'file_id' => (int) $file->id,
            'path' => $path,
            'extension' => $extension,
            'sha256' => $hash,
            'size' => $size,
            'updated_at' => $file->updated_at?->format('Y-m-d H:i:s.u'),
        ];
    }

    private function privatePath(string $relativePath): ?string
    {
        if (config('filesystems.disks.researchnav_private.driver') !== 'local' || str_contains($relativePath, "\0")
            || str_contains($relativePath, '\\') || str_starts_with($relativePath, '/') || preg_match('#(?:^|/)\.\.?(?:/|$)#', $relativePath) === 1) {
            return null;
        }
        try {
            $root = Storage::disk('researchnav_private')->path('');
        } catch (\Throwable) {
            return null;
        }
        $canonicalRoot = realpath($root);
        $candidate = $root.DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
        $canonicalPath = realpath($candidate);
        if ($canonicalRoot === false || $canonicalPath === false || is_link($candidate)
            || ! str_starts_with($canonicalPath, rtrim($canonicalRoot, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR)
            || ! is_file($canonicalPath) || ! is_readable($canonicalPath)) {
            return null;
        }

        return $canonicalPath;
    }

    private function matchesMime(string $extension, ?string $mime): bool
    {
        return ($extension === 'pdf' && $mime === self::PDF_MIME)
            || ($extension === 'docx' && $mime === self::DOCX_MIME)
            || ($extension === 'doc' && $mime === 'application/msword');
    }

    private function isEligible(ResearchDocument $document): bool
    {
        return in_array($document->submission_status, ['approved', 'archived'], true)
            && $document->archive_status === 'archived'
            && $document->visibility === 'public'
            && ! $document->trashed();
    }

    private function isCurrentReadyProjection(?ManuscriptSearchDocument $projection, ?array $source): bool
    {
        return $projection !== null && $projection->extraction_status === 'ready' && $source !== null
            && $projection->extractor_version === (string) config('researchnav.manuscript_search.extractor_version')
            && $this->sameSource($source, [
                'kind' => $projection->source_kind,
                'file_id' => $projection->source_document_file_id,
                'path' => null,
                'extension' => $projection->source_extension,
                'sha256' => $projection->source_sha256,
                'size' => $projection->source_size_bytes,
                'updated_at' => $projection->source_file_updated_at?->format('Y-m-d H:i:s.u'),
            ], false);
    }

    private function isCurrentFailedProjection(?ManuscriptSearchDocument $projection, ?array $source): bool
    {
        return $projection !== null && $projection->extraction_status === 'failed' && $source !== null
            && $projection->extractor_version === (string) config('researchnav.manuscript_search.extractor_version')
            && $this->sameSource($source, [
                'kind' => $projection->source_kind,
                'file_id' => $projection->source_document_file_id,
                'path' => null,
                'extension' => $projection->source_extension,
                'sha256' => $projection->source_sha256,
                'size' => $projection->source_size_bytes,
                'updated_at' => $projection->source_file_updated_at?->format('Y-m-d H:i:s.u'),
            ], false);
    }

    private function refreshReadyClassification(ManuscriptSearchDocument $projection): void
    {
        if (! $this->classifications->isCurrent($projection)) {
            $this->classifications->classify($projection);
        }
    }

    private function hasStaleReadyClassification(?ManuscriptSearchDocument $projection): bool
    {
        return $projection !== null
            && $projection->extraction_status === 'ready'
            && is_string($projection->body_text)
            && $projection->indexed_at !== null
            && ! $this->classifications->isCurrent($projection);
    }

    private function invalidateClassification(?ManuscriptSearchDocument $projection): void
    {
        if ($projection !== null) {
            $this->classifications->invalidate($projection);
        }
    }

    private function sameSource(array $left, ?array $right, bool $includePath = true): bool
    {
        if ($right === null) {
            return false;
        }
        foreach (['kind', 'file_id', 'extension', 'sha256', 'size', 'updated_at'] as $key) {
            if ((string) $left[$key] !== (string) $right[$key]) {
                return false;
            }
        }

        return ! $includePath || $left['path'] === $right['path'];
    }

    /** @return array<string, mixed> */
    private function sourceValues(array $source): array
    {
        return [
            'source_document_file_id' => $source['file_id'],
            'source_kind' => $source['kind'],
            'source_extension' => $source['extension'],
            'source_sha256' => $source['sha256'],
            'source_size_bytes' => $source['size'],
            'source_file_updated_at' => $source['updated_at'],
        ];
    }

    /** @return array<string, mixed> */
    private function clearedValues(?array $source, string $status, ?string $errorCode): array
    {
        return ($source === null ? [
            'source_document_file_id' => null,
            'source_kind' => null,
            'source_extension' => null,
            'source_sha256' => null,
            'source_size_bytes' => null,
            'source_file_updated_at' => null,
        ] : $this->sourceValues($source)) + [
            'body_text' => null,
            'body_text_bytes' => null,
            'body_text_chars' => null,
            'extraction_status' => $status,
            'error_code' => $errorCode,
            'extractor_version' => (string) config('researchnav.manuscript_search.extractor_version'),
            'last_attempted_at' => now(),
            'indexed_at' => null,
        ];
    }

    private function purge(int $documentId): void
    {
        ManuscriptSearchDocument::query()->where('research_document_id', $documentId)->delete();
    }
}
