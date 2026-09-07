<?php

namespace Tests\Feature;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Policies\ResearchDocumentPolicy;
use App\Services\ResearchService;
use App\Services\SupabaseStorageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ImportedResearchCrudTest extends TestCase
{
    use RefreshDatabase;

    public function test_office_can_update_authors_and_delete_an_imported_public_record(): void
    {
        $office = User::factory()->create(['role' => 'research-office', 'access_status' => 'active']);
        $document = ResearchDocument::factory()->create([
            'submitted_by' => $office->id,
            'title' => 'Imported title',
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'import_source_sha256' => str_repeat('a', 64),
        ]);
        DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $office->id,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'manuscript.pdf',
            'stored_filename' => 'manuscript.pdf',
            'file_path' => 'Institute of Computer Studies/2026/Imported title/manuscript.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 100,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);

        $storage = $this->createMock(SupabaseStorageService::class);
        $storage->method('isSupabasePath')->willReturn(true);
        $storage->expects($this->once())->method('delete');
        $this->app->instance(SupabaseStorageService::class, $storage);

        $service = $this->app->make(ResearchService::class);
        $updated = $service->update($office, $document, ['title' => 'Updated imported title'], [[
            'user_id' => null,
            'author_name' => 'Updated Author',
            'is_corresponding_author' => false,
        ]]);

        $this->assertSame('public', $updated->visibility);
        $this->assertSame('Updated Author', $updated->authors->first()->author_name);

        $service->deleteImported($office, $updated);

        $this->assertSoftDeleted('research_documents', ['id' => $document->id]);
        $this->assertDatabaseMissing('document_files', ['research_document_id' => $document->id]);
        $this->getJson('/api/repository/'.$document->id)->assertNotFound();
    }

    public function test_non_imported_archived_records_do_not_gain_crud_permissions(): void
    {
        $office = User::factory()->create(['role' => 'research-office', 'access_status' => 'active']);
        $document = ResearchDocument::factory()->create([
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'import_source_sha256' => null,
        ]);

        $this->assertFalse((new ResearchDocumentPolicy)->update($office, $document));
        $this->assertFalse((new ResearchDocumentPolicy)->delete($office, $document));
    }

    public function test_legacy_import_can_be_archived_without_a_local_manuscript_projection(): void
    {
        $office = User::factory()->create(['role' => 'research-office', 'access_status' => 'active']);
        $document = ResearchDocument::factory()->create([
            'submitted_by' => $office->id,
            'submission_status' => 'approved',
            'archive_status' => 'pending_archiving',
            'visibility' => 'private',
            'import_source_sha256' => str_repeat('b', 64),
        ]);

        $archived = $this->app->make(ResearchService::class)->archive($office, $document, 'public');

        $this->assertSame('archived', $archived->submission_status);
        $this->assertSame('archived', $archived->archive_status);
        $this->assertSame('public', $archived->visibility);
    }
}
