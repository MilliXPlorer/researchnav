<?php

namespace Tests\Feature;

use App\Models\DocumentFile;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\ManuscriptTextExtractor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SdgBackfillCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_backfills_current_ready_classifications_within_the_inclusive_publication_year_range(): void
    {
        config()->set('researchnav.manuscript_search.extractor_version', 'test');
        config()->set('researchnav.sdg.detector_version', 'sdg-declaration/1');
        Storage::fake('researchnav_private');
        $inRange = $this->document(2024);
        $outOfRange = $this->document(2025);
        $this->projection($inRange, $this->finalFile($inRange));
        $this->projection($outOfRange, $this->finalFile($outOfRange));
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');

        $this->assertSame(0, Artisan::call('repository:reindex-manuscripts', [
            '--year-from' => 2024,
            '--year-to' => 2024,
        ]));
        $output = Artisan::output();
        $this->assertStringContainsString('Processed: 1', $output);
        $this->assertStringContainsString('Classified: 1', $output);

        $this->assertDatabaseHas('manuscript_sdg_classifications', [
            'manuscript_search_document_id' => $inRange->manuscriptSearchDocument->id,
        ]);
        $this->assertDatabaseMissing('manuscript_sdg_classifications', [
            'manuscript_search_document_id' => $outOfRange->manuscriptSearchDocument->id,
        ]);
    }

    public function test_it_rejects_invalid_publication_year_options_before_processing_documents(): void
    {
        Storage::fake('researchnav_private');
        $document = $this->document(2024);
        $this->projection($document, $this->finalFile($document));
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');

        $this->artisan('repository:reindex-manuscripts', ['--year-from' => 1900])
            ->assertExitCode(1);

        $this->assertDatabaseCount('manuscript_sdg_classifications', 0);
    }

    private function document(int $publicationYear): ResearchDocument
    {
        return ResearchDocument::factory()->create([
            'submitted_by' => User::factory()->create()->id,
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'publication_year' => $publicationYear,
        ]);
    }

    private function finalFile(ResearchDocument $document): DocumentFile
    {
        $contents = '%PDF-1.4 final '.$document->id;
        $path = 'research/'.$document->id.'/final.pdf';
        Storage::disk('researchnav_private')->put($path, $contents);

        return DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $document->submitted_by,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'final.pdf',
            'stored_filename' => 'final.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen($contents),
            'is_current' => true,
            'uploaded_at' => now(),
        ]);
    }

    private function projection(ResearchDocument $document, DocumentFile $file): ManuscriptSearchDocument
    {
        $contents = Storage::disk('researchnav_private')->get($file->file_path);

        return ManuscriptSearchDocument::query()->create([
            'research_document_id' => $document->id,
            'source_document_file_id' => $file->id,
            'source_kind' => 'final_manuscript',
            'source_extension' => 'pdf',
            'source_sha256' => hash('sha256', $contents),
            'source_size_bytes' => strlen($contents),
            'source_file_updated_at' => $file->updated_at,
            'body_text' => 'SDG 4',
            'body_text_bytes' => 5,
            'body_text_chars' => 5,
            'extraction_status' => 'ready',
            'extractor_version' => 'test',
            'last_attempted_at' => now(),
            'indexed_at' => now(),
        ]);
    }
}
