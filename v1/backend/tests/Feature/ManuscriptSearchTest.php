<?php

namespace Tests\Feature;

use App\Models\DocumentFile;
use App\Models\ManuscriptSdgClassification;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\DocumentService;
use App\Services\ManuscriptSdgClassificationService;
use App\Services\ManuscriptSearchProjectionService;
use App\Services\ManuscriptTextExtractionException;
use App\Services\ManuscriptTextExtractor;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ManuscriptSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_repository_finds_body_only_matches_without_leaking_projection_fields(): void
    {
        $public = $this->document(['title' => 'Metadata without the term']);
        $private = $this->document(['visibility' => 'private']);
        $deleted = $this->document();
        $deleted->delete();
        foreach ([$public, $private, $deleted] as $document) {
            $this->projection($document, 'unique corpus phrase');
        }

        $response = $this->getJson('/api/repository?q=unique%20corpus')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $public->id);

        foreach (['body_text', 'snippet', 'score', 'body_relevance', 'source_sha256', 'extraction_status'] as $field) {
            $response->assertJsonMissingPath('data.0.'.$field);
        }
    }

    public function test_failed_extraction_clears_stale_text_and_keeps_metadata_searchable(): void
    {
        $document = $this->document(['title' => 'Metadata fallback title']);
        $file = $this->finalFile($document);
        $projection = $this->projection($document, 'stale secret text', $file);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andThrow(new ManuscriptTextExtractionException('failed'));

        $outcome = app(ManuscriptSearchProjectionService::class)->reindex($document->id, true);

        $this->assertSame('failed', $outcome);
        $this->assertDatabaseHas('manuscript_search_documents', [
            'id' => $projection->id,
            'extraction_status' => 'failed',
            'body_text' => null,
            'error_code' => 'EXTRACTION_FAILED',
        ]);
        $this->getJson('/api/repository?q=Metadata%20fallback')->assertOk()->assertJsonPath('data.0.id', $document->id);
        $this->getJson('/api/repository?q=stale%20secret')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_empty_extraction_text_is_a_no_text_failure_that_clears_stale_body(): void
    {
        $document = $this->document(['title' => 'Metadata-only title']);
        $file = $this->finalFile($document);
        $projection = $this->projection($document, 'stale body', $file);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andReturn('');

        $this->assertSame('failed', app(ManuscriptSearchProjectionService::class)->reindex($document->id, true));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'id' => $projection->id,
            'extraction_status' => 'failed',
            'body_text' => null,
            'error_code' => 'NO_TEXT',
        ]);
        $this->getJson('/api/repository?q=Metadata-only')->assertOk()->assertJsonPath('data.0.id', $document->id);
    }

    public function test_verified_canonical_import_is_used_only_when_it_matches_its_declared_identity(): void
    {
        $contents = 'canonical docx bytes';
        $hash = hash('sha256', $contents);
        $document = $this->document([
            'import_source_sha256' => $hash,
            'import_source_filename' => 'canonical.docx',
        ]);
        Storage::fake('researchnav_private');
        $path = 'research/'.$document->id.'/'.$hash.'.docx';
        Storage::disk('researchnav_private')->put($path, $contents);
        $file = $this->file($document, [
            'document_type' => 'draft',
            'original_filename' => 'canonical.docx',
            'stored_filename' => $hash.'.docx',
            'file_path' => $path,
            'file_extension' => 'docx',
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'file_size' => strlen($contents),
        ]);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andReturn('canonical import body');

        $this->assertSame('indexed', app(ManuscriptSearchProjectionService::class)->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'source_document_file_id' => $file->id,
            'source_kind' => 'canonical_import',
            'extraction_status' => 'ready',
        ]);

        Storage::disk('researchnav_private')->put($path, 'modified');
        $this->assertSame('no_source', app(ManuscriptSearchProjectionService::class)->reindex($document->id, true));
        $this->assertDatabaseHas('manuscript_search_documents', ['research_document_id' => $document->id, 'body_text' => null, 'extraction_status' => 'no_source']);
    }

    public function test_canonical_import_requires_exactly_one_matching_candidate(): void
    {
        $contents = 'canonical docx bytes';
        $hash = hash('sha256', $contents);
        $document = $this->document([
            'import_source_sha256' => $hash,
            'import_source_filename' => 'canonical.docx',
        ]);
        Storage::fake('researchnav_private');
        $path = 'research/'.$document->id.'/'.$hash.'.docx';
        Storage::disk('researchnav_private')->put($path, $contents);
        $attributes = [
            'document_type' => 'draft',
            'original_filename' => 'canonical.docx',
            'stored_filename' => $hash.'.docx',
            'file_path' => $path,
            'file_extension' => 'docx',
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'file_size' => strlen($contents),
        ];
        $this->file($document, $attributes);
        $attributes['document_type'] = 'title_proposal';
        $this->file($document, $attributes);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');

        $this->assertSame('no_source', app(ManuscriptSearchProjectionService::class)->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'no_source',
        ]);
    }

    public function test_final_manuscript_source_path_is_bound_to_its_research_document(): void
    {
        $document = $this->document();
        $contents = '%PDF-1.4 final';
        Storage::fake('researchnav_private');
        Storage::disk('researchnav_private')->put('other-research/final.pdf', $contents);
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'original_filename' => 'final.pdf',
            'stored_filename' => 'final.pdf',
            'file_path' => 'other-research/final.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen($contents),
        ]);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');

        $this->assertSame('no_source', app(ManuscriptSearchProjectionService::class)->reindex($document->id));
    }

    public function test_invalidation_clears_a_ready_projection(): void
    {
        $document = $this->document();
        $this->projection($document, 'old body');

        app(ManuscriptSearchProjectionService::class)->invalidate($document->id);

        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'pending',
            'body_text' => null,
        ]);
    }

    public function test_changed_extractor_version_reextracts_a_ready_projection(): void
    {
        config()->set('researchnav.manuscript_search.extractor_version', 'test/v1');
        $document = $this->document();
        $this->finalFile($document);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->twice()->andReturn('first body', 'second body');
        $service = app(ManuscriptSearchProjectionService::class);

        $this->assertSame('indexed', $service->reindex($document->id));
        config()->set('researchnav.manuscript_search.extractor_version', 'test/v2');
        $this->assertSame('indexed', $service->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'body_text' => 'second body',
            'extractor_version' => 'test/v2',
        ]);
    }

    public function test_indexing_a_ready_projection_classifies_it_and_invalidation_removes_its_classification(): void
    {
        config()->set('researchnav.manuscript_search.extractor_version', 'test');
        $document = $this->document();
        $this->finalFile($document);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andReturn('SDGs 4 and 13');

        $this->assertSame('indexed', app(ManuscriptSearchProjectionService::class)->reindex($document->id));

        $projection = ManuscriptSearchDocument::query()->where('research_document_id', $document->id)->sole();
        $classification = ManuscriptSdgClassification::query()->where('manuscript_search_document_id', $projection->id)->sole();
        $this->assertSame([4, 13], $classification->detections()->orderBy('sdg_number')->pluck('sdg_number')->all());
        $this->assertTrue(app(ManuscriptSdgClassificationService::class)->isCurrent($projection));

        app(ManuscriptSearchProjectionService::class)->invalidate($document->id);

        $this->assertDatabaseMissing('manuscript_sdg_classifications', ['id' => $classification->id]);
        $this->assertDatabaseCount('manuscript_sdg_detections', 0);
    }

    public function test_current_ready_projection_refreshes_a_stale_sdg_classification_without_reextracting(): void
    {
        config()->set('researchnav.manuscript_search.extractor_version', 'test');
        config()->set('researchnav.sdg.detector_version', 'test-detector/1');
        $document = $this->document();
        $this->finalFile($document);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andReturn('SDG 4');
        $projections = app(ManuscriptSearchProjectionService::class);

        $this->assertSame('indexed', $projections->reindex($document->id));
        config()->set('researchnav.sdg.detector_version', 'test-detector/2');
        Storage::shouldReceive('disk')->never();

        $this->assertSame('skipped', $projections->reindex($document->id));

        $projection = ManuscriptSearchDocument::query()->where('research_document_id', $document->id)->sole();
        $this->assertTrue(app(ManuscriptSdgClassificationService::class)->isCurrent($projection));
        $this->assertDatabaseHas('manuscript_sdg_classifications', [
            'manuscript_search_document_id' => $projection->id,
            'detector_version' => 'test-detector/2',
        ]);
    }

    public function test_current_ready_projection_refreshes_a_missing_sdg_classification_without_storage_access(): void
    {
        config()->set('researchnav.manuscript_search.extractor_version', 'test');
        $document = $this->document();
        $this->finalFile($document);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andReturn('SDG 4');
        $projections = app(ManuscriptSearchProjectionService::class);

        $this->assertSame('indexed', $projections->reindex($document->id));
        $projection = ManuscriptSearchDocument::query()->where('research_document_id', $document->id)->sole();
        ManuscriptSdgClassification::query()->where('manuscript_search_document_id', $projection->id)->delete();
        Storage::shouldReceive('disk')->never();

        $this->assertSame('skipped', $projections->reindex($document->id));

        $this->assertDatabaseHas('manuscript_sdg_classifications', [
            'manuscript_search_document_id' => $projection->id,
        ]);
    }

    public function test_changed_failed_source_retries_without_retry_failed_option(): void
    {
        $document = $this->document();
        $file = $this->finalFile($document);
        $contents = '%PDF-1.4 final';
        $replacement = str_repeat('x', strlen($contents));
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andThrow(new ManuscriptTextExtractionException('failed'));
        $extractor->shouldReceive('extract')->once()->andReturn('replacement body');
        $service = app(ManuscriptSearchProjectionService::class);

        $this->assertSame('failed', $service->reindex($document->id));
        Storage::disk('researchnav_private')->put($file->file_path, $replacement);
        $this->assertSame('indexed', $service->reindex($document->id));
    }

    public function test_soft_deleting_research_immediately_purges_its_projection(): void
    {
        $document = $this->document();
        $projection = $this->projection($document, 'derived body');

        $document->delete();

        $this->assertDatabaseMissing('manuscript_search_documents', ['id' => $projection->id]);
    }

    public function test_final_manuscript_upload_invalidates_without_extracting(): void
    {
        $document = $this->document([
            'submission_status' => 'approved',
            'archive_status' => 'not_archived',
            'visibility' => 'private',
        ]);
        $this->projection($document, 'old body');
        Storage::fake('researchnav_private');
        $office = User::factory()->create(['role' => 'research-office']);

        app(DocumentService::class)->upload(
            $office,
            $document,
            UploadedFile::fake()->createWithContent('final.pdf', '%PDF-1.4 final manuscript'),
            'final_manuscript',
        );

        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'pending',
            'body_text' => null,
        ]);
    }

    public function test_cli_runner_uses_argv_and_accepts_only_normalized_json_protocol(): void
    {
        Storage::fake('researchnav_private');
        Storage::disk('researchnav_private')->put('runner.pdf', 'input');
        $path = Storage::disk('researchnav_private')->path('runner.pdf');
        config()->set('researchnav.manuscript_search.python_binary', PHP_BINARY);
        config()->set('researchnav.manuscript_search.cli_path', base_path('tests/Fixtures/manuscript_extractor_worker.php'));

        $this->assertSame('normalized manuscript text', app(ManuscriptTextExtractor::class)->extract($path));
    }

    public function test_reindex_command_is_idempotent_for_a_current_ready_projection(): void
    {
        $document = $this->document();
        $this->finalFile($document);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andReturn('reindexed body');

        $this->artisan('repository:reindex-manuscripts', ['--document' => [$document->id]])->assertExitCode(0);
        $this->artisan('repository:reindex-manuscripts', ['--document' => [$document->id]])->assertExitCode(0);
        $this->assertDatabaseHas('manuscript_search_documents', ['research_document_id' => $document->id, 'extraction_status' => 'ready']);
    }

    public function test_reindex_command_rejects_an_invalid_target_before_processing_any_documents(): void
    {
        $document = $this->document();
        $this->finalFile($document);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');

        $this->artisan('repository:reindex-manuscripts', ['--document' => [$document->id, 'invalid']])
            ->assertExitCode(1);

        $this->assertDatabaseMissing('manuscript_search_documents', ['research_document_id' => $document->id]);
    }

    public function test_reindex_command_succeeds_when_a_valid_target_has_no_work(): void
    {
        $this->artisan('repository:reindex-manuscripts', ['--document' => [999999]])
            ->expectsOutputToContain('Processed: 0')
            ->assertExitCode(0);
    }

    public function test_reindex_command_returns_nonzero_when_extraction_fails(): void
    {
        $document = $this->document();
        $this->finalFile($document);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andThrow(new ManuscriptTextExtractionException('failed'));

        $this->artisan('repository:reindex-manuscripts', ['--document' => [$document->id]])
            ->expectsOutputToContain('Failed: 1')
            ->assertExitCode(1);
    }

    public function test_failed_projection_maintenance_is_scheduled_without_overlapping(): void
    {
        $event = collect(app(Schedule::class)->events())->first(
            fn ($event): bool => str_contains((string) $event->command, 'repository:reindex-manuscripts --retry-failed'),
        );

        $this->assertNotNull($event);
        $this->assertSame('*/10 * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }

    private function document(array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create(array_merge([
            'submitted_by' => User::factory()->create()->id,
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
        ], $attributes));
    }

    private function finalFile(ResearchDocument $document): DocumentFile
    {
        Storage::fake('researchnav_private');
        $path = 'research/'.$document->id.'/final.pdf';
        $contents = '%PDF-1.4 final';
        Storage::disk('researchnav_private')->put($path, $contents);

        return $this->file($document, [
            'document_type' => 'final_manuscript',
            'original_filename' => 'final.pdf',
            'stored_filename' => 'final.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen($contents),
        ]);
    }

    private function file(ResearchDocument $document, array $attributes): DocumentFile
    {
        return DocumentFile::query()->create(array_merge([
            'research_document_id' => $document->id,
            'uploaded_by' => $document->submitted_by,
            'version_number' => 1,
            'is_current' => true,
            'uploaded_at' => now(),
        ], $attributes));
    }

    private function projection(ResearchDocument $document, string $body, ?DocumentFile $file = null): ManuscriptSearchDocument
    {
        return ManuscriptSearchDocument::query()->create([
            'research_document_id' => $document->id,
            'source_document_file_id' => $file?->id,
            'source_kind' => $file === null ? null : 'final_manuscript',
            'source_extension' => $file === null ? null : 'pdf',
            'source_sha256' => $file === null ? null : str_repeat('a', 64),
            'source_size_bytes' => $file === null ? null : 1,
            'source_file_updated_at' => $file?->updated_at,
            'body_text' => $body,
            'body_text_bytes' => strlen($body),
            'body_text_chars' => mb_strlen($body),
            'extraction_status' => 'ready',
            'extractor_version' => 'test',
            'last_attempted_at' => now(),
            'indexed_at' => now(),
        ]);
    }
}
