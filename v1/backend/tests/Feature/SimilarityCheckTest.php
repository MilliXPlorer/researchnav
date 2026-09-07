<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\DocumentFile;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use App\Models\User;
use App\Services\ManuscriptSimilarityContentService;
use App\Services\SimilarityProcessRunner;
use App\Services\SimilarityService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class SimilarityCheckTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_compares_only_archived_public_candidates_and_preserves_workflow_status(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['title' => 'Public Candidate', 'submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $private = $this->document(['title' => 'Private Candidate', 'submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'private']);
        $this->app->instance(SimilarityProcessRunner::class, new class extends SimilarityProcessRunner
        {
            public function run(ResearchDocument $source, Collection $candidates): array
            {
                return $candidates->map(fn (ResearchDocument $candidate): array => [
                    'matched_research_id' => $candidate->id,
                    'tfidf_score' => '0.500000',
                    'title_similarity_score' => '0.500000000000',
                    'content_similarity_score' => '0.500000000000',
                    'cosine_score' => '0.500000',
                    'fasttext_score' => '0.900000',
                    'final_similarity_score' => '0.500000',
                    'matched_terms' => ['public'],
                    'contextual_analysis' => 'FastText support only.',
                ])->all();
            }
        });

        $this->withSession(['user_id' => $actor->id])
            ->call('POST', '/api/research/'.$source->id.'/similarity/check', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ORIGIN' => 'http://localhost:5173',
            ], '{}')
            ->assertCreated()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.matched_research_id', $candidate->id)
            ->assertJsonPath('data.0.final_similarity_score', '0.500000000000')
            ->assertJsonPath('data.0.classification', 'moderate');

        $this->assertDatabaseHas('similarity_results', ['source_research_id' => $source->id, 'matched_research_id' => $candidate->id]);
        $this->assertDatabaseMissing('similarity_results', ['source_research_id' => $source->id, 'matched_research_id' => $private->id]);
        $this->assertSame('draft', $source->refresh()->submission_status);
    }

    public function test_check_excludes_soft_deleted_candidates_from_trusted_scoring(): void
    {
        [$actor, $source] = $this->source();
        $live = $this->document(['title' => 'Live Public Candidate', 'submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $trashed = $this->document(['title' => 'Trashed Public Candidate', 'submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $trashed->delete();

        $this->app->instance(SimilarityProcessRunner::class, new class extends SimilarityProcessRunner
        {
            public function run(ResearchDocument $source, Collection $candidates): array
            {
                return $candidates->map(fn (ResearchDocument $candidate): array => [
                    'matched_research_id' => $candidate->id,
                    'tfidf_score' => '0.500000',
                    'cosine_score' => '0.500000',
                    'fasttext_score' => '0.900000',
                    'final_similarity_score' => '0.500000',
                    'matched_terms' => ['live'],
                    'contextual_analysis' => 'FastText support only.',
                ])->all();
            }
        });

        $this->withSession(['user_id' => $actor->id])
            ->call('POST', '/api/research/'.$source->id.'/similarity/check', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ORIGIN' => 'http://localhost:5173',
            ], '{}')
            ->assertCreated()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.matched_research_id', $live->id);

        $this->assertDatabaseHas('similarity_results', ['source_research_id' => $source->id, 'matched_research_id' => $live->id]);
        $this->assertDatabaseMissing('similarity_results', ['source_research_id' => $source->id, 'matched_research_id' => $trashed->id]);
    }

    public function test_check_keeps_public_candidates_with_unavailable_content_without_reporting_zero(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['title' => 'Unavailable Manuscript', 'submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->useTestWorker();
        $this->app->instance(ManuscriptSimilarityContentService::class, new class extends ManuscriptSimilarityContentService
        {
            public function contentFor(ResearchDocument $source, Collection $candidates): array
            {
                return [
                    'source' => ['text' => 'Source manuscript content', 'sha256' => null],
                    'candidates' => [(int) $candidates->sole()->id => null],
                ];
            }
        });
        $this->app->forgetInstance(SimilarityProcessRunner::class);

        $this->similarityCheck($actor, $source)
            ->assertCreated()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.matched_research_id', $candidate->id)
            ->assertJsonPath('data.0.score_status', 'content_unavailable')
            ->assertJsonPath('data.0.final_similarity_score', null)
            ->assertJsonPath('data.0.overall_flagged', false)
            ->assertJsonMissingPath('data.0.is_flagged');

        $this->assertDatabaseHas('similarity_results', [
            'source_research_id' => $source->id,
            'matched_research_id' => $candidate->id,
            'score_status' => 'content_unavailable',
            'final_similarity_score' => null,
            'is_flagged' => false,
        ]);
    }

    public function test_missing_fasttext_keeps_persisted_tfidf_scoring_available(): void
    {
        [$actor, $source] = $this->source();
        $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', app_path('Services/similarity/cli.py'));
        config()->set('researchnav.similarity.fasttext_model_path', '');
        $this->app->forgetInstance(SimilarityProcessRunner::class);

        $this->withSession(['user_id' => $actor->id])
            ->call('POST', '/api/research/'.$source->id.'/similarity/check', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ORIGIN' => 'http://localhost:5173',
            ], '{}')
            ->assertCreated()
            ->assertJsonPath('data.0.fasttext_score', null)
            ->assertJsonPath('data.0.contextual_analysis', 'FastText supporting context unavailable.');
        $this->assertDatabaseCount('similarity_results', 1);
    }

    public function test_process_child_receives_no_laravel_environment_secrets(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->useTestWorker();
        putenv('TEST_SECRET=Laravel-secret');
        $_ENV['TEST_SECRET'] = 'Laravel-secret';
        $_SERVER['TEST_SECRET'] = 'Laravel-secret';

        try {
            $results = app(SimilarityProcessRunner::class)->run($source, collect([$candidate]));
            $this->assertSame('worker secret absent', $results[0]['contextual_analysis']);
        } finally {
            putenv('TEST_SECRET');
            unset($_ENV['TEST_SECRET'], $_SERVER['TEST_SECRET']);
        }
    }

    public function test_malformed_worker_score_returns_a_stable_process_error_before_persistence(): void
    {
        [$actor, $source] = $this->source();
        $source->update(['title' => 'Malformed worker output source']);
        $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->useTestWorker();

        $this->withSession(['user_id' => $actor->id])
            ->call('POST', '/api/research/'.$source->id.'/similarity/check', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ORIGIN' => 'http://localhost:5173',
            ], '{}')
            ->assertStatus(502)
            ->assertExactJson(['error' => 'SIMILARITY_PROCESS_FAILED']);

        $this->assertDatabaseCount('similarity_results', 0);
    }

    public function test_check_revalidates_candidate_eligibility_under_lock_before_persistence(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->app->instance(SimilarityProcessRunner::class, new class($candidate) extends SimilarityProcessRunner
        {
            public function __construct(private readonly ResearchDocument $candidate) {}

            public function run(ResearchDocument $source, Collection $candidates): array
            {
                $this->candidate->update(['visibility' => 'private']);

                return [[
                    'matched_research_id' => $this->candidate->id,
                    'tfidf_score' => '0.500000',
                    'cosine_score' => '0.500000',
                    'fasttext_score' => '0.900000',
                    'final_similarity_score' => '0.500000',
                    'matched_terms' => ['public'],
                    'contextual_analysis' => 'FastText support only.',
                ]];
            }
        });

        $this->withSession(['user_id' => $actor->id])
            ->call('POST', '/api/research/'.$source->id.'/similarity/check', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ORIGIN' => 'http://localhost:5173',
            ], '{}')
            ->assertStatus(502)
            ->assertExactJson(['error' => 'SIMILARITY_PROCESS_FAILED']);

        $this->assertDatabaseCount('similarity_results', 0);
    }

    public function test_similarity_transactions_lock_the_source_before_the_actor(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->app->instance(SimilarityProcessRunner::class, new class extends SimilarityProcessRunner
        {
            public function run(ResearchDocument $source, Collection $candidates): array
            {
                return $candidates->map(fn (ResearchDocument $candidate): array => [
                    'matched_research_id' => $candidate->id,
                    'tfidf_score' => '0.500000',
                    'cosine_score' => '0.500000',
                    'fasttext_score' => '0.900000',
                    'final_similarity_score' => '0.500000',
                    'matched_terms' => [],
                    'contextual_analysis' => 'FastText support only.',
                ])->all();
            }
        });

        DB::flushQueryLog();
        DB::enableQueryLog();

        try {
            app(SimilarityService::class)->check($actor, $source);
            $checkLocks = $this->sourceAndActorQuerySequence($actor, $source);

            DB::flushQueryLog();
            app(SimilarityService::class)->storeResult($actor, $source, [
                'matched_research_id' => $candidate->id,
                'cosine_score' => '0.500000',
                'final_similarity_score' => '0.500000',
                'analysis_type' => 'title',
            ]);
            $storeLocks = $this->sourceAndActorQuerySequence($actor, $source);
        } finally {
            DB::disableQueryLog();
        }

        // The first pair is pre-processing authorization. Each following pair
        // is a transaction revalidation and must lock its research row first.
        $this->assertSame(['actor', 'source', 'source', 'actor', 'source', 'actor'], array_slice($checkLocks, 0, 6));
        $this->assertSame(['source', 'actor'], array_slice($storeLocks, 0, 2));
    }

    public function test_check_rejects_a_source_title_change_during_scoring_before_persistence(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->app->instance(SimilarityProcessRunner::class, new class($source) extends SimilarityProcessRunner
        {
            public function __construct(private readonly ResearchDocument $originalSource) {}

            public function run(ResearchDocument $source, Collection $candidates): array
            {
                $this->originalSource->update(['title' => 'Changed while scoring']);

                return [$this->result($candidates->firstOrFail())];
            }

            /** @return array<string, mixed> */
            private function result(ResearchDocument $candidate): array
            {
                return [
                    'matched_research_id' => $candidate->id,
                    'tfidf_score' => '0.500000',
                    'cosine_score' => '0.500000',
                    'fasttext_score' => '0.900000',
                    'final_similarity_score' => '0.500000',
                    'matched_terms' => ['public'],
                    'contextual_analysis' => 'FastText support only.',
                ];
            }
        });

        $this->similarityCheck($actor, $source)
            ->assertStatus(502)
            ->assertExactJson(['error' => 'SIMILARITY_PROCESS_FAILED']);

        $this->assertDatabaseCount('similarity_results', 0);
        $this->assertSame('Changed while scoring', $source->refresh()->title);
        $this->assertDatabaseHas('research_documents', ['id' => $candidate->id]);
    }

    public function test_check_aborts_all_writes_when_source_manuscript_bytes_change_during_scoring(): void
    {
        Storage::fake('researchnav_private');
        [$actor, $source] = $this->source();
        $candidate = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $path = 'research/'.$source->id.'/source.pdf';
        Storage::disk('researchnav_private')->put($path, 'source bytes');
        DocumentFile::query()->create([
            'research_document_id' => $source->id,
            'uploaded_by' => $actor->id,
            'document_type' => 'draft', 'version_number' => 1,
            'original_filename' => 'source.pdf', 'stored_filename' => 'source.pdf',
            'file_path' => $path, 'file_extension' => 'pdf', 'mime_type' => 'application/pdf',
            'file_size' => strlen('source bytes'), 'is_current' => true, 'uploaded_at' => now(),
        ]);
        $sourceHash = hash('sha256', 'source bytes');
        $this->app->instance(SimilarityProcessRunner::class, new class($path, $sourceHash) extends SimilarityProcessRunner
        {
            public function __construct(private readonly string $path, private readonly string $sourceHash) {}

            public function run(ResearchDocument $source, Collection $candidates): array
            {
                Storage::disk('researchnav_private')->put($this->path, 'changed bytes');

                return [[
                    'matched_research_id' => $candidates->sole()->id,
                    'tfidf_score' => '0.500000', 'cosine_score' => '0.500000',
                    'fasttext_score' => '0.900000', 'final_similarity_score' => '0.500000',
                    'source_content_sha256' => $this->sourceHash,
                    'matched_terms' => [], 'contextual_analysis' => 'FastText support only.',
                ]];
            }
        });

        $this->similarityCheck($actor, $source)
            ->assertStatus(502)
            ->assertExactJson(['error' => 'SIMILARITY_PROCESS_FAILED']);

        $this->assertDatabaseCount('similarity_results', 0);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'SIMILARITY_CHECK_COMPLETED']);
        $this->assertDatabaseMissing('monitoring_logs', ['activity_type' => 'SIMILARITY_CHECK_COMPLETED']);
        $this->assertDatabaseCount('notifications', 0);
        $this->assertDatabaseHas('research_documents', ['id' => $candidate->id]);
    }

    public function test_check_aborts_when_a_scored_source_file_is_deleted_during_processing(): void
    {
        Storage::fake('researchnav_private');
        [$actor, $source] = $this->source();
        $candidate = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $path = 'research/'.$source->id.'/source.pdf';
        Storage::disk('researchnav_private')->put($path, 'source bytes');
        DocumentFile::query()->create([
            'research_document_id' => $source->id, 'uploaded_by' => $actor->id,
            'document_type' => 'draft', 'version_number' => 1, 'original_filename' => 'source.pdf',
            'stored_filename' => 'source.pdf', 'file_path' => $path, 'file_extension' => 'pdf',
            'mime_type' => 'application/pdf', 'file_size' => strlen('source bytes'), 'is_current' => true, 'uploaded_at' => now(),
        ]);
        $this->app->instance(SimilarityProcessRunner::class, new class($path) extends SimilarityProcessRunner
        {
            public function __construct(private readonly string $path) {}

            public function run(ResearchDocument $source, Collection $candidates): array
            {
                Storage::disk('researchnav_private')->delete($this->path);

                return [[
                    'matched_research_id' => $candidates->sole()->id,
                    'source_content_sha256' => hash('sha256', 'source bytes'),
                ]];
            }
        });

        $this->similarityCheck($actor, $source)->assertStatus(502);
        $this->assertDatabaseCount('similarity_results', 0);
    }

    public function test_check_aborts_when_a_trusted_source_projection_body_changes_with_the_same_source_hash(): void
    {
        [$actor, $source] = $this->source();
        $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $projection = ManuscriptSearchDocument::query()->create([
            'research_document_id' => $source->id, 'body_text' => 'original source body',
            'extraction_status' => 'ready', 'source_sha256' => str_repeat('a', 64),
            'extractor_version' => config('researchnav.manuscript_search.extractor_version'),
        ]);
        $this->useTestWorker();
        $this->app->instance(SimilarityProcessRunner::class, new class($projection) extends SimilarityProcessRunner
        {
            public function __construct(private readonly ManuscriptSearchDocument $projection)
            {
                parent::__construct();
            }

            public function run(ResearchDocument $source, Collection $candidates): array
            {
                $results = parent::run($source, $candidates);
                $this->projection->update(['body_text' => 'replacement source body']);

                return $results;
            }
        });

        $this->similarityCheck($actor, $source)->assertStatus(502);
        $this->assertDatabaseCount('similarity_results', 0);
    }

    public function test_check_aborts_when_a_stale_source_projection_becomes_current_during_scoring(): void
    {
        [$actor, $source] = $this->source();
        $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $projection = ManuscriptSearchDocument::query()->create([
            'research_document_id' => $source->id, 'body_text' => 'stale source body',
            'extraction_status' => 'ready', 'source_sha256' => str_repeat('a', 64), 'extractor_version' => 'stale/0',
        ]);
        $this->useTestWorker();
        $this->app->instance(SimilarityProcessRunner::class, new class($projection) extends SimilarityProcessRunner
        {
            public function __construct(private readonly ManuscriptSearchDocument $projection)
            {
                parent::__construct();
            }

            public function run(ResearchDocument $source, Collection $candidates): array
            {
                $results = parent::run($source, $candidates);
                $this->projection->update(['extractor_version' => config('researchnav.manuscript_search.extractor_version')]);

                return $results;
            }
        });

        $this->similarityCheck($actor, $source)->assertStatus(502);
        $this->assertDatabaseCount('similarity_results', 0);
    }

    public function test_check_aborts_when_an_unavailable_source_gains_a_ready_projection_during_scoring(): void
    {
        [$actor, $source] = $this->source();
        $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->useTestWorker();
        $this->app->instance(SimilarityProcessRunner::class, new class extends SimilarityProcessRunner
        {
            public function __construct()
            {
                parent::__construct();
            }

            public function run(ResearchDocument $source, Collection $candidates): array
            {
                $results = parent::run($source, $candidates);
                ManuscriptSearchDocument::query()->create([
                    'research_document_id' => $source->id, 'body_text' => 'newly indexed source body',
                    'extraction_status' => 'ready', 'source_sha256' => str_repeat('a', 64),
                    'extractor_version' => config('researchnav.manuscript_search.extractor_version'),
                ]);

                return $results;
            }
        });

        $this->similarityCheck($actor, $source)->assertStatus(502);
        $this->assertDatabaseCount('similarity_results', 0);
    }

    public function test_check_aborts_when_candidate_title_or_projection_changes_during_processing(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['title' => 'Original candidate', 'submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $projection = ManuscriptSearchDocument::query()->create([
            'research_document_id' => $candidate->id, 'body_text' => 'ready body', 'body_text_bytes' => 10,
            'body_text_chars' => 10, 'extraction_status' => 'ready', 'source_sha256' => str_repeat('b', 64), 'extractor_version' => 'test',
        ]);

        foreach ([
            static fn () => $candidate->update(['title' => 'Changed candidate']),
            static fn () => ManuscriptSearchDocument::query()->where('research_document_id', $candidate->id)->delete(),
        ] as $change) {
            $candidate->update(['title' => 'Original candidate']);
            if (! ManuscriptSearchDocument::query()->whereKey($projection->id)->exists()) {
                $projection = ManuscriptSearchDocument::query()->create([
                    'research_document_id' => $candidate->id, 'body_text' => 'ready body', 'body_text_bytes' => 10,
                    'body_text_chars' => 10, 'extraction_status' => 'ready', 'source_sha256' => str_repeat('b', 64), 'extractor_version' => 'test',
                ]);
            }
            $this->app->instance(SimilarityProcessRunner::class, new class($change) extends SimilarityProcessRunner
            {
                public function __construct(private readonly \Closure $change) {}

                public function run(ResearchDocument $source, Collection $candidates): array
                {
                    ($this->change)();

                    return [['matched_research_id' => $candidates->sole()->id]];
                }
            });

            $this->similarityCheck($actor, $source)->assertStatus(502);
            $this->assertDatabaseCount('similarity_results', 0);
        }
    }

    public function test_content_service_never_retries_failed_candidate_projections_during_a_check(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $projection = ManuscriptSearchDocument::query()->create([
            'research_document_id' => $candidate->id, 'extraction_status' => 'failed', 'error_code' => 'EXTRACTION_FAILED',
            'source_sha256' => str_repeat('b', 64), 'extractor_version' => 'test',
        ]);

        app(ManuscriptSimilarityContentService::class)->contentFor($source, collect([$candidate]));

        $this->assertSame('failed', $projection->refresh()->extraction_status);
    }

    public function test_check_rejects_a_deleted_source_during_scoring_before_persistence(): void
    {
        [$actor, $source] = $this->source();
        $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->app->instance(SimilarityProcessRunner::class, new class($source) extends SimilarityProcessRunner
        {
            public function __construct(private readonly ResearchDocument $originalSource) {}

            public function run(ResearchDocument $source, Collection $candidates): array
            {
                $this->originalSource->delete();

                return $candidates->map(fn (ResearchDocument $candidate): array => [
                    'matched_research_id' => $candidate->id,
                    'tfidf_score' => '0.500000',
                    'cosine_score' => '0.500000',
                    'fasttext_score' => '0.900000',
                    'final_similarity_score' => '0.500000',
                    'matched_terms' => ['public'],
                    'contextual_analysis' => 'FastText support only.',
                ])->all();
            }
        });

        $this->similarityCheck($actor, $source)
            ->assertStatus(502)
            ->assertExactJson(['error' => 'SIMILARITY_PROCESS_FAILED']);

        $this->assertDatabaseCount('similarity_results', 0);
        $this->assertSoftDeleted('research_documents', ['id' => $source->id]);
    }

    public function test_related_studies_hide_results_when_the_matched_candidate_is_no_longer_public_and_archived(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['title' => 'No Longer Eligible', 'submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        SimilarityResult::factory()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $candidate->id,
            'source_title' => $source->title,
            'matched_title' => $candidate->title,
        ]);
        $candidate->update(['visibility' => 'private']);

        $this->withSession(['user_id' => $actor->id])
            ->getJson('/api/research/'.$source->id.'/similarity')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }

    public function test_related_studies_use_the_documented_weighted_then_title_then_id_order(): void
    {
        [$actor, $source] = $this->source();
        $first = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $second = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $unavailableHighTitle = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $unavailableLowTitle = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);

        // Both official values are exactly .50; title resolves that tie.
        SimilarityResult::factory()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $first->id,
            'title_similarity_score' => '0.900000000000',
            'content_similarity_score' => '0.328571428572',
        ]);
        SimilarityResult::factory()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $second->id,
            'title_similarity_score' => '0.800000000000',
            'content_similarity_score' => '0.371428571429',
        ]);
        SimilarityResult::factory()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $unavailableHighTitle->id,
            'title_similarity_score' => '0.950000000000',
            'content_similarity_score' => null,
            'score_status' => 'content_unavailable',
        ]);
        SimilarityResult::factory()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $unavailableLowTitle->id,
            'title_similarity_score' => '0.100000000000',
            'content_similarity_score' => null,
            'score_status' => 'content_unavailable',
        ]);

        $this->withSession(['user_id' => $actor->id])
            ->getJson('/api/research/'.$source->id.'/similarity')
            ->assertOk()
            ->assertJsonPath('data.*.matched_research_id', [
                $first->id, $second->id, $unavailableHighTitle->id, $unavailableLowTitle->id,
            ]);
    }

    public function test_result_persistence_is_atomic_when_a_result_cannot_be_stored(): void
    {
        [$actor, $source] = $this->source();
        $candidate = $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->app->instance(SimilarityProcessRunner::class, new class extends SimilarityProcessRunner
        {
            public function run(ResearchDocument $source, Collection $candidates): array
            {
                return [
                    [
                        'matched_research_id' => $candidates->firstOrFail()->id,
                        'tfidf_score' => '0.100000',
                        'cosine_score' => '0.100000',
                        'fasttext_score' => '0.800000',
                        'final_similarity_score' => '0.100000',
                        'matched_terms' => [],
                        'contextual_analysis' => 'FastText support only.',
                    ],
                    [
                        'matched_research_id' => 999999,
                        'tfidf_score' => '0.200000',
                        'cosine_score' => '0.200000',
                        'fasttext_score' => '0.800000',
                        'final_similarity_score' => '0.200000',
                        'matched_terms' => [],
                        'contextual_analysis' => 'FastText support only.',
                    ],
                ];
            }
        });

        try {
            app(SimilarityService::class)->check($actor, $source);
            $this->fail('Expected an invalid matched record to abort the transaction.');
        } catch (ModelNotFoundException) {
            $this->assertDatabaseMissing('similarity_results', ['source_research_id' => $source->id, 'matched_research_id' => $candidate->id]);
            $this->assertSame('draft', $source->refresh()->submission_status);
        }
    }

    public function test_check_rejects_non_empty_json_and_unauthorized_source_access(): void
    {
        [$actor, $source] = $this->source();
        $this->withSession(['user_id' => $actor->id])
            ->call('POST', '/api/research/'.$source->id.'/similarity/check', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ORIGIN' => 'http://localhost:5173',
            ], '[]')
            ->assertUnprocessable()
            ->assertJsonPath('error', 'VALIDATION_FAILED');

        $outsider = User::factory()->create();
        $this->withSession(['user_id' => $outsider->id])
            ->call('POST', '/api/research/'.$source->id.'/similarity/check', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ORIGIN' => 'http://localhost:5173',
            ], '{}')
            ->assertForbidden();
    }

    public function test_inactive_actor_cannot_run_a_similarity_check_or_persist_results(): void
    {
        [$actor, $source] = $this->source();
        $this->document(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        User::query()->whereKey($actor->id)->update(['account_status' => 'inactive']);

        try {
            app(SimilarityService::class)->check($actor, $source);
            $this->fail('Inactive actors must not invoke similarity processing.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('authorization', $exception->errors());
        }

        $this->assertDatabaseCount('similarity_results', 0);
    }

    public function test_check_rate_limits_an_authenticated_user_across_multiple_sources(): void
    {
        [$actor, $firstSource] = $this->source();
        $secondSource = $this->document(['submitted_by' => $actor->id, 'title' => 'Second Source Research']);
        $thirdSource = $this->document(['submitted_by' => $actor->id, 'title' => 'Third Source Research']);
        $this->app->instance(SimilarityProcessRunner::class, new class extends SimilarityProcessRunner
        {
            public function run(ResearchDocument $source, Collection $candidates): array
            {
                return [];
            }
        });

        $this->similarityCheck($actor, $firstSource)->assertCreated();
        $this->similarityCheck($actor, $secondSource)->assertCreated();
        $this->similarityCheck($actor, $thirdSource)
            ->assertStatus(429)
            ->assertExactJson(['error' => 'RATE_LIMIT_EXCEEDED']);
    }

    /** @return array{User, ResearchDocument} */
    private function source(): array
    {
        $actor = User::factory()->create();

        return [$actor, $this->document(['submitted_by' => $actor->id, 'title' => 'Source Research'])];
    }

    /** @param array<string, mixed> $attributes */
    private function document(array $attributes = []): ResearchDocument
    {
        $category = Category::query()->first() ?? Category::query()->create(['name' => 'Similarity', 'slug' => 'similarity']);

        return ResearchDocument::factory()->create(array_merge(['category_id' => $category->id], $attributes));
    }

    private function similarityCheck(User $actor, ResearchDocument $source)
    {
        return $this->withSession(['user_id' => $actor->id])
            ->call('POST', '/api/research/'.$source->id.'/similarity/check', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ORIGIN' => 'http://localhost:5173',
            ], '{}');
    }

    private function useTestWorker(): void
    {
        config()->set('researchnav.similarity.python_binary', PHP_BINARY);
        config()->set('researchnav.similarity.cli_path', base_path('tests/Fixtures/similarity_worker.php'));
        $this->app->instance(ManuscriptSimilarityContentService::class, new class extends ManuscriptSimilarityContentService
        {
            public function contentFor(ResearchDocument $source, Collection $candidates): array
            {
                return [
                    'source' => ['text' => 'Source manuscript content', 'sha256' => null],
                    'candidates' => $candidates->mapWithKeys(fn (ResearchDocument $candidate): array => [
                        (int) $candidate->id => ['text' => 'Candidate manuscript content', 'sha256' => str_repeat('b', 64)],
                    ])->all(),
                ];
            }
        });
        $this->app->forgetInstance(SimilarityProcessRunner::class);
    }

    /** @return array<int, 'source'|'actor'> */
    private function sourceAndActorQuerySequence(User $actor, ResearchDocument $source): array
    {
        return collect(DB::getQueryLog())
            ->map(function (array $query) use ($actor, $source): ?string {
                if (str_contains($query['query'], 'from "research_documents"') && $query['bindings'] === [$source->id]) {
                    return 'source';
                }

                if (str_contains($query['query'], 'from "users"') && $query['bindings'] === [$actor->id]) {
                    return 'actor';
                }

                return null;
            })
            ->filter()
            ->values()
            ->all();
    }
}
