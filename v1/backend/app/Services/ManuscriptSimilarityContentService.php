<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

class ManuscriptSimilarityContentService
{
    private const SOURCE_PRECEDENCE = [
        'final_manuscript' => 0,
        'revised_manuscript' => 1,
        'draft' => 2,
        'chapter' => 3,
        'title_proposal' => 4,
    ];

    /**
     * @param  Collection<int, ResearchDocument>  $candidates
     * @return array{source: array{text: ?string, sha256: ?string, fingerprint: array<string, mixed>}, candidates: array<int, array{text: string, sha256: string}|null>}
     */
    public function contentFor(ResearchDocument $source, Collection $candidates): array
    {
        $sourceContent = $this->sourceContent($source);
        $candidateContent = [];
        $projections = ManuscriptSearchDocument::query()
            ->whereIn('research_document_id', $candidates->pluck('id'))
            ->get()
            ->keyBy('research_document_id');

        foreach ($candidates as $candidate) {
            $projection = $projections->get($candidate->id);
            $candidateContent[(int) $candidate->id] = $this->isTrustedReadyProjection($projection)
                ? ['text' => $projection->body_text, 'sha256' => $projection->source_sha256]
                : null;
        }

        return ['source' => $sourceContent, 'candidates' => $candidateContent];
    }

    /**
     * A ready projection is trusted only when it can be tied to a current,
     * configured extractor and a canonical source digest. This predicate is
     * shared with the public-query runner so neither path invents an official
     * content/overall score from stale or malformed provenance.
     */
    public function isTrustedReadyProjection(?ManuscriptSearchDocument $projection): bool
    {
        return $projection?->extraction_status === 'ready'
            && is_string($projection->body_text)
            && trim($projection->body_text) !== ''
            && is_string($projection->source_sha256)
            && preg_match('/\A[a-f0-9]{64}\z/', $projection->source_sha256) === 1
            && $projection->extractor_version === config('researchnav.manuscript_search.extractor_version');
    }

    /**
     * Snapshot all source inputs without extracting text. Callers that compare
     * this after scoring must already hold the parent research-document lock.
     *
     * @return array<string, mixed>
     */
    public function sourceFingerprint(ResearchDocument $source, bool $lock = false): array
    {
        $projectionQuery = ManuscriptSearchDocument::query()
            ->where('research_document_id', $source->id);
        if ($lock) {
            $projectionQuery->lockForUpdate();
        }
        $projection = $projectionQuery->first();
        $projectionFingerprint = $this->projectionFingerprint($projection);
        if ($this->isTrustedReadyProjection($projection)) {
            return ['mode' => 'trusted_ready_projection', 'projection' => $projectionFingerprint, 'selected_file' => null];
        }

        $file = $this->selectedSourceFile($source, $lock);
        if (! $file instanceof DocumentFile) {
            return ['mode' => 'unavailable', 'projection' => $projectionFingerprint, 'selected_file' => null];
        }

        return [
            'mode' => 'selected_file',
            'projection' => $projectionFingerprint,
            'selected_file' => [
                'id' => (int) $file->id,
                'sha256' => $this->sourceFileSha256($source, $file),
            ],
        ];
    }

    /** @return array{text: ?string, sha256: ?string, fingerprint: array<string, mixed>} */
    private function sourceContent(ResearchDocument $source): array
    {
        $fingerprint = $this->sourceFingerprint($source);
        if ($fingerprint['mode'] === 'trusted_ready_projection') {
            $projection = ManuscriptSearchDocument::query()->find($fingerprint['projection']['id']);

            return ['text' => $projection->body_text, 'sha256' => $projection->source_sha256, 'fingerprint' => $fingerprint];
        }

        $file = $this->selectedSourceFile($source);
        if (! $file instanceof DocumentFile) {
            return ['text' => null, 'sha256' => null, 'fingerprint' => $fingerprint];
        }

        try {
            $path = $this->verifiedPrivatePath($source, $file);
            $text = app(ManuscriptTextExtractor::class)->extract($path);
            $sha256 = $fingerprint['selected_file']['sha256'];
            if ($text === '' || ! is_string($sha256)) {
                return ['text' => null, 'sha256' => null, 'fingerprint' => $fingerprint];
            }

            return ['text' => $text, 'sha256' => $sha256, 'fingerprint' => $fingerprint];
        } catch (SimilarityUnavailableException|ManuscriptTextExtractionException) {
            // A title comparison remains useful, but no official content/overall
            // score is invented when full-text extraction is unavailable.
            return ['text' => null, 'sha256' => null, 'fingerprint' => $fingerprint];
        }
    }

    private function selectedSourceFile(ResearchDocument $source, bool $lock = false): ?DocumentFile
    {
        $query = $source->files()->current();
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->get()
            ->filter(fn (DocumentFile $file): bool => isset(self::SOURCE_PRECEDENCE[$file->document_type]))
            ->sortBy(fn (DocumentFile $file): array => [self::SOURCE_PRECEDENCE[$file->document_type], -$file->version_number, -$file->id])
            ->first();
    }

    /** @return array{present: bool, id: ?int, status: ?string, source_sha256: ?string, body_sha256: ?string, extractor_version: ?string} */
    private function projectionFingerprint(?ManuscriptSearchDocument $projection): array
    {
        return [
            'present' => $projection !== null,
            'id' => $projection?->id === null ? null : (int) $projection->id,
            'status' => $projection?->extraction_status,
            'source_sha256' => $projection?->source_sha256,
            'body_sha256' => $projection?->body_text === null ? null : hash('sha256', $projection->body_text),
            'extractor_version' => $projection?->extractor_version,
        ];
    }

    private function sourceFileSha256(ResearchDocument $source, DocumentFile $file): ?string
    {
        try {
            $sha256 = hash_file('sha256', $this->verifiedPrivatePath($source, $file));
        } catch (SimilarityUnavailableException) {
            return null;
        }

        return is_string($sha256) ? $sha256 : null;
    }

    private function verifiedPrivatePath(ResearchDocument $source, DocumentFile $file): string
    {
        $extension = strtolower((string) $file->file_extension);
        $validMime = ($extension === 'pdf' && $file->mime_type === 'application/pdf')
            || ($extension === 'docx' && $file->mime_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        if (! $validMime || ! str_starts_with($file->file_path, 'research/'.$source->id.'/')
            || basename($file->file_path) !== $file->stored_filename
            || str_contains($file->file_path, "\0") || str_contains($file->file_path, '\\')
            || str_starts_with($file->file_path, '/') || preg_match('#(?:^|/)\.\.?(?:/|$)#', $file->file_path) === 1) {
            throw new SimilarityUnavailableException('The current manuscript is not supported for content similarity.');
        }

        try {
            $root = Storage::disk('researchnav_private')->path('');
            $candidate = Storage::disk('researchnav_private')->path($file->file_path);
        } catch (\Throwable) {
            throw new SimilarityUnavailableException('The current manuscript could not be accessed.');
        }
        $canonicalRoot = realpath($root);
        $canonicalPath = realpath($candidate);
        $size = $canonicalPath === false ? false : filesize($canonicalPath);
        if ($canonicalRoot === false || $canonicalPath === false || is_link($candidate)
            || ! str_starts_with($canonicalPath, rtrim($canonicalRoot, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR)
            || ! is_file($canonicalPath) || ! is_readable($canonicalPath)
            || $size === false || (int) $file->file_size !== $size) {
            throw new SimilarityUnavailableException('The current manuscript could not be verified.');
        }

        return $canonicalPath;
    }
}
