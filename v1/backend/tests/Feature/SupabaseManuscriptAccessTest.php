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

    /** @return array{ResearchDocument, DocumentFile} */
    private function localManuscript(array $overrides = []): array
    {
        $owner = User::factory()->create(['access_status' => 'active']);
        $document = ResearchDocument::factory()->create(array_merge([
            'submitted_by' => $owner->id,
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'import_source_sha256' => str_repeat('a', 64),
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
