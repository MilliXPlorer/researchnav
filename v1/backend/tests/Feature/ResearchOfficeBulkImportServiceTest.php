<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\MonitoringLog;
use App\Models\User;
use App\Services\AuditService;
use App\Services\MonitoringService;
use App\Services\ResearchOfficeBulkImportService;
use App\Services\SupabaseStorageException;
use App\Services\SupabaseStorageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ResearchOfficeBulkImportServiceTest extends TestCase
{
    use RefreshDatabase;

    private array $metadata = [
        'title' => 'Safe: Research / Title',
        'researchers' => ['Researcher One', 'Researcher Two'],
        'abstract' => 'Reviewed database abstract.',
        'keywords' => ['database', 'metadata'],
        'year' => 2026,
        'final_binding_date' => 'May 2026',
        'institute' => 'Institute of Computer Studies',
    ];

    public function test_path_creation_preserves_words_and_removes_unsafe_characters(): void
    {
        $service = $this->service($this->createStub(SupabaseStorageService::class));

        $this->assertSame(
            'Institute of Computer Studies/2026/Safe Research Title/Original File.pdf',
            $service->objectPath('Institute of Computer Studies', 2026, 'Safe: Research / Title', '../Original? File.pdf'),
        );
    }

    public function test_path_creation_normalizes_unicode_punctuation_without_changing_database_metadata(): void
    {
        $service = $this->service($this->createStub(SupabaseStorageService::class));

        $this->assertSame(
            'Institute of Computer Studies/2025/TECH4LIFE A BLOOD DONATION SYSTEM - TANGUB CITY/manuscript.pdf',
            $service->objectPath(
                'Institute of Computer Studies',
                2025,
                'TECH4LIFE: A BLOOD DONATION SYSTEM — TANGUB CITY',
                'manuscript.pdf',
            ),
        );
    }

    public function test_upload_failure_creates_no_database_records(): void
    {
        $storage = $this->createMock(SupabaseStorageService::class);
        $storage->method('exists')->willReturn(false);
        $storage->method('upload')->willThrowException(new SupabaseStorageException('failed'));

        try {
            $this->service($storage)->import(User::factory()->create(), UploadedFile::fake()->createWithContent('study.pdf', '%PDF-test'), $this->metadata);
        } catch (SupabaseStorageException) {
        }

        $this->assertDatabaseCount('research_documents', 0);
        $this->assertDatabaseCount('document_files', 0);
    }

    public function test_reviewed_metadata_and_object_path_are_persisted(): void
    {
        $storage = $this->createMock(SupabaseStorageService::class);
        $storage->expects($this->once())->method('exists')->willReturn(false);
        $storage->expects($this->once())->method('upload');

        $document = $this->service($storage)->import(User::factory()->create(), UploadedFile::fake()->createWithContent('study.pdf', '%PDF-test'), $this->metadata);

        $this->assertSame('archived', $document->submission_status);
        $this->assertSame('archived', $document->archive_status);
        $this->assertSame('public', $document->visibility);
        $this->assertDatabaseHas('research_documents', [
            'id' => $document->id,
            'title' => 'Safe: Research / Title',
            'abstract' => 'Reviewed database abstract.',
            'keywords' => 'database, metadata',
            'publication_year' => 2026,
            'institution_name' => 'Institute of Computer Studies',
            'manuscript_date_label' => 'May 2026',
        ]);
        $this->assertDatabaseHas('research_authors', ['research_document_id' => $document->id, 'author_name' => 'Researcher Two', 'author_order' => 2]);
        $this->assertDatabaseHas('document_files', [
            'research_document_id' => $document->id,
            'document_type' => 'final_manuscript',
            'file_path' => 'Institute of Computer Studies/2026/Safe Research Title/study.pdf',
        ]);
    }

    public function test_imported_metadata_is_immediately_available_in_the_public_repository(): void
    {
        $storage = $this->createMock(SupabaseStorageService::class);
        $storage->method('exists')->willReturn(false);
        $storage->expects($this->once())->method('upload');

        $document = $this->service($storage)->import(
            User::factory()->create(),
            UploadedFile::fake()->createWithContent('study.pdf', '%PDF-test'),
            $this->metadata,
        );

        $this->getJson('/api/repository/'.$document->id)
            ->assertOk()
            ->assertJsonPath('data.title', 'Safe: Research / Title')
            ->assertJsonPath('data.abstract', 'Reviewed database abstract.')
            ->assertJsonPath('data.keywords', 'database, metadata')
            ->assertJsonPath('data.publication_year', 2026)
            ->assertJsonPath('data.institution_name', 'Institute of Computer Studies')
            ->assertJsonPath('data.authors.1.author_name', 'Researcher Two');
    }

    public function test_database_failure_attempts_uploaded_object_cleanup(): void
    {
        $storage = $this->createMock(SupabaseStorageService::class);
        $storage->method('exists')->willReturn(false);
        $storage->expects($this->once())->method('upload');
        $storage->expects($this->once())->method('delete');
        $audit = $this->createMock(AuditService::class);
        $audit->method('log')->willThrowException(new \RuntimeException('database failure'));

        try {
            $this->service($storage, $audit)->import(User::factory()->create(), UploadedFile::fake()->createWithContent('study.pdf', '%PDF-test'), $this->metadata);
        } catch (\RuntimeException) {
        }

        $this->assertDatabaseCount('research_documents', 0);
        $this->assertDatabaseCount('document_files', 0);
    }

    private function service(SupabaseStorageService $storage, ?AuditService $audit = null): ResearchOfficeBulkImportService
    {
        if ($audit === null) {
            $audit = $this->createMock(AuditService::class);
            $audit->method('log')->willReturn(new AuditLog);
        }
        $monitoring = $this->createMock(MonitoringService::class);
        $monitoring->method('log')->willReturn(new MonitoringLog);

        return new ResearchOfficeBulkImportService($storage, $audit, $monitoring);
    }
}
