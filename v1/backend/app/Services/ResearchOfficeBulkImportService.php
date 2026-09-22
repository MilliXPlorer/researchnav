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
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class ResearchOfficeBulkImportService
{
    private const DISK = 'researchnav_private';

    public function __construct(
        private readonly AuditService $audit,
        private readonly MonitoringService $monitoring,
        private readonly ?ManuscriptSearchProjectionService $manuscriptSearch = null,
    ) {}

    /** @param array<string, mixed> $metadata
     * @param  UploadedFile|list<UploadedFile>  $file
     * @param  list<string>|null  $relativePaths
     */
    public function import(User $actor, UploadedFile|array $file, array $metadata, ?Request $request = null, ?array $relativePaths = null): ResearchDocument
    {
        $files = $file instanceof UploadedFile ? [$file] : array_values($file);
        $relativePaths ??= array_map(fn (UploadedFile $item) => $item->getClientOriginalName(), $files);
        if ($files === [] || count($files) !== count($relativePaths)) {
            throw new RuntimeException('The manuscript files could not be read.');
        }

        $items = [];
        foreach ($files as $index => $item) {
            $contents = file_get_contents($item->getRealPath());
            if (! is_string($contents) || $contents === '') {
                throw new RuntimeException('The manuscript file could not be read.');
            }
            $items[] = ['file' => $item, 'contents' => $contents, 'hash' => hash('sha256', $contents),
                'name' => $this->safeFilename($item->getClientOriginalName()), 'relative' => $this->safeRelativePath($relativePaths[$index])];
        }
        usort($items, fn ($a, $b) => [$this->fileRank($a['name']), strtolower($a['name']), $a['name']] <=> [$this->fileRank($b['name']), strtolower($b['name']), $b['name']]);
        $groupName = str_contains($items[0]['relative'], '/') ? basename(str_replace('\\', '/', dirname($items[0]['relative']))) : null;
        $hash = count($items) === 1
            ? $items[0]['hash']
            : hash('sha256', implode('|', array_map(fn ($item) => $item['relative'].':'.$item['hash'], $items)));
        $normalizedTitle = $this->normalizedTitle($metadata['title']);
        if (ResearchDocument::query()->where('import_source_sha256', $hash)->exists()) {
            throw new RuntimeException('This manuscript has already been uploaded.');
        }
        if (ResearchDocument::query()->where('normalized_title', $normalizedTitle)->exists()) {
            throw new RuntimeException('A research record with this title already exists.');
        }
        $uploadedPaths = [];

        try {
            foreach ($items as &$item) {
                $item['mime'] = strtolower($item['file']->getClientOriginalExtension()) === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                $item['path'] = $this->objectPath($metadata['institute'], (int) $metadata['year'], $metadata['title'], $item['name']);
                if (Storage::disk(self::DISK)->exists($item['path'])) {
                    $item['path'] = $this->withHashSuffix($item['path'], substr($item['hash'], 0, 12));
                }
                Storage::disk(self::DISK)->put($item['path'], $item['contents']);
                $uploadedPaths[] = $item['path'];
            }
            unset($item);

            $document = DB::transaction(function () use ($actor, $items, $metadata, $request, $hash, $groupName, $normalizedTitle): ResearchDocument {
                if (ResearchDocument::query()->where('import_source_sha256', $hash)->lockForUpdate()->exists()) {
                    throw new RuntimeException('This manuscript has already been uploaded.');
                }
                if (ResearchDocument::query()->where('normalized_title', $normalizedTitle)->lockForUpdate()->exists()) {
                    throw new RuntimeException('A research record with this title already exists.');
                }
                $instituteColumn = Schema::hasColumn('research_documents', 'institute') ? 'institute' : 'academic_unit';
                $document = ResearchDocument::query()->create([
                    'submitted_by' => $actor->id, 'title' => trim($metadata['title']), 'normalized_title' => $normalizedTitle,
                    'abstract' => trim($metadata['abstract']), 'keywords' => implode(', ', $metadata['keywords']), 'publication_year' => (int) $metadata['year'],
                    $instituteColumn => $metadata['institute'], 'institution_name' => $metadata['institute'], 'manuscript_date_label' => trim($metadata['final_binding_date']),
                    'abstract_provenance' => 'Extracted from uploaded manuscript and confirmed by Research Office.', 'research_stage' => 'completed',
                    'submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public', 'approved_at' => now(), 'archived_at' => now(),
                    'import_source_sha256' => $hash, 'import_source_filename' => $items[0]['name'], 'import_group_name' => $groupName,
                ]);
                $document->sdgs()->sync($metadata['sdg_ids'] ?? []);
                foreach (array_values($metadata['researchers']) as $index => $researcher) {
                    ResearchAuthor::query()->create([
                        'research_document_id' => $document->id, 'user_id' => null, 'author_name' => trim($researcher), 'author_order' => $index + 1, 'is_corresponding_author' => false,
                    ]);
                }
                foreach ($items as $index => $item) {
                    DocumentFile::query()->create([
                        'research_document_id' => $document->id, 'uploaded_by' => $actor->id, 'document_type' => 'final_manuscript', 'version_number' => $index + 1,
                        'original_filename' => $item['name'], 'relative_path' => $item['relative'], 'file_order' => $index + 1, 'stored_filename' => basename($item['path']),
                        'file_path' => $item['path'], 'file_extension' => strtolower($item['file']->getClientOriginalExtension()), 'mime_type' => $item['mime'],
                        'file_size' => $item['file']->getSize(), 'content_sha256' => $item['hash'], 'is_current' => true, 'uploaded_at' => now(),
                    ]);
                }
                $this->monitoring->log($document, 'RESEARCH_IMPORTED', $actor, 'Imported and published a reviewed manuscript.', null, 'archived', 'archived');
                $this->audit->log($actor, 'RESEARCH_IMPORTED', $document, 'Imported a reviewed manuscript.', $request);

                return $document->load(['authors', 'files', 'sdgs']);
            });
            try {
                ($this->manuscriptSearch ?? app(ManuscriptSearchProjectionService::class))->reindex((int) $document->id, true, true);
            } catch (\Throwable) {
                Log::warning('Imported manuscript text indexing failed.', ['research_document_id' => $document->id]);
            }

            return $document;
        } catch (\Throwable $exception) {
            foreach ($uploadedPaths as $path) {
                try {
                    Storage::disk(self::DISK)->delete($path);
                } catch (\Throwable) {
                    Log::critical('Local manuscript cleanup failed after import failure.', ['object_hash' => hash('sha256', $path)]);
                }
            }
            throw $exception;
        }
    }

    public function objectPath(string $institute, int $year, string $title, string $filename): string
    {
        return implode('/', [$this->safeSegment($institute), preg_replace('/[^0-9]/', '', (string) $year) ?: 'Unknown Year', $this->safeSegment($title), $this->safeFilename($filename)]);
    }

    private function fileRank(string $name): int
    {
        return preg_match('/\Afront/i', $name) ? 0 : (preg_match('/\Amanuscript/i', $name) ? 1 : 2);
    }

    private function safeRelativePath(string $path): string
    {
        $segments = array_values(array_filter(explode('/', str_replace('\\', '/', $path)), fn ($part) => $part !== '' && $part !== '.' && $part !== '..'));

        return implode('/', array_map(fn ($part) => $this->safeFilename($part), $segments));
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
