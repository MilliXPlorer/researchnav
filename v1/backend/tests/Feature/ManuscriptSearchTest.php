<?php

namespace Tests\Feature;

use App\Models\DocumentFile;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\DocumentService;
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
        $extractor->shouldReceive('extractRaw')->once()->andThrow(new ManuscriptTextExtractionException('failed'));

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
        $extractor->shouldReceive('extractRaw')->once()->andReturn('');

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
        $extractor->shouldReceive('extractRaw')->once()->andReturn('canonical import body');

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
        $extractor->shouldReceive('extractRaw')->once()->andReturn('recovered body');
        $service = app(ManuscriptSearchProjectionService::class);

        $this->assertSame('failed', $service->reindex($document->id));
        $this->assertSame('skipped', $service->reindex($document->id));
        $this->assertSame('skipped', $service->reindex($document->id, false, true));
        $this->assertSame('failed', $service->reindex($document->id, true));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'failed',
            'error_code' => 'INVALID_SOURCE',
        ]);

        $path = 'research/'.$document->id.'/final.pdf';
        Storage::disk('researchnav_private')->put($path, $contents);
        DocumentFile::query()->where('research_document_id', $document->id)->update(['file_path' => $path]);

        $this->assertSame('indexed', $service->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'ready',
            'body_text' => 'recovered body',
        ]);
    }

    public function test_reindex_downloads_extracts_and_persists_a_manuscript_projection(): void
    {
        $document = $this->document();
        $contents = '%PDF-1.4 cached manuscript';
        $path = 'research/'.$document->id.'/final.pdf';
        $file = $this->file($document, [
            'document_type' => 'final_manuscript',
            'original_filename' => 'final.pdf',
            'stored_filename' => 'final.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen($contents),
            'content_sha256' => null,
        ]);
        $disk = Storage::disk('researchnav_private');
        $disk->put($path, $contents);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn('durably cached manuscript body');

        $this->assertSame('indexed', app(ManuscriptSearchProjectionService::class)->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'source_document_file_id' => $file->id,
            'source_sha256' => hash('sha256', $contents),
            'body_text' => 'durably cached manuscript body',
            'extraction_status' => 'ready',
        ]);
    }

    public function test_reindex_combines_every_current_final_manuscript_in_persisted_order(): void
    {
        $document = $this->document();
        Storage::fake('researchnav_private');
        $files = [];
        foreach ([
            ['file_order' => 1, 'original_filename' => 'z-first.pdf', 'contents' => 'z bytes'],
            ['file_order' => 1, 'original_filename' => 'a-first.docx', 'contents' => 'a bytes'],
            ['file_order' => 2, 'original_filename' => 'second.pdf', 'contents' => 'second bytes'],
        ] as $index => $attributes) {
            $path = 'research/'.$document->id.'/part-'.$index.'.'.pathinfo($attributes['original_filename'], PATHINFO_EXTENSION);
            Storage::disk('researchnav_private')->put($path, $attributes['contents']);
            $files[] = $this->file($document, [
                'document_type' => 'final_manuscript',
                'version_number' => $index + 1,
                'file_order' => $attributes['file_order'],
                'original_filename' => $attributes['original_filename'],
                'stored_filename' => basename($path),
                'file_path' => $path,
                'file_extension' => pathinfo($path, PATHINFO_EXTENSION),
                'mime_type' => str_ends_with($path, '.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'file_size' => strlen($attributes['contents']),
            ]);
        }
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->times(3)->andReturn('a text', 'z text', 'second text');

        $this->assertSame('indexed', app(ManuscriptSearchProjectionService::class)->reindex($document->id));

        $projection = ManuscriptSearchDocument::query()->where('research_document_id', $document->id)->sole();
        $ordered = [$files[1], $files[0], $files[2]];
        $this->assertNull($projection->source_document_file_id);
        $this->assertNull($projection->source_extension);
        $this->assertSame($this->aggregateSourceHash($ordered), $projection->source_sha256);
        $this->assertSame('a text'."\n\n".'z text'."\n\n".'second text', $projection->body_text);
    }

    public function test_adding_a_current_final_manuscript_reindexes_the_complete_source_set(): void
    {
        $document = $this->document();
        $first = $this->finalFile($document);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->times(3)->andReturn('first text', 'updated first text', 'second text');
        $service = app(ManuscriptSearchProjectionService::class);

        $this->assertSame('indexed', $service->reindex($document->id));
        $firstHash = ManuscriptSearchDocument::query()->where('research_document_id', $document->id)->value('source_sha256');
        $path = 'research/'.$document->id.'/second.pdf';
        Storage::disk('researchnav_private')->put($path, 'second bytes');
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'second.pdf',
            'stored_filename' => 'second.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen('second bytes'),
        ]);

        $this->assertSame('indexed', $service->reindex($document->id));
        $projection = ManuscriptSearchDocument::query()->where('research_document_id', $document->id)->sole();
        $this->assertNull($projection->source_document_file_id);
        $this->assertNotSame($firstHash, $projection->source_sha256);
        $this->assertSame('updated first text'."\n\n".'second text', $projection->body_text);
        $this->assertSame($first->file_size + strlen('second bytes'), $projection->source_size_bytes);
    }

    public function test_failed_aggregate_extraction_never_persists_partial_text(): void
    {
        $document = $this->document();
        $this->finalFile($document);
        $path = 'research/'.$document->id.'/second.pdf';
        Storage::disk('researchnav_private')->put($path, 'second bytes');
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'second.pdf',
            'stored_filename' => 'second.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen('second bytes'),
        ]);
        $projection = $this->projection($document, 'stale complete body');
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn('first extracted text');
        $extractor->shouldReceive('extractRaw')->once()->andThrow(new ManuscriptTextExtractionException('failed'));

        $this->assertSame('failed', app(ManuscriptSearchProjectionService::class)->reindex($document->id, true));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'id' => $projection->id,
            'extraction_status' => 'failed',
            'body_text' => null,
            'error_code' => 'EXTRACTION_FAILED',
        ]);
    }

    public function test_invalid_member_of_a_final_manuscript_aggregate_fails_without_partial_text(): void
    {
        $document = $this->document();
        $first = $this->finalFile($document);
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'missing.pdf',
            'stored_filename' => 'missing.pdf',
            'file_path' => 'research/'.$document->id.'/missing.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 1,
        ]);
        $projection = $this->projection($document, 'stale aggregate body', $first);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');

        $this->assertSame('failed', app(ManuscriptSearchProjectionService::class)->reindex($document->id, true));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'id' => $projection->id,
            'extraction_status' => 'failed',
            'body_text' => null,
            'error_code' => 'INVALID_SOURCE',
        ]);
    }

    public function test_no_current_source_is_classified_as_no_source(): void
    {
        $document = $this->document();
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');

        $this->assertSame('no_source', app(ManuscriptSearchProjectionService::class)->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'no_source',
            'error_code' => 'NO_SOURCE',
        ]);
    }

    public function test_final_manuscript_aggregate_fails_when_it_exceeds_the_source_file_limit(): void
    {
        $document = $this->document();
        for ($index = 1; $index <= 21; $index++) {
            $this->file($document, [
                'document_type' => 'final_manuscript',
                'version_number' => $index,
                'file_order' => $index,
                'original_filename' => "part-{$index}.pdf",
                'stored_filename' => "part-{$index}.pdf",
                'file_path' => 'research/'.$document->id."/part-{$index}.pdf",
                'file_extension' => 'pdf',
                'mime_type' => 'application/pdf',
                'file_size' => 1,
            ]);
        }
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');

        $service = app(ManuscriptSearchProjectionService::class);
        $this->assertSame('failed', $service->reindex($document->id));
        $this->assertSame('skipped', $service->reindex($document->id));
        $this->assertSame('skipped', $service->reindex($document->id, false, true));
        $this->assertSame('failed', $service->reindex($document->id, true));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'failed',
            'error_code' => 'SOURCE_LIMIT_EXCEEDED',
        ]);

        DocumentFile::query()->where('research_document_id', $document->id)->firstOrFail()->delete();
        $this->assertSame('failed', $service->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'error_code' => 'INVALID_SOURCE',
        ]);
    }

    public function test_aggregate_source_change_during_extraction_does_not_persist_stale_text(): void
    {
        $document = $this->document();
        $first = $this->finalFile($document);
        $path = 'research/'.$document->id.'/second.pdf';
        Storage::disk('researchnav_private')->put($path, 'second bytes');
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'second.pdf',
            'stored_filename' => 'second.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen('second bytes'),
        ]);
        $calls = 0;
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()->andReturnUsing(function () use (&$calls, $first): string {
            $calls++;
            if ($calls === 1) {
                Storage::disk('researchnav_private')->put($first->file_path, str_repeat('x', strlen('%PDF-1.4 final')));
            }

            return "part {$calls}";
        });

        $this->assertSame('skipped', app(ManuscriptSearchProjectionService::class)->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'pending',
            'body_text' => null,
        ]);
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
        $extractor->shouldReceive('extractRaw')->twice()->andReturn('first body', 'second body');
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

    public function test_changed_failed_source_retries_without_retry_failed_option(): void
    {
        $document = $this->document();
        $file = $this->finalFile($document);
        $contents = '%PDF-1.4 final';
        $replacement = str_repeat('x', strlen($contents));
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andThrow(new ManuscriptTextExtractionException('failed'));
        $extractor->shouldReceive('extractRaw')->once()->andReturn('replacement body');
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

    public function test_deleting_a_current_final_manuscript_invalidates_its_projection(): void
    {
        $document = $this->document(['submission_status' => 'approved']);
        $file = $this->finalFile($document);
        $path = 'research/'.$document->id.'/second.pdf';
        Storage::disk('researchnav_private')->put($path, 'second bytes');
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'second.pdf',
            'stored_filename' => 'second.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen('second bytes'),
        ]);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()->andReturn('first body', 'second body');
        $this->assertSame('indexed', app(ManuscriptSearchProjectionService::class)->reindex($document->id));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'source_document_file_id' => null,
            'extraction_status' => 'ready',
        ]);
        $office = User::factory()->create(['role' => 'research-office']);

        app(DocumentService::class)->delete($office, $file);

        $this->assertDatabaseHas('manuscript_search_documents', [
            'research_document_id' => $document->id,
            'extraction_status' => 'pending',
            'body_text' => null,
        ]);
    }

    public function test_renaming_a_current_final_manuscript_invalidates_an_aggregate_projection(): void
    {
        $document = $this->document(['submission_status' => 'approved']);
        $renamed = $this->finalFile($document)->refresh();
        $path = 'research/'.$document->id.'/a-first.pdf';
        Storage::disk('researchnav_private')->put($path, 'a bytes');
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => $renamed->file_order,
            'original_filename' => 'a-first.pdf',
            'stored_filename' => 'a-first.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen('a bytes'),
        ]);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()->andReturn('a body', 'final body');
        $this->assertSame('indexed', app(ManuscriptSearchProjectionService::class)->reindex($document->id));
        $projection = ManuscriptSearchDocument::query()->where('research_document_id', $document->id)->sole();
        $this->assertNull($projection->source_document_file_id);
        $this->assertSame('ready', $projection->extraction_status);
        $this->assertSame('a body'."\n\n".'final body', $projection->body_text);

        app(DocumentService::class)->rename(User::factory()->create(['role' => 'research-office']), $renamed, '0-final.pdf');

        $this->assertDatabaseHas('manuscript_search_documents', [
            'id' => $projection->id,
            'research_document_id' => $document->id,
            'source_document_file_id' => null,
            'extraction_status' => 'pending',
            'body_text' => null,
        ]);
    }

    public function test_aggregate_output_budget_overflow_clears_stale_text(): void
    {
        config()->set('researchnav.manuscript_search.maximum_output_bytes', 10);
        config()->set('researchnav.manuscript_search.maximum_text_characters', 10);
        $document = $this->document();
        $first = $this->finalFile($document);
        $path = 'research/'.$document->id.'/second.pdf';
        Storage::disk('researchnav_private')->put($path, 'second bytes');
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'file_order' => 2,
            'original_filename' => 'second.pdf',
            'stored_filename' => 'second.pdf',
            'file_path' => $path,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => strlen('second bytes'),
        ]);
        $projection = $this->projection($document, 'stale body', $first);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()->andReturn('abcdef', 'abcdef');

        $this->assertSame('failed', app(ManuscriptSearchProjectionService::class)->reindex($document->id, true));
        $this->assertDatabaseHas('manuscript_search_documents', [
            'id' => $projection->id,
            'extraction_status' => 'failed',
            'body_text' => null,
            'error_code' => 'AGGREGATE_OUTPUT_LIMIT_EXCEEDED',
        ]);
    }

    public function test_unchanged_unsupported_projection_is_skipped_unless_forced(): void
    {
        $document = $this->document();
        Storage::fake('researchnav_private');
        $path = 'research/'.$document->id.'/legacy.doc';
        Storage::disk('researchnav_private')->put($path, 'legacy document');
        $this->file($document, [
            'document_type' => 'final_manuscript',
            'original_filename' => 'legacy.doc',
            'stored_filename' => 'legacy.doc',
            'file_path' => $path,
            'file_extension' => 'doc',
            'mime_type' => 'application/msword',
            'file_size' => strlen('legacy document'),
        ]);
        $extractor = $this->mock(ManuscriptTextExtractor::class);
        $extractor->shouldNotReceive('extract');
        $service = app(ManuscriptSearchProjectionService::class);

        $this->assertSame('unsupported', $service->reindex($document->id));
        $this->assertSame('skipped', $service->reindex($document->id));
        $this->assertSame('skipped', $service->reindex($document->id, false, true));
        $this->assertSame('unsupported', $service->reindex($document->id, true));
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
        $extractor->shouldReceive('extractRaw')->once()->andReturn('reindexed body');

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
        $extractor->shouldReceive('extractRaw')->once()->andThrow(new ManuscriptTextExtractionException('failed'));

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

    /** @param array<int, DocumentFile> $files */
    private function aggregateSourceHash(array $files): string
    {
        $manifest = array_map(fn (DocumentFile $file): array => [
            'id' => $file->id,
            'file_order' => $file->file_order,
            'original_filename' => $file->original_filename,
            'path' => $file->file_path,
            'extension' => $file->file_extension,
            'sha256' => hash_file('sha256', Storage::disk('researchnav_private')->path($file->file_path)),
            'size' => $file->file_size,
            'updated_at' => $file->updated_at?->format('Y-m-d H:i:s.u'),
        ], $files);

        return hash('sha256', json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }
}
