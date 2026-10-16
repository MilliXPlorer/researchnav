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

    private const MAX_FINAL_SOURCE_FILES = 20;

    private const MAX_FINAL_SOURCE_BYTES = 400 * 1024 * 1024;

    public function __construct(
        private readonly ManuscriptTextExtractor $extractor,
    ) {}

    /** @return 'indexed'|'skipped'|'failed'|'no_source'|'unsupported'|'ineligible' */
    public function reindex(int $documentId, bool $force = false, bool $retryFailed = false): string
    {
        $document = ResearchDocument::query()->find($documentId);
        if ($document === null || ! $this->isEligible($document)) {
            $this->purge($documentId);

            return 'ineligible';
        }

        $resolution = $this->resolveSource($document);
        $source = $resolution['source'];
        $projection = ManuscriptSearchDocument::query()->where('research_document_id', $documentId)->first();
        if (! $force && $this->isCurrentReadyProjection($projection, $source)) {
            return 'skipped';
        }
        if (! $force && $this->isCurrentResolutionFailure($projection, $resolution)) {
            return 'skipped';
        }
        if (! $force && $this->isCurrentTerminalProjection($projection, $source)
            && ($projection->extraction_status === 'unsupported' || ! $retryFailed)) {
            return 'skipped';
        }

        if ($resolution['state'] === 'no_source') {
            return $this->persistNoSource($documentId);
        }
        if ($resolution['state'] === 'invalid') {
            return $this->persistResolutionFailure($documentId, 'invalid', 'INVALID_SOURCE');
        }
        if ($resolution['state'] === 'limit') {
            return $this->persistResolutionFailure($documentId, 'limit', 'SOURCE_LIMIT_EXCEEDED');
        }
        if ($source['has_doc']) {
            return $this->persistFailure($documentId, $source, 'UNSUPPORTED_SOURCE', 'unsupported');
        }

        try {
            [$bodyText, $source] = $this->extractSource($source);
        } catch (\LengthException) {
            return $this->persistFailure($documentId, $source, 'AGGREGATE_OUTPUT_LIMIT_EXCEEDED', 'failed');
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
        ManuscriptSearchDocument::query()->updateOrCreate(
            ['research_document_id' => $documentId],
            $this->clearedValues(null, 'pending', null),
        );
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
            $resolution = $this->resolveSource($document, true);
            if ($resolution['state'] !== 'source' || ! $this->sameSource($source, $resolution['source'])) {
                $this->invalidate($documentId);

                return 'skipped';
            }

            ManuscriptSearchDocument::query()->updateOrCreate(
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
            $resolution = $this->resolveSource($document, true);
            if ($resolution['state'] !== 'source' || ! $this->sameSource($source, $resolution['source'])) {
                $this->invalidate($documentId);

                return 'skipped';
            }
            ManuscriptSearchDocument::query()->updateOrCreate(
                ['research_document_id' => $documentId],
                $this->clearedValues($source, $status, $errorCode),
            );

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
            if ($this->resolveSource($document, true)['state'] !== 'no_source') {
                $this->invalidate($documentId);

                return 'skipped';
            }
            ManuscriptSearchDocument::query()->updateOrCreate(
                ['research_document_id' => $documentId],
                $this->clearedValues(null, 'no_source', 'NO_SOURCE'),
            );

            return 'no_source';
        });
    }

    private function persistResolutionFailure(int $documentId, string $state, string $errorCode): string
    {
        return DB::transaction(function () use ($documentId, $state, $errorCode): string {
            $document = ResearchDocument::query()->lockForUpdate()->find($documentId);
            if ($document === null || ! $this->isEligible($document)) {
                $this->purge($documentId);

                return 'ineligible';
            }
            if ($this->resolveSource($document, true)['state'] !== $state) {
                $this->invalidate($documentId);

                return 'skipped';
            }
            ManuscriptSearchDocument::query()->updateOrCreate(
                ['research_document_id' => $documentId],
                $this->clearedValues(null, 'failed', $errorCode),
            );

            return 'failed';
        });
    }

    /** @return array{state: 'source'|'no_source'|'invalid'|'limit', source: ?array} */
    private function resolveSource(ResearchDocument $document, bool $lock = false): array
    {
        $finalQuery = $document->files()
            ->where('document_type', 'final_manuscript')
            ->where('is_current', true);
        if ($lock) {
            $finalQuery->lockForUpdate();
        }
        $finalLimits = (clone $finalQuery)
            ->selectRaw('COUNT(*) as file_count, COALESCE(SUM(file_size), 0) as total_size')
            ->first();
        if ((int) $finalLimits->file_count > self::MAX_FINAL_SOURCE_FILES
            || (int) $finalLimits->total_size > self::MAX_FINAL_SOURCE_BYTES) {
            return ['state' => 'limit', 'source' => null];
        }
        if ($finalLimits->file_count > 0) {
            $final = $finalQuery->orderBy('file_order')->orderBy('original_filename')->orderBy('id')->get();
            if ($final->isEmpty()) {
                return ['state' => 'no_source', 'source' => null];
            }
            if ($final->count() > self::MAX_FINAL_SOURCE_FILES || $final->sum('file_size') > self::MAX_FINAL_SOURCE_BYTES) {
                return ['state' => 'limit', 'source' => null];
            }
            $sources = [];
            foreach ($final as $file) {
                $source = $this->verifiedSource($document, $file, 'final_manuscript');
                if ($source === null) {
                    return ['state' => 'invalid', 'source' => null];
                }
                $sources[] = $source;
            }

            return ['state' => 'source', 'source' => $this->aggregateFinalSource($sources)];
        }

        if (! is_string($document->import_source_sha256) || preg_match('/\A[a-f0-9]{64}\z/', $document->import_source_sha256) !== 1
            || ! is_string($document->import_source_filename) || basename($document->import_source_filename) !== $document->import_source_filename
            || strtolower(pathinfo($document->import_source_filename, PATHINFO_EXTENSION)) !== 'docx') {
            return ['state' => 'no_source', 'source' => null];
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
            return ['state' => 'no_source', 'source' => null];
        }
        $source = $this->verifiedSource($document, $canonical->sole(), 'canonical_import');

        return $source !== null && hash_equals($document->import_source_sha256, $source['sha256'])
            ? ['state' => 'source', 'source' => $source]
            : ['state' => 'no_source', 'source' => null];
    }

    /** @return array{kind: string, file_id: int, path: string, source_path: string, file_order: int, original_filename: string, extension: string, sha256: string, size: int, updated_at: ?string, has_doc: bool}|null */
    private function verifiedSource(ResearchDocument $document, DocumentFile $file, string $kind): ?array
    {
        $extension = strtolower((string) $file->file_extension);
        if (! in_array($extension, ManuscriptSearchDocument::SOURCE_EXTENSIONS, true)
            || ! $this->matchesMime($extension, $file->mime_type)
            || $file->file_size === null
            || ! is_string($file->file_path)
            || $file->file_path === ''
            || basename($file->file_path) !== $file->stored_filename
            || ($document->import_source_sha256 === null && ! str_starts_with($file->file_path, 'research/'.$document->id.'/'))) {
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
            'source_path' => $file->file_path,
            'file_order' => (int) $file->file_order,
            'original_filename' => (string) $file->original_filename,
            'extension' => $extension,
            'sha256' => $hash,
            'size' => $size,
            'updated_at' => $file->updated_at?->format('Y-m-d H:i:s.u'),
            'has_doc' => $extension === 'doc',
            'remote' => false,
        ];
    }

    /** @param array<int, array{file_id: int, path: string, source_path: string, file_order: int, original_filename: string, extension: string, sha256: string, size: int, updated_at: ?string, has_doc: bool}> $files */
    private function aggregateFinalSource(array $files): array
    {
        if (count($files) === 1) {
            return $files[0];
        }

        $manifest = [];
        $extensions = [];
        $size = 0;
        $updatedAt = null;
        $hasDoc = false;
        foreach ($files as $file) {
            $manifest[] = [
                'id' => $file['file_id'],
                'file_order' => $file['file_order'],
                'original_filename' => $file['original_filename'],
                'path' => $file['source_path'],
                'extension' => $file['extension'],
                'sha256' => $file['sha256'],
                'size' => $file['size'],
                'updated_at' => $file['updated_at'],
            ];
            $extensions[$file['extension']] = true;
            $size += $file['size'];
            $updatedAt = $file['updated_at'] !== null && ($updatedAt === null || $file['updated_at'] > $updatedAt)
                ? $file['updated_at']
                : $updatedAt;
            $hasDoc = $hasDoc || $file['has_doc'];
        }

        return [
            'kind' => 'final_manuscript',
            'file_id' => null,
            'path' => null,
            'extension' => count($extensions) === 1 ? array_key_first($extensions) : null,
            'sha256' => hash('sha256', json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
            'size' => $size,
            'updated_at' => $updatedAt,
            'has_doc' => $hasDoc,
            'files' => $files,
        ];
    }

    /** @return array{string, array} */
    private function extractSource(array $source): array
    {
        if (! isset($source['files'])) {
            return [$this->extractor->extract($source['path']), $source];
        }

        $bodyText = '';
        $bodyTextBytes = 0;
        $bodyTextChars = 0;
        $maximumOutputBytes = (int) config('researchnav.manuscript_search.maximum_output_bytes');
        $maximumTextCharacters = (int) config('researchnav.manuscript_search.maximum_text_characters');
        foreach ($source['files'] as $file) {
            $text = $this->extractor->extract($file['path']);
            if ($text === '') {
                return ['', $source];
            }
            $separator = $bodyText === '' ? '' : "\n\n";
            $nextBytes = $bodyTextBytes + strlen($separator) + strlen($text);
            $nextChars = $bodyTextChars + mb_strlen($separator) + mb_strlen($text);
            if ($nextBytes > $maximumOutputBytes || $nextChars > $maximumTextCharacters) {
                throw new \LengthException('Aggregate manuscript output exceeds its limit.');
            }
            $bodyText .= $separator.$text;
            $bodyTextBytes = $nextBytes;
            $bodyTextChars = $nextChars;
        }

        return [$bodyText, $source];
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
                'has_doc' => false,
            ], false);
    }

    private function isCurrentTerminalProjection(?ManuscriptSearchDocument $projection, ?array $source): bool
    {
        return $projection !== null && in_array($projection->extraction_status, ['failed', 'unsupported'], true) && $source !== null
            && $projection->extractor_version === (string) config('researchnav.manuscript_search.extractor_version')
            && $this->sameSource($source, [
                'kind' => $projection->source_kind,
                'file_id' => $projection->source_document_file_id,
                'path' => null,
                'extension' => $projection->source_extension,
                'sha256' => $projection->source_sha256,
                'size' => $projection->source_size_bytes,
                'updated_at' => $projection->source_file_updated_at?->format('Y-m-d H:i:s.u'),
                'has_doc' => false,
            ], false);
    }

    /** @param array{state: 'source'|'no_source'|'invalid'|'limit', source: ?array} $resolution */
    private function isCurrentResolutionFailure(?ManuscriptSearchDocument $projection, array $resolution): bool
    {
        return $projection !== null
            && $projection->extraction_status === 'failed'
            && $projection->extractor_version === (string) config('researchnav.manuscript_search.extractor_version')
            && (($resolution['state'] === 'invalid' && $projection->error_code === 'INVALID_SOURCE')
                || ($resolution['state'] === 'limit' && $projection->error_code === 'SOURCE_LIMIT_EXCEEDED'));
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
