<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\DocumentFile;
use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\AuditService;
use App\Services\ManuscriptSearchProjectionService;
use App\Services\MonitoringService;
use App\Services\ResearchOfficeBulkImportService;
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
        $service = $this->service();

        $this->assertSame(
            'Institute of Computer Studies/2026/Safe Research Title/Original File.pdf',
            $service->objectPath('Institute of Computer Studies', 2026, 'Safe: Research / Title', '../Original? File.pdf'),
        );
    }

    public function test_path_creation_normalizes_unicode_punctuation_without_changing_database_metadata(): void
    {
        $service = $this->service();

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

    public function test_reviewed_metadata_and_object_path_are_persisted(): void
    {
        $document = $this->service()->import(User::factory()->create(), UploadedFile::fake()->createWithContent('study.pdf', '%PDF-test'), $this->metadata);

        $this->assertSame('archived', $document->submission_status);
        $this->assertSame('archived', $document->archive_status);
        $this->assertSame('public', $document->visibility);
        $this->assertDatabaseHas('research_documents', [
            'id' => $document->id,
            'title' => 'Safe: Research / Title',
            'abstract' => 'Reviewed database abstract.',
            'keywords' => 'database, metadata',
            'publication_year' => 2026,
            'institute' => 'Institute of Computer Studies',
            'manuscript_date_label' => 'May 2026',
        ]);
        $this->assertDatabaseHas('research_authors', ['research_document_id' => $document->id, 'author_name' => 'Researcher Two', 'author_order' => 2]);
        $this->assertDatabaseHas('document_files', [
            'research_document_id' => $document->id,
            'document_type' => 'final_manuscript',
        ]);
        $file = DocumentFile::where('research_document_id', $document->id)->first();
        $this->assertStringStartsWith('Institute of Computer Studies/2026/Safe Research Title/study', $file->file_path);
    }

    public function test_reviewed_year_is_not_overridden_by_final_binding_date(): void
    {
        $document = $this->service()->import(
            User::factory()->create(),
            UploadedFile::fake()->createWithContent('study.pdf', '%PDF-test'),
            [...$this->metadata, 'year' => 2018, 'final_binding_date' => 'March 2019'],
        );

        $this->assertSame(2018, $document->publication_year);
        $this->assertSame('March 2019', $document->manuscript_date_label);
    }

    public function test_imported_metadata_is_immediately_available_in_the_public_repository(): void
    {
        $document = $this->service()->import(
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
            ->assertJsonPath('data.institute', 'Institute of Computer Studies')
            ->assertJsonPath('data.authors.1.author_name', 'Researcher Two');
    }

    public function test_folder_files_create_one_ordered_grouped_research_document(): void
    {
        $document = $this->service()->import(User::factory()->create(), [
            UploadedFile::fake()->createWithContent('appendix.pdf', '%PDF-appendix'),
            UploadedFile::fake()->createWithContent('Manuscript.pdf', '%PDF-body'),
            UploadedFile::fake()->createWithContent('Front Matter.pdf', '%PDF-front'),
        ], $this->metadata, null, ['Study A/appendix.pdf', 'Study A/Manuscript.pdf', 'Study A/Front Matter.pdf']);

        $this->assertDatabaseCount('research_documents', 1);
        $this->assertSame('Study A', $document->import_group_name);
        $this->assertSame(
            ['Front Matter.pdf', 'Manuscript.pdf', 'appendix.pdf'],
            $document->files->sortBy('file_order')->pluck('original_filename')->all(),
        );
        $this->assertTrue($document->files->every(fn ($file) => strlen($file->content_sha256) === 64));
    }

    public function test_duplicate_title_is_rejected_before_upload(): void
    {
        ResearchDocument::factory()->create([
            'title' => $this->metadata['title'],
            'normalized_title' => 'safe research title',
        ]);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('A research record with this title already exists.');
        $this->service()->import(
            User::factory()->create(),
            UploadedFile::fake()->createWithContent('study.pdf', '%PDF-test'),
            $this->metadata,
        );
    }

    public function test_database_failure_attempts_uploaded_object_cleanup(): void
    {
        $audit = $this->createMock(AuditService::class);
        $audit->method('log')->willThrowException(new \RuntimeException('database failure'));

        try {
            $this->service($audit)->import(User::factory()->create(), UploadedFile::fake()->createWithContent('study.pdf', '%PDF-test'), $this->metadata);
        } catch (\RuntimeException) {
        }

        $this->assertDatabaseCount('research_documents', 0);
        $this->assertDatabaseCount('document_files', 0);
    }

    private function service(?AuditService $audit = null): ResearchOfficeBulkImportService
    {
        if ($audit === null) {
            $audit = $this->createMock(AuditService::class);
            $audit->method('log')->willReturn(new AuditLog);
        }
        $monitoring = $this->createMock(MonitoringService::class);
        $monitoring->method('log')->willReturn(new MonitoringLog);
        $manuscriptSearch = $this->createMock(ManuscriptSearchProjectionService::class);
        $manuscriptSearch->method('reindex')->willReturn('indexed');

        return new ResearchOfficeBulkImportService($audit, $monitoring, $manuscriptSearch);
    }
}
