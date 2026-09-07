<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\DocumentFile;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\SimilarityProcessRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

class PublicRepositorySimilarityTest extends TestCase
{
    use RefreshDatabase;

    public function test_sessionless_query_uses_real_python_without_fasttext_and_omits_exact_zero_scores(): void
    {
        config()->set('researchnav.similarity.fasttext_model_path', '');
        config()->set('researchnav.similarity.python_binary', 'python');
        $exact = $this->archivedPublic('Climate Water');
        DocumentFile::query()->create([
            'research_document_id' => $exact->id,
            'uploaded_by' => $exact->submitted_by,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'climate.pdf',
            'stored_filename' => 'climate.pdf',
            'file_path' => 'research/'.$exact->id.'/climate.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 100,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);
        $bodyText = str_repeat('unrelated manuscript vocabulary ', 500);
        ManuscriptSearchDocument::query()->create([
            'research_document_id' => $exact->id,
            'body_text' => $bodyText,
            'body_text_bytes' => strlen($bodyText),
            'body_text_chars' => mb_strlen($bodyText),
            'extraction_status' => 'ready',
            'source_sha256' => str_repeat('a', 64),
            'extractor_version' => config('researchnav.manuscript_search.extractor_version'),
        ]);
        $partial = $this->archivedPublic('Climate Water Policy');
        $zero = $this->archivedPublic('Quantum Computing');
        $private = $this->document(['title' => 'Climate Water Private']);
        $approved = $this->document(['title' => 'Climate Water Approved']);
        $deleted = $this->archivedPublic('Climate Water Deleted');
        $deleted->delete();
        $approved->update(['submission_status' => 'approved', 'archive_status' => 'archived', 'visibility' => 'public']);

        config()->set('session.driver', 'database');
        $response = $this->postJson('/api/repository/similarity', ['q' => 'Climate Water']);

        $response->assertOk()
            ->assertCookieMissing('researchnav_sid')
            ->assertJsonPath('data.0.id', $exact->id)
            ->assertJsonPath('data.0.title_similarity_score', '1.000000000000')
            ->assertJsonPath('data.0.title_similarity_percentage', '100.000000000000')
            ->assertJsonPath('data.0.content_similarity_score', '0.000000000000')
            ->assertJsonPath('data.0.content_similarity_percentage', '0.000000000000')
            ->assertJsonPath('data.0.overall_similarity_score', '0.300000000000')
            ->assertJsonPath('data.0.overall_similarity_percentage', '30.000000000000')
            ->assertJsonPath('data.0.classification', 'low')
            ->assertJsonPath('data.0.query_similarity_score', '0.300000000000')
            ->assertJsonPath('data.0.matched_terms', ['climate', 'water'])
            ->assertJsonPath('data.0.fasttext_support_score', null)
            ->assertJsonPath('data.0.has_downloadable_manuscript', true)
            ->assertJsonMissing(['id' => $zero->id]);

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertSame([$exact->id, $partial->id], $ids);
        $this->assertNotContains($private->id, $ids);
        $this->assertNotContains($approved->id, $ids);
        $this->assertNotContains($deleted->id, $ids);
        $this->assertArrayNotHasKey('latest_similarity_score', $response->json('data.0'));
        $this->assertDatabaseCount('sessions', 0);
        $this->assertDatabaseCount('similarity_results', 0);
        $this->assertDatabaseCount('monitoring_logs', 0);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_query_requires_exact_json_with_a_two_to_two_hundred_character_q(): void
    {
        foreach (['{}', '{"q":"x"}', '{"q":"ok","extra":true}', '[]'] as $index => $body) {
            $this->call('POST', '/api/repository/similarity', [], [], [], [
                'CONTENT_TYPE' => 'application/json',
                'REMOTE_ADDR' => '10.0.0.'.($index + 1),
            ], $body)
                ->assertUnprocessable()
                ->assertJsonPath('error', 'VALIDATION_FAILED')
                ->assertCookieMissing('researchnav_sid');
        }
    }

    public function test_query_scores_terms_found_only_in_ready_indexed_manuscript_content(): void
    {
        config()->set('researchnav.similarity.fasttext_model_path', '');
        config()->set('researchnav.similarity.python_binary', 'python');
        $contentMatch = $this->archivedPublic('Unrelated Archived Title');
        $titleOnly = $this->archivedPublic('Unrelated Accounting Study');
        $bodyText = 'Artificial intelligence supports education research.';
        ManuscriptSearchDocument::query()->create([
            'research_document_id' => $contentMatch->id,
            'body_text' => $bodyText,
            'body_text_bytes' => strlen($bodyText),
            'body_text_chars' => mb_strlen($bodyText),
            'extraction_status' => 'ready',
            'source_sha256' => str_repeat('b', 64),
            'extractor_version' => config('researchnav.manuscript_search.extractor_version'),
        ]);

        $response = $this->postJson('/api/repository/similarity', [
            'q' => 'education or artificial intelligence',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.0.id', $contentMatch->id)
            ->assertJsonPath('data.0.matched_terms', ['artificial', 'education', 'intelligence'])
            ->assertJsonMissing(['id' => $titleOnly->id])
            ->assertJsonCount(1, 'data');
        $this->assertGreaterThan(0, (float) $response->json('data.0.overall_similarity_score'));
        $this->assertSame('0.000000000000', $response->json('data.0.title_similarity_score'));
        $this->assertGreaterThan(0, (float) $response->json('data.0.query_content_similarity_score'));
        $this->assertSame('0.700000000000', $response->json('data.0.content_weight'));
    }

    public function test_query_treats_malformed_or_stale_ready_projection_provenance_as_unavailable(): void
    {
        foreach ([
            ['source_sha256' => strtoupper(str_repeat('a', 64)), 'extractor_version' => config('researchnav.manuscript_search.extractor_version')],
            ['source_sha256' => str_repeat('b', 64), 'extractor_version' => 'manuscript-text/stale'],
        ] as $provenance) {
            $candidate = $this->archivedPublic('Provenance guarded title '.count(ManuscriptSearchDocument::all()));
            ManuscriptSearchDocument::query()->create([
                'research_document_id' => $candidate->id, 'body_text' => 'guarded manuscript content',
                'extraction_status' => 'ready', ...$provenance,
            ]);
        }

        $response = $this->postJson('/api/repository/similarity', ['q' => 'Provenance guarded title']);

        $response->assertOk()->assertJsonCount(2, 'data');
        foreach ($response->json('data') as $result) {
            $this->assertNull($result['content_similarity_score']);
            $this->assertNull($result['overall_similarity_score']);
            $this->assertSame('content_unavailable', $result['score_status']);
        }
    }

    public function test_query_fails_without_truncating_when_the_configured_candidate_limit_is_exceeded(): void
    {
        config()->set('researchnav.similarity.maximum_candidates', 2);
        $this->archivedPublic('First');
        $this->archivedPublic('Second');
        $this->archivedPublic('Third');

        $this->postJson('/api/repository/similarity', ['q' => 'query'])
            ->assertStatus(503)
            ->assertExactJson(['error' => 'SIMILARITY_CAPACITY_EXCEEDED']);
    }

    public function test_query_rejects_results_when_a_candidate_leaves_the_public_catalog_during_scoring(): void
    {
        $candidate = $this->archivedPublic('Candidate');
        $this->app->instance(SimilarityProcessRunner::class, new class($candidate) extends SimilarityProcessRunner
        {
            public function __construct(private readonly ResearchDocument $candidate) {}

            public function runQuery(string $query, Collection $candidates): array
            {
                $this->candidate->update(['visibility' => 'private']);

                return $candidates->map(fn (ResearchDocument $candidate): array => [
                    'matched_research_id' => $candidate->id,
                    'query_title_similarity_score' => '0.500000',
                    'query_title_similarity_percentage' => '50.000000',
                    'query_content_similarity_score' => '0.500000',
                    'query_content_similarity_percentage' => '50.000000',
                    'query_similarity_score' => '0.500000',
                    'query_similarity_percentage' => '50.000000',
                    'matched_terms' => [],
                    'fasttext_support_score' => null,
                ])->all();
            }
        });

        $this->postJson('/api/repository/similarity', ['q' => 'query'])
            ->assertStatus(409)
            ->assertExactJson(['error' => 'SIMILARITY_CATALOG_CHANGED']);
    }

    public function test_query_rejects_a_candidate_projection_change_before_the_public_response(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        $candidate = $this->archivedPublic('Candidate query');
        ManuscriptSearchDocument::query()->create([
            'research_document_id' => $candidate->id, 'body_text' => 'candidate query body',
            'body_text_bytes' => 20, 'body_text_chars' => 20, 'extraction_status' => 'ready',
            'source_sha256' => str_repeat('a', 64), 'extractor_version' => config('researchnav.manuscript_search.extractor_version'),
        ]);
        $this->app->instance(SimilarityProcessRunner::class, new class($candidate) extends SimilarityProcessRunner
        {
            public function __construct(private readonly ResearchDocument $candidate)
            {
                parent::__construct();
            }

            public function runQuery(string $query, Collection $candidates): array
            {
                ManuscriptSearchDocument::query()->where('research_document_id', $this->candidate->id)
                    ->update(['body_text' => 'changed projection body']);

                return parent::runQuery($query, $candidates);
            }
        });

        $this->postJson('/api/repository/similarity', ['q' => 'Candidate query'])
            ->assertStatus(409)
            ->assertExactJson(['error' => 'SIMILARITY_CATALOG_CHANGED']);
    }

    public function test_query_rejects_a_current_projection_that_becomes_stale_during_scoring(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        $candidate = $this->archivedPublic('Candidate provenance query');
        ManuscriptSearchDocument::query()->create([
            'research_document_id' => $candidate->id, 'body_text' => 'candidate provenance body',
            'body_text_bytes' => 25, 'body_text_chars' => 25, 'extraction_status' => 'ready',
            'source_sha256' => str_repeat('a', 64), 'extractor_version' => config('researchnav.manuscript_search.extractor_version'),
        ]);
        $this->app->instance(SimilarityProcessRunner::class, new class($candidate) extends SimilarityProcessRunner
        {
            public function __construct(private readonly ResearchDocument $candidate)
            {
                parent::__construct();
            }

            public function runQuery(string $query, Collection $candidates): array
            {
                $results = parent::runQuery($query, $candidates);
                ManuscriptSearchDocument::query()->where('research_document_id', $this->candidate->id)
                    ->update(['extractor_version' => 'manuscript-text/stale']);

                return $results;
            }
        });

        $this->postJson('/api/repository/similarity', ['q' => 'Candidate provenance query'])
            ->assertStatus(409)
            ->assertExactJson(['error' => 'SIMILARITY_CATALOG_CHANGED']);
    }

    public function test_query_rate_limits_by_trusted_ip_per_minute_and_hour(): void
    {
        $this->archivedPublic('Candidate');
        $this->useTestWorker();

        $this->postJson('/api/repository/similarity', ['q' => 'query'])->assertOk();
        $this->postJson('/api/repository/similarity', ['q' => 'query'])->assertOk();
        $this->postJson('/api/repository/similarity', ['q' => 'query'])
            ->assertStatus(429)
            ->assertExactJson(['error' => 'RATE_LIMIT_EXCEEDED']);

        $this->travel(1)->minute();
        foreach (range(1, 18) as $request) {
            $this->postJson('/api/repository/similarity', ['q' => 'query'])->assertOk();
            $this->travel(1)->minute();
        }
        $this->postJson('/api/repository/similarity', ['q' => 'query'])
            ->assertStatus(429)
            ->assertExactJson(['error' => 'RATE_LIMIT_EXCEEDED']);
    }

    public function test_query_worker_cannot_receive_laravel_secrets(): void
    {
        $this->archivedPublic('Candidate');
        $this->useTestWorker();
        putenv('TEST_SECRET=Laravel-secret');
        $_ENV['TEST_SECRET'] = 'Laravel-secret';
        $_SERVER['TEST_SECRET'] = 'Laravel-secret';

        try {
            $this->postJson('/api/repository/similarity', ['q' => 'query'])
                ->assertOk()
                ->assertExactJson(['data' => []]);
        } finally {
            putenv('TEST_SECRET');
            unset($_ENV['TEST_SECRET'], $_SERVER['TEST_SECRET']);
        }
    }

    private function archivedPublic(string $title): ResearchDocument
    {
        return $this->document([
            'title' => $title,
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
        ]);
    }

    /** @param array<string, mixed> $attributes */
    private function document(array $attributes = []): ResearchDocument
    {
        $category = Category::query()->first() ?? Category::query()->create(['name' => 'Similarity', 'slug' => 'similarity']);
        $user = User::factory()->create();

        return ResearchDocument::factory()->create(array_merge([
            'category_id' => $category->id,
            'submitted_by' => $user->id,
        ], $attributes));
    }

    private function useTestWorker(): void
    {
        config()->set('researchnav.similarity.python_binary', PHP_BINARY);
        config()->set('researchnav.similarity.cli_path', base_path('tests/Fixtures/similarity_worker.php'));
        $this->app->forgetInstance(SimilarityProcessRunner::class);
    }
}
