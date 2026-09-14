<?php

namespace Tests\Unit;

use App\Services\SupabaseStorageService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SupabaseStorageServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config()->set('supabase', [
            'url' => 'https://project.supabase.co',
            'secret_key' => 'sb_secret_test',
            'storage_bucket' => 'research-manuscripts',
        ]);
    }

    public function test_upload_uses_private_storage_api_without_upsert(): void
    {
        Http::fake(['*' => Http::response([], 200)]);

        (new SupabaseStorageService)->upload('Institute of Computer Studies/2026/Title/File.pdf', 'pdf', 'application/pdf');

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), '/storage/v1/object/research-manuscripts/Institute%20of%20Computer%20Studies/2026/Title/File.pdf')
            && $request->hasHeader('apikey', 'sb_secret_test')
            && ! $request->hasHeader('Authorization')
            && $request->hasHeader('x-upsert', 'false'));
    }

    public function test_signed_url_is_created_for_five_minutes(): void
    {
        Http::fake(['*' => Http::response(['signedURL' => '/object/sign/research-manuscripts/path?token=test'], 200)]);

        $url = (new SupabaseStorageService)->signedUrl('Institute of Arts and Sciences/2026/Title/File.docx');

        $this->assertSame('https://project.supabase.co/storage/v1/object/sign/research-manuscripts/path?token=test', $url);
        Http::assertSent(fn ($request) => $request->data() === ['expiresIn' => 300]);
    }

    public function test_missing_object_head_response_is_not_treated_as_an_outage(): void
    {
        Http::fake(['*' => Http::response([], 400)]);

        $this->assertFalse((new SupabaseStorageService)->exists('Institute of Arts and Sciences/2026/Title/missing.pdf'));
    }

    public function test_private_manuscript_can_be_downloaded_for_server_side_processing(): void
    {
        Http::fake(['*' => Http::response('%PDF-private-manuscript', 200)]);

        $contents = (new SupabaseStorageService)->download('Institute of Computer Studies/2026/Title/manuscript.pdf');

        $this->assertSame('%PDF-private-manuscript', $contents);
        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && $request->hasHeader('apikey', 'sb_secret_test'));
    }

    public function test_private_manuscript_can_be_downloaded_to_a_local_extraction_file(): void
    {
        Http::fake(['*' => Http::response('%PDF-private-manuscript', 200)]);
        $destination = sys_get_temp_dir().DIRECTORY_SEPARATOR.'researchnav-storage-test-'.uniqid().'.pdf';

        try {
            (new SupabaseStorageService)->downloadTo(
                'Institute of Computer Studies/2026/Title/manuscript.pdf',
                $destination,
            );

            $this->assertSame('%PDF-private-manuscript', file_get_contents($destination));
        } finally {
            if (is_file($destination)) {
                unlink($destination);
            }
        }
    }

    public function test_manuscript_counts_are_based_on_supabase_title_folders(): void
    {
        Http::fake(function ($request) {
            $prefix = $request->data()['prefix'] ?? null;

            return match ($prefix) {
                'Institute of Computer Studies' => Http::response([
                    ['name' => '2026', 'id' => null, 'metadata' => null],
                ]),
                'Institute of Computer Studies/2026' => Http::response([
                    ['name' => 'Research A', 'id' => null, 'metadata' => null],
                    ['name' => 'Research B', 'id' => null, 'metadata' => null],
                ]),
                default => Http::response([]),
            };
        });

        $counts = collect((new SupabaseStorageService)->manuscriptCountsByInstitute())
            ->keyBy('institute');

        $this->assertSame(2, $counts['Institute of Computer Studies']['total']);
        $this->assertSame(0, $counts['Institute of Health Sciences']['total']);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), '/storage/v1/object/list/research-manuscripts'));
    }
}
