<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class ResearchOfficeBulkImportService
{
    public function __construct(
        private readonly SupabaseStorageService $storage,
        private readonly AuditService $audit,
        private readonly MonitoringService $monitoring,
        private readonly ?ManuscriptSimilarityTextCache $textCache = null,
    ) {}

    /** @param array<string, mixed> $metadata */
    public function import(User $actor, UploadedFile $file, array $metadata, ?Request $request = null, ?string $extractedText = null): ResearchDocument
    {
        $contents = file_get_contents($file->getRealPath());
        if (! is_string($contents) || $contents === '') {
            throw new RuntimeException('The manuscript file could not be read.');
        }

        $hash = hash('sha256', $contents);
        $originalFilename = $this->safeFilename($file->getClientOriginalName());
        $path = $this->objectPath($metadata['institute'], (int) $metadata['year'], $metadata['title'], $originalFilename);
        if ($this->storage->exists($path)) {
            $path = $this->withHashSuffix($path, substr($hash, 0, 12));
        }

        $mimeType = strtolower($file->getClientOriginalExtension()) === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        $this->storage->upload($path, $contents, $mimeType);

        try {
            $document = DB::transaction(function () use ($actor, $file, $metadata, $request, $hash, $originalFilename, $path, $mimeType): ResearchDocument {
                if (ResearchDocument::withTrashed()->where('import_source_sha256', $hash)->lockForUpdate()->exists()) {
                    throw new RuntimeException('This manuscript has already been imported.');
                }

                $normalizedTitle = $this->normalizedTitle($metadata['title']);
                if (ResearchDocument::withTrashed()->where('normalized_title', $normalizedTitle)->lockForUpdate()->exists()) {
                    throw new RuntimeException('A research record with this title already exists.');
                }

                $document = ResearchDocument::query()->create([
                    'submitted_by' => $actor->id,
                    'title' => trim($metadata['title']),
                    'normalized_title' => $normalizedTitle,
                    'abstract' => trim($metadata['abstract']),
                    'keywords' => implode(', ', $metadata['keywords']),
                    'publication_year' => (int) $metadata['year'],
                    'institution_name' => $metadata['institute'],
                    'manuscript_date_label' => trim($metadata['final_binding_date']),
                    'abstract_provenance' => 'Extracted from uploaded manuscript and confirmed by Research Office.',
                    'research_stage' => 'completed',
                    'submission_status' => 'archived',
                    'archive_status' => 'archived',
                    'visibility' => 'public',
                    'approved_at' => now(),
                    'archived_at' => now(),
                    'import_source_sha256' => $hash,
                    'import_source_filename' => $originalFilename,
                ]);

                foreach (array_values($metadata['researchers']) as $index => $researcher) {
                    ResearchAuthor::query()->create([
                        'research_document_id' => $document->id,
                        'user_id' => null,
                        'author_name' => trim($researcher),
                        'author_order' => $index + 1,
                        'is_corresponding_author' => false,
                    ]);
                }

                DocumentFile::query()->create([
                    'research_document_id' => $document->id,
                    'uploaded_by' => $actor->id,
                    'document_type' => 'final_manuscript',
                    'version_number' => 1,
                    'original_filename' => $originalFilename,
                    'stored_filename' => basename($path),
                    'file_path' => $path,
                    'file_extension' => strtolower($file->getClientOriginalExtension()),
                    'mime_type' => $mimeType,
                    'file_size' => $file->getSize(),
                    'is_current' => true,
                    'uploaded_at' => now(),
                ]);

                $this->monitoring->log($document, 'RESEARCH_IMPORTED', $actor, 'Imported and published a reviewed manuscript.', null, 'archived', 'archived');
                $this->audit->log($actor, 'RESEARCH_IMPORTED', $document, 'Imported a reviewed manuscript.', $request);

                return $document->load(['authors', 'files']);
            });

            if (is_string($extractedText) && trim($extractedText) !== '') {
                ($this->textCache ?? app(ManuscriptSimilarityTextCache::class))->put($document->files->first(), $extractedText);
            }

            return $document;
        } catch (\Throwable $exception) {
            try {
                $this->storage->delete($path);
            } catch (\Throwable) {
                Log::critical('Supabase manuscript cleanup failed after database rollback.', ['object_hash' => hash('sha256', $path)]);
            }

            throw $exception;
        }
    }

    public function objectPath(string $institute, int $year, string $title, string $filename): string
    {
        return implode('/', [
            $this->safeSegment($institute),
            preg_replace('/[^0-9]/', '', (string) $year) ?: 'Unknown Year',
            $this->safeSegment($title),
            $this->safeFilename($filename),
        ]);
    }

    private function safeSegment(string $value): string
    {
        $value = Str::ascii($value);
        $value = preg_replace('/[<>:"\\|?*\x00-\x1F\/]+/u', ' ', trim($value));
        $value = preg_replace('/\s+/u', ' ', (string) $value);

        return trim((string) $value, " .\t\n\r\0\x0B") ?: 'Unclassified';
    }

    private function safeFilename(string $value): string
    {
        $value = basename(str_replace('\\', '/', $value));
        $extension = strtolower(pathinfo($value, PATHINFO_EXTENSION));
        $name = $this->safeSegment(pathinfo($value, PATHINFO_FILENAME));

        return $name.($extension !== '' ? '.'.$extension : '');
    }

    private function withHashSuffix(string $path, string $suffix): string
    {
        $extension = pathinfo($path, PATHINFO_EXTENSION);
        $base = $extension === '' ? $path : substr($path, 0, -strlen($extension) - 1);

        return $base.'-'.$suffix.($extension !== '' ? '.'.$extension : '');
    }

    private function normalizedTitle(string $title): string
    {
        return Str::of($title)->lower()->replaceMatches('/[^a-z0-9]+/', ' ')->trim()->toString();
    }
}
