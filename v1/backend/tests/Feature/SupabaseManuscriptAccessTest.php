<?php

namespace Tests\Feature;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class SupabaseManuscriptAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_authorized_catalog_download_serves_from_local_storage(): void
    {
        [$document] = $this->localManuscript();
        $viewer = User::factory()->create(['access_status' => 'active']);

        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/repository/'.$document->id.'/download')
            ->assertOk()
            ->assertSee('manuscript.pdf')
            ->assertSee('Download all manuscripts (.zip)')
            ->assertHeaderMissing('Location');
    }

    public function test_unauthorized_user_cannot_download(): void
    {
        [$document, $file] = $this->localManuscript(['visibility' => 'private']);
        $viewer = User::factory()->create(['access_status' => 'active']);

        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/research/'.$document->id.'/files/'.$file->id.'/download')
            ->assertForbidden();
    }

    public function test_catalog_chooser_returns_not_found_when_the_private_file_is_missing(): void
    {
        [$document, $file] = $this->localManuscript();
        Storage::disk('researchnav_private')->delete($file->file_path);
        $viewer = User::factory()->create(['access_status' => 'active']);

        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/repository/'.$document->id.'/download')
            ->assertNotFound();
    }

    public function test_grouped_catalog_download_is_a_zip_named_for_the_folder(): void
    {
        [$document, $file] = $this->localManuscript(['import_group_name' => 'Study A']);
        $secondStoredFilename = Str::uuid()->toString().'.pdf';
        DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $file->uploaded_by,
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'Manuscript.pdf',
            'stored_filename' => $secondStoredFilename,
            'file_path' => 'research/'.$document->id.'/'.$secondStoredFilename,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 12,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);

        $disk = Storage::disk('researchnav_private');
        $disk->put('research/'.$document->id.'/'.$secondStoredFilename, '%PDF-1.4 second');

        $viewer = User::factory()->create(['access_status' => 'active']);

        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/repository/'.$document->id.'/download?all=1')
            ->assertOk()
            ->assertDownload('Study A.zip')
            ->assertHeader('content-type', 'application/zip');
    }

    public function test_grouped_catalog_archive_sanitizes_entries_suffixes_duplicates_and_cleans_up(): void
    {
        [$document, $file] = $this->localManuscript(['import_group_name' => '../Study/..']);
        $file->update(['original_filename' => '../../Report.pdf']);
        $secondStoredFilename = Str::uuid()->toString().'.pdf';
        DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $file->uploaded_by,
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'report.pdf',
            'stored_filename' => $secondStoredFilename,
            'file_path' => 'research/'.$document->id.'/'.$secondStoredFilename,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 12,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);
        Storage::disk('researchnav_private')->put('research/'.$document->id.'/'.$secondStoredFilename, '%PDF-1.4 second');
        $viewer = User::factory()->create(['access_status' => 'active']);

        $response = $this->withSession(['user_id' => $viewer->id])
            ->get('/api/repository/'.$document->id.'/download?all=1')
            ->assertOk()
            ->assertDownload('Study.zip');
        $path = $response->baseResponse->getFile()->getPathname();
        $archive = new \ZipArchive;
        $this->assertTrue($archive->open($path) === true);
        $entries = [];
        for ($index = 0; $index < $archive->numFiles; $index++) {
            $entries[] = $archive->getNameIndex($index);
        }
        $this->assertTrue($archive->close());
        $this->assertSame(['Study/Report.pdf', 'Study/report (2).pdf'], $entries);
        foreach ($entries as $entry) {
            $this->assertStringNotContainsString('..', $entry);
            $this->assertStringNotContainsString('\\', $entry);
            $this->assertFalse((bool) preg_match('/^(?:\/|[A-Za-z]:)/', $entry));
        }

        ob_start();
        $response->baseResponse->sendContent();
        ob_end_clean();
        $this->assertFileDoesNotExist($path);
    }

    public function test_grouped_catalog_download_rejects_foreign_selected_files_and_coordinator_foreign_documents(): void
    {
        [$document] = $this->localManuscript(['institute' => 'Institute of Computer Studies']);
        [$foreignDocument, $foreignFile] = $this->localManuscript(['institute' => 'Institute of Health Sciences']);
        $viewer = User::factory()->create(['access_status' => 'active']);
        $coordinator = User::factory()->create([
            'access_status' => 'active',
            'role' => 'coordinator',
            'institute' => 'Institute of Computer Studies',
        ]);

        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/repository/'.$document->id.'/download?file='.$foreignFile->id)
            ->assertNotFound();
        $this->withSession(['user_id' => $coordinator->id])
            ->get('/api/coordinator/repository/'.$foreignDocument->id.'/download?all=1')
            ->assertNotFound();
    }

    public function test_grouped_catalog_download_enforces_file_count_and_aggregate_source_size_limits(): void
    {
        [$document, $file] = $this->localManuscript();
        $secondStoredFilename = Str::uuid()->toString().'.pdf';
        DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $file->uploaded_by,
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'second.pdf',
            'stored_filename' => $secondStoredFilename,
            'file_path' => 'research/'.$document->id.'/'.$secondStoredFilename,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 12,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);
        Storage::disk('researchnav_private')->put('research/'.$document->id.'/'.$secondStoredFilename, '%PDF-1.4 second');
        $viewer = User::factory()->create(['access_status' => 'active']);

        config()->set('researchnav.grouped_downloads.maximum_files', 1);
        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/repository/'.$document->id.'/download?all=1')
            ->assertStatus(503)
            ->assertExactJson(['error' => 'MANUSCRIPT_ARCHIVE_UNAVAILABLE']);

        config()->set('researchnav.grouped_downloads.maximum_files', 100);
        config()->set('researchnav.grouped_downloads.maximum_source_bytes', 1);
        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/repository/'.$document->id.'/download?all=1')
            ->assertStatus(503)
            ->assertExactJson(['error' => 'MANUSCRIPT_ARCHIVE_UNAVAILABLE']);
    }

    /** @return array{ResearchDocument, DocumentFile} */
    private function localManuscript(array $overrides = []): array
    {
        $owner = User::factory()->create(['access_status' => 'active']);
        $document = ResearchDocument::factory()->create(array_merge([
            'submitted_by' => $owner->id,
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'import_source_sha256' => hash('sha256', (string) Str::uuid()),
        ], $overrides));
        $storedFilename = Str::uuid()->toString().'.pdf';
        $file = DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'manuscript.pdf',
            'stored_filename' => $storedFilename,
            'file_path' => 'research/'.$document->id.'/'.$storedFilename,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 100,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);

        $disk = Storage::disk('researchnav_private');
        $disk->put('research/'.$document->id.'/'.$storedFilename, '%PDF-1.4 test content here');

        return [$document, $file];
    }
}
