<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Category;
use App\Models\DocumentFile;
use App\Models\MonitoringLog;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use JsonException;
use RuntimeException;

class ResearchStudyImportService
{
    private const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    private const WORD_MAIN_DOCUMENT_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

    private const CONTENT_TYPES_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/content-types';

    private const RELATIONSHIPS_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';

    private const OFFICE_DOCUMENT_RELATIONSHIP = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';

    private const WORDPROCESSINGML_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

    /**
     * @return array{imported: int, updated: int, skipped_duplicates: int}
     */
    public function import(string $source, string $ownerEmail): array
    {
        $manifest = $this->validatedManifest($source);
        $ownerEmail = Str::lower(trim($ownerEmail));
        if (! filter_var($ownerEmail, FILTER_VALIDATE_EMAIL)) {
            throw new RuntimeException('The import owner email is invalid.');
        }

        /** @var array<int, string> $newStoragePaths */
        $newStoragePaths = [];

        try {
            return DB::transaction(function () use ($manifest, $ownerEmail, &$newStoragePaths): array {
                $owner = User::query()->active()->where('email', $ownerEmail)->lockForUpdate()->first();
                if ($owner === null) {
                    throw new RuntimeException('The import owner must be an active existing account.');
                }

                $result = ['imported' => 0, 'updated' => 0, 'skipped_duplicates' => $manifest['duplicate_count']];
                foreach ($manifest['studies'] as $study) {
                    $document = $this->findDocument($study['source_sha256']);
                    $isNew = $document === null;
                    $normalizedTitle = $this->normalizedTitle($study['title']);
                    if ($this->hasTitleCollision($study['title'], $normalizedTitle, $document?->id)) {
                        throw new RuntimeException('The import cannot overwrite an existing study with the same title.');
                    }
                    if (! $isNew && $document->submitted_by !== $owner->id) {
                        throw new RuntimeException('The import owner must match the existing imported study owner.');
                    }
                    if (! $isNew && $document->import_source_filename !== $study['source_filename']) {
                        throw new RuntimeException('The import source identity cannot be changed.');
                    }

                    $category = $this->upsertCategory($study['category']);
                    $wasArchived = ! $isNew && $document->submission_status === 'archived' && $document->archive_status === 'archived';

                    $document ??= new ResearchDocument;
                    $document->fill([
                        'category_id' => $category->id,
                        'title' => $study['title'],
                        'normalized_title' => $normalizedTitle,
                        'abstract' => $study['abstract'],
                        'keywords' => implode(', ', $study['keywords']),
                        'publication_year' => $study['publication_year'],
                        'institution_name' => $study['institution_name'],
                        'institution_location' => $study['institution_location'],
                        'academic_unit' => $study['academic_unit'],
                        'degree_program' => $study['degree_program'],
                        'manuscript_date_label' => $study['manuscript_date_label'],
                        'abstract_provenance' => $study['abstract_provenance'],
                        'research_stage' => $study['research_stage'],
                        'submission_status' => 'archived',
                        'archive_status' => 'archived',
                        'visibility' => 'public',
                        'submitted_at' => null,
                        'approved_at' => null,
                    ]);
                    if ($isNew) {
                        $document->submitted_by = $owner->id;
                        $document->import_source_sha256 = $study['source_sha256'];
                        $document->import_source_filename = $study['source_filename'];
                    }
                    if (! $wasArchived) {
                        $document->archived_at = now();
                    }
                    $document->save();

                    $this->replaceAuthors($document, $study['authors']);
                    $this->storeCanonicalFile($document, $owner, $study, $newStoragePaths);
                    $this->createImportLogs($document, $owner);

                    $result[$isNew ? 'imported' : 'updated']++;
                }

                return $result;
            });
        } catch (\Throwable $exception) {
            foreach ($newStoragePaths as $path) {
                Storage::disk('researchnav_private')->delete($path);
            }

            throw $exception;
        }
    }

    /**
     * @return array{studies: array<int, array<string, mixed>>, duplicate_count: int}
     */
    private function validatedManifest(string $source): array
    {
        $source = realpath($source) ?: '';
        if ($source === '' || ! is_dir($source)) {
            throw new RuntimeException('The import source directory is unavailable.');
        }

        $catalogPath = $source.DIRECTORY_SEPARATOR.'catalog.json';
        if (is_link($catalogPath)) {
            throw new RuntimeException('The import catalog must not be a symbolic link.');
        }
        if (! is_file($catalogPath) || ! is_readable($catalogPath)) {
            throw new RuntimeException('The import catalog is unavailable.');
        }
        $catalogPath = $this->canonicalSourcePath($source, $catalogPath);

        try {
            $catalog = json_decode((string) file_get_contents($catalogPath), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new RuntimeException('The import catalog contains invalid JSON.');
        }

        if (! is_array($catalog) || ($catalog['version'] ?? null) !== 1 || ! isset($catalog['studies']) || ! is_array($catalog['studies']) || count($catalog['studies']) !== 10) {
            throw new RuntimeException('The import catalog must be version 1 with exactly ten studies.');
        }

        $studies = [];
        $declaredFilenames = [];
        $titles = [];
        $categoryDefinitions = [];
        $duplicateCount = 0;
        foreach ($catalog['studies'] as $study) {
            if (! is_array($study)) {
                throw new RuntimeException('The import catalog has an invalid study entry.');
            }

            $this->validateStudy($study);
            $title = $study['title'];
            $canonicalFilename = $study['source_filename'];
            if (isset($titles[$title]) || isset($declaredFilenames[$canonicalFilename])) {
                throw new RuntimeException('The import catalog must contain distinct studies.');
            }
            $titles[$title] = true;
            $declaredFilenames[$canonicalFilename] = $study['source_sha256'];

            $category = $study['category'];
            $categoryKey = $category['slug'];
            if (isset($categoryDefinitions[$categoryKey]) && $categoryDefinitions[$categoryKey] !== $category) {
                throw new RuntimeException('The import catalog has conflicting category data.');
            }
            $categoryDefinitions[$categoryKey] = $category;

            foreach ($study['duplicate_filenames'] ?? [] as $duplicateFilename) {
                if (isset($declaredFilenames[$duplicateFilename])) {
                    throw new RuntimeException('The import catalog has duplicate source declarations.');
                }
                $declaredFilenames[$duplicateFilename] = $study['source_sha256'];
                $duplicateCount++;
            }

            $studies[] = $study;
        }

        foreach ($studies as $study) {
            $canonicalPath = $this->sourceFilePath($source, $study['source_filename']);
            $this->verifyHash($canonicalPath, $study['source_sha256']);
            $this->verifyDocx($canonicalPath);
            foreach ($study['duplicate_filenames'] ?? [] as $duplicateFilename) {
                $duplicatePath = $this->sourceFilePath($source, $duplicateFilename);
                $this->verifyHash($duplicatePath, $study['source_sha256']);
                $this->verifyDocx($duplicatePath);
            }
        }

        foreach ($studies as &$study) {
            $study['source_path'] = $this->sourceFilePath($source, $study['source_filename']);
        }
        unset($study);

        $sourceFilenames = [];
        foreach (new \DirectoryIterator($source) as $file) {
            if ($file->isLink() && strtolower($file->getExtension()) === 'docx') {
                throw new RuntimeException('The import source DOCX files must not be symbolic links.');
            }
            if ($file->isFile() && strtolower($file->getExtension()) === 'docx') {
                $sourceFilenames[] = $file->getFilename();
            }
        }
        sort($sourceFilenames, SORT_STRING);
        $declared = array_keys($declaredFilenames);
        sort($declared, SORT_STRING);
        if ($sourceFilenames !== $declared) {
            throw new RuntimeException('The import source contains an unlisted or missing DOCX file.');
        }

        return ['studies' => $studies, 'duplicate_count' => $duplicateCount];
    }

    /** @param array<string, mixed> $study */
    private function validateStudy(array $study): void
    {
        foreach (['source_filename', 'source_sha256', 'title', 'institution_name', 'institution_location', 'academic_unit', 'degree_program', 'manuscript_date_label', 'abstract_provenance', 'abstract', 'research_stage'] as $field) {
            if (! isset($study[$field]) || ! is_string($study[$field]) || trim($study[$field]) === '') {
                throw new RuntimeException('The import catalog is missing required study metadata.');
            }
        }
        foreach (['source_filename' => 500, 'title' => 500, 'institution_name' => 255, 'institution_location' => 255, 'academic_unit' => 255, 'degree_program' => 255, 'manuscript_date_label' => 50, 'abstract_provenance' => 255] as $field => $limit) {
            if (mb_strlen($study[$field]) > $limit) {
                throw new RuntimeException('The import catalog contains oversized study metadata.');
            }
        }
        if (! preg_match('/^[a-f0-9]{64}$/', $study['source_sha256']) || basename($study['source_filename']) !== $study['source_filename'] || strtolower(pathinfo($study['source_filename'], PATHINFO_EXTENSION)) !== 'docx') {
            throw new RuntimeException('The import catalog has an invalid source declaration.');
        }
        if (! is_int($study['publication_year'] ?? null) || $study['publication_year'] < 1900 || $study['publication_year'] > 2100) {
            throw new RuntimeException('The import catalog has an invalid publication year.');
        }
        if (! in_array($study['research_stage'], ResearchDocument::RESEARCH_STAGES, true)) {
            throw new RuntimeException('The import catalog has an unsupported research stage.');
        }
        if (! isset($study['authors']) || ! is_array($study['authors']) || $study['authors'] === []) {
            throw new RuntimeException('The import catalog must provide ordered authors.');
        }
        foreach ($study['authors'] as $author) {
            if (! is_string($author) || trim($author) === '') {
                throw new RuntimeException('The import catalog must provide ordered authors.');
            }
        }
        if (count(array_unique($study['authors'], SORT_STRING)) !== count($study['authors'])) {
            throw new RuntimeException('The import catalog must provide distinct ordered authors.');
        }
        if (! isset($study['keywords']) || ! is_array($study['keywords']) || $study['keywords'] === []) {
            throw new RuntimeException('The import catalog must provide keywords.');
        }
        foreach ($study['keywords'] as $keyword) {
            if (! is_string($keyword) || trim($keyword) === '') {
                throw new RuntimeException('The import catalog must provide keywords.');
            }
        }
        $wordCount = count(preg_split('/\s+/u', trim($study['abstract']), -1, PREG_SPLIT_NO_EMPTY));
        if ($wordCount < 100 || $wordCount > 220) {
            throw new RuntimeException('The import catalog abstract must contain 100 to 220 words.');
        }

        $this->validateCategory($study['category'] ?? null);
        if (isset($study['duplicate_filenames'])) {
            if (! is_array($study['duplicate_filenames'])) {
                throw new RuntimeException('The import catalog has an invalid duplicate declaration.');
            }
            foreach ($study['duplicate_filenames'] as $filename) {
                if (! is_string($filename) || basename($filename) !== $filename || strtolower(pathinfo($filename, PATHINFO_EXTENSION)) !== 'docx') {
                    throw new RuntimeException('The import catalog has an invalid duplicate declaration.');
                }
            }
        }
    }

    private function validateCategory(mixed $category): void
    {
        if (! is_array($category) || ! isset($category['name'], $category['slug'], $category['description']) || ! is_string($category['name']) || ! is_string($category['slug']) || ! is_string($category['description']) || trim($category['name']) === '' || trim($category['description']) === '' || mb_strlen($category['name']) > 150 || mb_strlen($category['slug']) > 255 || ! preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $category['slug'])) {
            throw new RuntimeException('The import catalog has invalid category data.');
        }
    }

    private function sourceFilePath(string $source, string $filename): string
    {
        $path = $source.DIRECTORY_SEPARATOR.$filename;
        if (is_link($path)) {
            throw new RuntimeException('The import source DOCX files must not be symbolic links.');
        }
        if (! is_file($path) || ! is_readable($path)) {
            throw new RuntimeException('The import source has a missing DOCX file.');
        }
        $path = $this->canonicalSourcePath($source, $path);

        return $path;
    }

    private function canonicalSourcePath(string $source, string $path): string
    {
        $canonicalPath = realpath($path) ?: '';
        $sourcePrefix = rtrim($source, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;
        if ($canonicalPath === '' || ! str_starts_with($canonicalPath, $sourcePrefix)) {
            throw new RuntimeException('The import source path is outside the source directory.');
        }

        return $canonicalPath;
    }

    private function verifyHash(string $path, string $expectedHash): void
    {
        if (! hash_equals($expectedHash, hash_file('sha256', $path))) {
            throw new RuntimeException('The import source DOCX checksum does not match the catalog.');
        }
    }

    private function verifyDocx(string $path): void
    {
        $archive = new \ZipArchive;
        if ($archive->open($path) !== true) {
            throw new RuntimeException('The import source DOCX is not a valid OOXML document.');
        }

        try {
            $contentTypes = $this->loadOoxmlXml($archive, '[Content_Types].xml');
            $relationships = $this->loadOoxmlXml($archive, '_rels/.rels');
            $document = $this->loadOoxmlXml($archive, 'word/document.xml');

            if (! $this->hasMainDocumentContentType($contentTypes) || ! $this->hasOfficeDocumentRelationship($relationships) || $document->documentElement?->namespaceURI !== self::WORDPROCESSINGML_NAMESPACE || $document->documentElement->localName !== 'document') {
                throw new RuntimeException('The import source DOCX is not a valid OOXML document.');
            }
        } finally {
            $archive->close();
        }
    }

    private function loadOoxmlXml(\ZipArchive $archive, string $entry): \DOMDocument
    {
        $xml = $archive->getFromName($entry);
        if (! is_string($xml)) {
            throw new RuntimeException('The import source DOCX is not a valid OOXML document.');
        }

        $previousErrors = libxml_use_internal_errors(true);
        libxml_clear_errors();

        try {
            $document = new \DOMDocument;
            if (! $document->loadXML($xml, LIBXML_NONET) || libxml_get_errors() !== []) {
                throw new RuntimeException('The import source DOCX is not a valid OOXML document.');
            }

            return $document;
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previousErrors);
        }
    }

    private function hasMainDocumentContentType(\DOMDocument $contentTypes): bool
    {
        if ($contentTypes->documentElement?->namespaceURI !== self::CONTENT_TYPES_NAMESPACE || $contentTypes->documentElement->localName !== 'Types') {
            return false;
        }

        foreach ($contentTypes->getElementsByTagNameNS(self::CONTENT_TYPES_NAMESPACE, 'Override') as $override) {
            if ($override->getAttribute('PartName') === '/word/document.xml' && $override->getAttribute('ContentType') === self::WORD_MAIN_DOCUMENT_MIME) {
                return true;
            }
        }

        return false;
    }

    private function hasOfficeDocumentRelationship(\DOMDocument $relationships): bool
    {
        if ($relationships->documentElement?->namespaceURI !== self::RELATIONSHIPS_NAMESPACE || $relationships->documentElement->localName !== 'Relationships') {
            return false;
        }

        foreach ($relationships->getElementsByTagNameNS(self::RELATIONSHIPS_NAMESPACE, 'Relationship') as $relationship) {
            if ($relationship->getAttribute('Type') === self::OFFICE_DOCUMENT_RELATIONSHIP && $relationship->getAttribute('Target') === 'word/document.xml' && in_array($relationship->getAttribute('TargetMode'), ['', 'Internal'], true)) {
                return true;
            }
        }

        return false;
    }

    /** @param array<string, string> $categoryData */
    private function upsertCategory(array $categoryData): Category
    {
        $category = Category::withTrashed()->where('slug', $categoryData['slug'])->lockForUpdate()->first();
        if ($category === null) {
            return Category::query()->create($categoryData + ['is_active' => true]);
        }

        if ($category->trashed()) {
            $category->restore();
        }
        $category->fill($categoryData + ['is_active' => true])->save();

        return $category;
    }

    private function findDocument(string $sourceSha256): ?ResearchDocument
    {
        return ResearchDocument::query()->where('import_source_sha256', $sourceSha256)->lockForUpdate()->first();
    }

    private function hasTitleCollision(string $title, string $normalizedTitle, ?int $matchedDocumentId): bool
    {
        return ResearchDocument::withTrashed()
            ->where(function ($query) use ($title, $normalizedTitle): void {
                $query->where('title', $title)->orWhere('normalized_title', $normalizedTitle);
            })
            ->when($matchedDocumentId !== null, fn ($query) => $query->whereKeyNot($matchedDocumentId))
            ->lockForUpdate()
            ->exists();
    }

    /** @param array<int, string> $authors */
    private function replaceAuthors(ResearchDocument $document, array $authors): void
    {
        $document->authors()->delete();
        foreach (array_values($authors) as $index => $author) {
            ResearchAuthor::query()->create([
                'research_document_id' => $document->id,
                'user_id' => null,
                'author_name' => $author,
                'author_order' => $index + 1,
                'is_corresponding_author' => false,
            ]);
        }
    }

    /** @param array<string, mixed> $study @param array<int, string> $newStoragePaths */
    private function storeCanonicalFile(ResearchDocument $document, User $owner, array $study, array &$newStoragePaths): void
    {
        $storedFilename = $study['source_sha256'].'.docx';
        $path = 'research/'.$document->id.'/'.$storedFilename;
        $size = filesize($study['source_path']);
        if ($size === false) {
            throw new RuntimeException('The import source DOCX size is unavailable.');
        }
        $this->storeIfNeeded($study['source_path'], $path, $study['source_sha256'], $size, $newStoragePaths);

        $documentType = $study['research_stage'] === 'title_proposal' ? 'title_proposal' : 'draft';
        DocumentFile::query()->where('research_document_id', $document->id)->where('document_type', $documentType)->where('version_number', '!=', 1)->where('is_current', true)->update(['is_current' => false]);
        $file = DocumentFile::query()->firstOrNew([
            'research_document_id' => $document->id,
            'document_type' => $documentType,
            'version_number' => 1,
        ]);
        $file->fill([
            'uploaded_by' => $owner->id,
            'original_filename' => $study['source_filename'],
            'stored_filename' => $storedFilename,
            'file_path' => $path,
            'file_extension' => 'docx',
            'mime_type' => self::DOCX_MIME,
            'file_size' => $size,
            'is_current' => true,
            'uploaded_at' => $file->uploaded_at ?? now(),
        ])->save();
    }

    /** @param array<int, string> $newStoragePaths */
    private function storeIfNeeded(string $sourcePath, string $path, string $hash, int $size, array &$newStoragePaths): void
    {
        $disk = Storage::disk('researchnav_private');
        $alreadyExists = $disk->exists($path);
        if ($alreadyExists && $disk->size($path) === $size && hash_equals($hash, $this->storageHash($path))) {
            return;
        }

        $stream = fopen($sourcePath, 'rb');
        if ($stream === false) {
            throw new RuntimeException('The import source DOCX cannot be read.');
        }
        try {
            $disk->put($path, $stream);
        } finally {
            fclose($stream);
        }
        if (! $alreadyExists) {
            $newStoragePaths[] = $path;
        }
        if ($disk->size($path) !== $size || ! hash_equals($hash, $this->storageHash($path))) {
            throw new RuntimeException('The private DOCX copy could not be verified.');
        }
    }

    private function storageHash(string $path): string
    {
        $stream = Storage::disk('researchnav_private')->readStream($path);
        if (! is_resource($stream)) {
            throw new RuntimeException('The private DOCX copy cannot be read.');
        }

        $context = hash_init('sha256');
        try {
            while (! feof($stream)) {
                $chunk = fread($stream, 8192);
                if ($chunk === false) {
                    throw new RuntimeException('The private DOCX copy cannot be read.');
                }
                hash_update($context, $chunk);
            }
        } finally {
            fclose($stream);
        }

        return hash_final($context);
    }

    private function createImportLogs(ResearchDocument $document, User $owner): void
    {
        MonitoringLog::query()->firstOrCreate([
            'research_document_id' => $document->id,
            'activity_type' => 'RESEARCH_IMPORTED',
        ], [
            'performed_by' => $owner->id,
            'remarks' => 'Imported frozen research study.',
            'previous_status' => null,
            'new_status' => 'archived',
            'monitoring_status' => 'archived',
            'activity_date' => now(),
        ]);
        AuditLog::query()->firstOrCreate([
            'action' => 'RESEARCH_IMPORTED',
            'entity_type' => ResearchDocument::class,
            'entity_id' => (string) $document->id,
        ], [
            'user_id' => $owner->id,
            'description' => 'Imported frozen research study.',
            'ip_address' => null,
            'user_agent' => null,
        ]);
    }

    private function normalizedTitle(string $title): string
    {
        return str($title)->lower()->replaceMatches('/[^a-z0-9]+/', ' ')->trim()->toString();
    }
}
