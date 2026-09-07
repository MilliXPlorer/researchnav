<?php

namespace Tests\Feature;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SupabaseManuscriptAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('supabase', [
            'url' => 'https://project.supabase.co',
            'secret_key' => 'sb_secret_test',
            'storage_bucket' => 'research-manuscripts',
        ]);
    }

    public function test_authorized_catalog_download_is_proxied_without_exposing_supabase(): void
    {
        Http::fake(['*' => Http::response('%PDF-private', 200)]);
        [$document] = $this->publicManuscript();
        $viewer = User::factory()->create(['access_status' => 'active']);

        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/repository/'.$document->id.'/download')
            ->assertOk()
            ->assertDownload('manuscript.pdf')
            ->assertHeaderMissing('Location');

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && ! str_contains($request->url(), '/object/sign/'));
    }

    public function test_unauthorized_user_never_receives_a_signed_url(): void
    {
        Http::fake(['*' => Http::response(['signedURL' => '/object/sign/research-manuscripts/file?token=test'], 200)]);
        [$document, $file] = $this->publicManuscript(['visibility' => 'private']);
        $viewer = User::factory()->create(['access_status' => 'active']);

        $this->withSession(['user_id' => $viewer->id])
            ->get('/api/research/'.$document->id.'/files/'.$file->id.'/download')
            ->assertForbidden();

        Http::assertNothingSent();
    }

    /** @return array{ResearchDocument, DocumentFile} */
    private function publicManuscript(array $overrides = []): array
    {
        $owner = User::factory()->create(['access_status' => 'active']);
        $document = ResearchDocument::factory()->create(array_merge([
            'submitted_by' => $owner->id,
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'import_source_sha256' => str_repeat('a', 64),
        ], $overrides));
        $file = DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'manuscript.pdf',
            'stored_filename' => 'manuscript.pdf',
            'file_path' => 'Institute of Computer Studies/2026/Research Title/manuscript.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 100,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);

        return [$document, $file];
    }
}
