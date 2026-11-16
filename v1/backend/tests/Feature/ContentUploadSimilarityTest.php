<?php

namespace Tests\Feature;

use App\Models\ManuscriptSearchDocument;
use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\ManuscriptTextExtractionException;
use App\Services\ManuscriptTextExtractor;
use App\Services\ManuscriptSearchProjectionService;
use App\Services\SimilarityProcessRunner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Mockery;
use Tests\TestCase;

class ContentUploadSimilarityTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('researchnav.similarity.python_binary', PHP_BINARY);
        config()->set('researchnav.similarity.cli_path', base_path('tests/Fixtures/similarity_worker.php'));
        File::deleteDirectory($this->uploadRoot());
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->uploadRoot());
        parent::tearDown();
    }

    public function test_it_requires_an_authenticated_active_account(): void
    {
        $this->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertUnauthorized()->assertExactJson([
            'error' => 'AUTHENTICATION_REQUIRED',
        ]);

        $blocked = User::factory()->create(['role' => 'researcher', 'access_status' => 'blocked']);
        $this->as($blocked)->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertForbidden()->assertExactJson([
            'error' => 'ACCOUNT_ACCESS_PENDING',
        ]);
    }

    public function test_it_restricts_content_upload_to_authorized_roles(): void
    {
        $this->as(User::factory()->create(['role' => 'panel', 'access_status' => 'active']))
            ->post('/api/similarity/content-upload', ['file' => $this->pdf()], $this->origin())
            ->assertForbidden();
    }

    public function test_it_extracts_and_compares_a_temporary_upload_without_persisting_it(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->withArgs(function (string $path): bool {
            return File::exists($path)
                && str_ends_with(str_replace('\\', '/', $path), '/upload-0.pdf')
                && str_contains(str_replace('\\', '/', $path), '/storage/app/private/similarity-content-upload/');
        })->andReturn("CHAPTER 1\nmachine learning student performance prediction");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk()
            ->assertJsonPath('contract_version', 'content-upload.v2')
            ->assertJsonPath('data', [])
            ->assertJsonPath('file_name', 'manuscript.pdf')
            ->assertJsonPath('file_diagnostics.0.status', 'included')
            ->assertJsonPath('extracted_text', "CHAPTER 1\nmachine learning student performance prediction");

        $this->assertSame([], File::directories($this->uploadRoot()));
        $this->assertDatabaseCount('similarity_results', 0);
        $this->assertDatabaseCount('document_files', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_it_returns_and_scores_the_same_layout_preserving_extraction(): void
    {
        $raw = "TITLE\n\n        A Research Proposal\n\nCHAPTER 1\nBody text";
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn($raw);
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin());

        $response->assertOk()
            ->assertJsonPath('file_diagnostics.0.text_length', strlen($raw))
            ->assertJsonPath('file_diagnostics.0.detected_chapters.0', 1)
            ->assertJsonPath('extracted_text', $raw);
    }

    public function test_it_reserves_one_hundred_percent_for_exact_extracted_upload_text(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', app_path('Services/similarity/cli.py'));
        $exactText = "CHAPTER 1\nExact extracted manuscript body";
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn($exactText);
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $exact = $this->publicCandidate();
        $this->trustedProjection($exact, $exactText);

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin());

        $response->assertOk()
            ->assertJsonPath('data.0.id', $exact->id)
            ->assertJsonPath('data.0.content_similarity_score', '1.000000000000')
            ->assertJsonPath('data.0.content_similarity_percentage', '100.000000000000');
    }

    public function test_it_uses_current_exact_repository_file_when_the_ready_projection_points_to_a_cover(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', base_path('app/Services/similarity/cli.py'));
        $research = $this->publicCandidate();
        $contentHash = hash('sha256', 'content pdf bytes');
        $coverHash = hash('sha256', 'cover pdf bytes');
        $content = DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $research->submitted_by,
            'uploaded_at' => now(),
            'original_filename' => 'content.pdf',
            'stored_filename' => 'content.pdf',
            'file_path' => 'research/'.$research->id.'/content.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 100,
            'document_type' => 'final_manuscript',
            'version_number' => 2,
            'is_current' => true,
            'file_order' => 1,
            'content_sha256' => $contentHash,
        ]);
        $cover = DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $research->submitted_by,
            'uploaded_at' => now(),
            'original_filename' => 'cover.pdf',
            'stored_filename' => 'cover.pdf',
            'file_path' => 'research/'.$research->id.'/cover.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 100,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'is_current' => true,
            'file_order' => 2,
            'content_sha256' => $coverHash,
        ]);
        $research->manuscriptSearchDocument()->create([
            'source_document_file_id' => $cover->id,
            'source_kind' => 'final_manuscript',
            'source_extension' => 'pdf',
            'source_sha256' => $coverHash,
            'source_size_bytes' => 100,
            'body_text' => 'Cover text only',
            'body_text_bytes' => 15,
            'body_text_chars' => 15,
            'extraction_status' => 'ready',
            'extractor_version' => config('researchnav.manuscript_search.extractor_version'),
        ]);
        $this->mock(ManuscriptSearchProjectionService::class)
            ->shouldReceive('hasCurrentSourceHash')->once()->with(Mockery::type(ResearchDocument::class), [$contentHash])->andReturnTrue()
            ->shouldReceive('isCurrentReadyProjection')->once()->andReturnFalse()
            ->shouldReceive('currentCanonicalText')->once()->andReturn("CHAPTER 1\nExact manuscript body");

        $results = app(SimilarityProcessRunner::class)->runUploadedContentQuery(
            "CHAPTER 1\nExact manuscript body",
            collect([$research->load(['files', 'manuscriptSearchDocument'])]),
            [$contentHash],
        );

        $this->assertSame('1.000000000000', $results[0]['content_similarity_score']);
        $this->assertSame($content->id, $research->files->firstWhere('content_sha256', $contentHash)->id);
    }

    public function test_it_orders_and_combines_a_folder_of_pdf_parts(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()->andReturn(
            "CHAPTER 1\nBody text",
            'Cover page',
        );
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'mode' => 'folder',
            'files' => [
                UploadedFile::fake()->createWithContent('chapter-1.pdf', '%PDF-chapter'),
                UploadedFile::fake()->createWithContent('00-cover.pdf', '%PDF-cover'),
            ],
        ], $this->origin());

        $response->assertOk()
            ->assertJsonPath('file_name', '2 PDF files')
            ->assertJsonPath('file_diagnostics.0.status', 'included')
            ->assertJsonPath('file_diagnostics.1.status', 'excluded')
            ->assertJsonPath('file_diagnostics.1.reason', 'supporting_document')
            ->assertJsonPath('extracted_text', "CHAPTER 1\nBody text");
    }

    public function test_it_returns_a_sanitized_error_and_cleans_up_an_unreadable_upload(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andThrow(
            new ManuscriptTextExtractionException('private parser detail'),
        );
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertUnprocessable()->assertExactJson([
            'error' => 'CONTENT_UPLOAD_UNREADABLE',
        ])->assertDontSee('private parser detail');

        $this->assertSame([], File::directories($this->uploadRoot()));
    }

    public function test_it_does_not_retain_extracted_text_between_requests(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()
            ->andReturn("CHAPTER 1\nmachine learning student performance prediction");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);
        $user = $this->researcher();

        $this->as($user)->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk();
        $this->as($user)->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk();

        $this->assertSame([], File::directories($this->uploadRoot()));
    }

    public function test_it_does_not_share_cached_text_between_different_uploads(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()
            ->andReturn("CHAPTER 1\nfirst extracted manuscript", "CHAPTER 1\nsecond extracted manuscript");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);
        $user = $this->researcher();

        $this->as($user)->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk();
        $this->as($user)->post('/api/similarity/content-upload', [
            'file' => UploadedFile::fake()->createWithContent('other.pdf', "%PDF-1.4\n2 0 obj\n"),
        ], $this->origin())->assertOk();
    }

    public function test_it_does_not_cache_failed_extraction(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andThrow(
            new ManuscriptTextExtractionException('temporary parser failure'),
        );
        $extractor->shouldReceive('extractRaw')->once()->andReturn("CHAPTER 1\nsuccessful retry text");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);
        $user = $this->researcher();

        $this->as($user)->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertUnprocessable();
        $this->as($user)->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk();
    }

    public function test_it_processes_later_chapter_one_and_skips_an_unreadable_sibling(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn("CHAPTER 2\nSecond chapter body");
        $extractor->shouldReceive('extractRaw')->once()->andThrow(new ManuscriptTextExtractionException('corrupt pdf'));
        $extractor->shouldReceive('extractRaw')->once()->andReturn("CHAPTER I\nFirst chapter body");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'mode' => 'folder',
            'files' => [
                UploadedFile::fake()->createWithContent('chapter-2.pdf', '%PDF-two'),
                UploadedFile::fake()->createWithContent('minutes.pdf', '%PDF-bad'),
                UploadedFile::fake()->createWithContent('chapter-1.pdf', '%PDF-one'),
            ],
        ], $this->origin());

        $response->assertOk()
            ->assertJsonPath('file_diagnostics.0.detected_chapters.0', 2)
            ->assertJsonPath('file_diagnostics.1.status', 'error')
            ->assertJsonPath('file_diagnostics.1.reason', 'extraction_failed')
            ->assertJsonPath('file_diagnostics.2.detected_chapters.0', 1);
    }

    public function test_it_excludes_duplicate_chapter_files_when_a_full_manuscript_exists(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()->andReturn(
            "CHAPTER 1\nFull first\nCHAPTER 2\nFull second",
            "CHAPTER 1\nSeparate first",
        );
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'mode' => 'folder',
            'files' => [
                UploadedFile::fake()->createWithContent('full.pdf', '%PDF-full'),
                UploadedFile::fake()->createWithContent('chapter-1.pdf', '%PDF-chapter'),
            ],
        ], $this->origin());

        $response->assertOk()
            ->assertJsonPath('file_diagnostics.0.status', 'included')
            ->assertJsonPath('file_diagnostics.1.status', 'excluded')
            ->assertJsonPath('file_diagnostics.1.reason', 'covered_by_canonical_manuscript');
    }

    public function test_it_appends_a_separate_later_chapter_not_covered_by_the_primary_manuscript(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()->andReturn(
            "CHAPTER 1\nIntroduction\nCHAPTER 2\nMethods",
            "CHAPTER 3\nResults",
        );
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'mode' => 'folder',
            'files' => [
                UploadedFile::fake()->createWithContent('chapters-1-2.pdf', '%PDF-primary'),
                UploadedFile::fake()->createWithContent('chapter-3.pdf', '%PDF-later'),
            ],
        ], $this->origin());

        $response->assertOk()
            ->assertJsonPath('file_diagnostics.0.status', 'included')
            ->assertJsonPath('file_diagnostics.1.status', 'included')
            ->assertJsonPath('extracted_text', "CHAPTER 1\nIntroduction\nCHAPTER 2\nMethods\n\nCHAPTER 3\nResults");
    }

    public function test_it_detects_chapters_after_five_without_truncating_the_manuscript(): void
    {
        $text = "CHAPTER I\nIntroduction\nCHAPTER V\nFindings\nCHAPTER VI\nAppendix analysis";
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn($text);
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk()
            ->assertJsonPath('file_diagnostics.0.detected_chapters', [1, 5, 6])
            ->assertJsonPath('extracted_text', $text);
    }

    public function test_it_accepts_centered_title_case_chapter_headings_like_vsr(): void
    {
        $this->mock(ManuscriptTextExtractor::class)->shouldReceive('extractRaw')->once()->andReturn(
            "Front matter\nChapter 1\nIntroduction\n                                Chapter 2\nReview\n"
            ."                               Chapter 3\nMethods\n                               Chapter 4\nCost\n"
            ."                               Chapter 5\nResults",
        );

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin());

        $response->assertOk()->assertJsonPath('file_diagnostics.0.detected_chapters', [1, 2, 3, 4, 5]);
    }

    public function test_it_accepts_tsapter_headings_for_filipino_manuscripts(): void
    {
        $this->mock(ManuscriptTextExtractor::class)->shouldReceive('extractRaw')->once()->andReturn(
            "TALAAN NG NILALAMAN\nTSAPTER I\nPanimula\nTSAPTER II\nKaugnay na Literatura\n"
            ."TSAPTER III\nPamamaraan\nTSAPTER IV\nResulta at Talakayan\nTSAPTER V\nKonklusyon",
        );

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin());

        $response->assertOk()->assertJsonPath('file_diagnostics.0.detected_chapters', [1, 2, 3, 4, 5]);
    }

    public function test_it_rejects_unsupported_and_unexpected_fields(): void
    {
        $user = $this->researcher();

        $this->as($user)->post('/api/similarity/content-upload', [
            'file' => UploadedFile::fake()->createWithContent('notes.txt', 'plain text'),
        ], $this->origin())->assertUnprocessable()->assertJsonValidationErrors('file');

        $this->as($user)->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
            'unexpected' => 'value',
        ], $this->origin())->assertUnprocessable()->assertJsonValidationErrors('unexpected');
    }

    public function test_it_rejects_docx_uploads(): void
    {
        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => UploadedFile::fake()->create('manuscript.docx', 10, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        ], $this->origin())->assertUnprocessable()->assertJsonValidationErrors('file');
    }

    public function test_it_uses_chapter_scoped_trusted_public_projections_and_returns_the_positive_top_ten(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', base_path('app/Services/similarity/cli.py'));
        config()->set('researchnav.similarity.fasttext_model_path', '');
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn("Cover\nCHAPTER 1\nShared body\nREFERENCES\nUpload only");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $eligible = collect(range(1, 10))->map(function (int $index): ResearchDocument {
            $research = $this->publicCandidate($index === 1 ? 'approved' : 'archived');
            $this->trustedProjection($research, "Different front\nCHAPTER 1\nShared body\nAPPENDIX\nCandidate {$index}");

            return $research;
        });
        $outsideTopTen = $this->publicCandidate();
        $this->trustedProjection($outsideTopTen, "CHAPTER 1\nShared body");
        $noScope = $this->publicCandidate();
        $this->trustedProjection($noScope, 'Abstract text without a chapter heading');
        $private = $this->publicCandidate();
        $private->update(['visibility' => 'private']);
        $this->trustedProjection($private, "CHAPTER 1\nShared body");
        $stale = $this->publicCandidate();
        $this->trustedProjection($stale, "CHAPTER 1\nShared body", 'stale-extractor');

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin());

        $response->assertOk()->assertJsonCount(10, 'data');
        $ids = collect($response->json('data'))->pluck('id')->map(fn ($id): int => (int) $id)->all();
        $this->assertSame($outsideTopTen->id, $ids[0]);
        $this->assertCount(9, array_intersect($eligible->pluck('id')->all(), $ids));
        $this->assertNotContains($noScope->id, $ids);
        $this->assertNotContains($private->id, $ids);
        $this->assertNotContains($stale->id, $ids);
        $scores = collect($response->json('data'))->pluck('content_similarity_score')->map(fn (string $score): float => (float) $score)->all();
        $this->assertSame($scores, collect($scores)->sortDesc()->values()->all());
        $this->assertLessThan(1, $scores[0]);
        $this->assertNull($response->json('data.0.fasttext_support_score'));
    }

    public function test_it_maps_a_worker_chapter_scope_error_to_a_sanitized_unprocessable_response(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', base_path('app/Services/similarity/cli.py'));
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn('Cover page without a chapter heading');
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertUnprocessable()->assertExactJson([
            'error' => 'CONTENT_UPLOAD_INVALID_SCOPE',
        ]);
    }

    public function test_it_scores_a_scoped_candidate_corpus_without_a_legacy_corpus_capacity_error(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', app_path('Services/similarity/cli.py'));
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn("CHAPTER 1\nA safely scoped upload body");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $candidate = $this->publicCandidate();
        $this->trustedProjection($candidate, "CHAPTER 1\nA safely scoped candidate body");

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_it_skips_invalid_candidates_in_a_single_bounded_upload_score(): void
    {
        config()->set('researchnav.similarity.maximum_candidates', 1000);
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', app_path('Services/similarity/cli.py'));
        config()->set('researchnav.similarity.fasttext_model_path', '');
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->twice()->andReturn("CHAPTER 1\nShared body");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $invalid = $this->publicCandidate();
        $this->trustedProjection($invalid, 'Trusted text without a chapter heading');
        $valid = $this->publicCandidate();
        $this->trustedProjection($valid, "CHAPTER 1\nShared body");

        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin());

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame($valid->id, $response->json('data.0.id'));

        $another = $this->publicCandidate();
        $this->trustedProjection($another, "CHAPTER 1\nAnother comparable body");
        $response = $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin());
        $response->assertOk()->assertJsonCount(2, 'data');
        $this->assertSame([$valid->id, $another->id], collect($response->json('data'))->pluck('id')->all());
    }

    public function test_it_maps_a_worker_capacity_error_to_a_sanitized_service_unavailable_response(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn("CHAPTER 1\nWORKER_CAPACITY");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertStatus(503)->assertExactJson([
            'error' => 'SIMILARITY_CAPACITY_EXCEEDED',
        ]);
    }

    public function test_it_rejects_a_truncated_uploaded_content_catalog(): void
    {
        config()->set('researchnav.similarity.maximum_candidates', 1);
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn("CHAPTER 1\nShared body");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $this->trustedProjection($this->publicCandidate(), "CHAPTER 1\nShared body");
        $this->trustedProjection($this->publicCandidate(), "CHAPTER 1\nAnother body");

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertStatus(503)->assertExactJson([
            'error' => 'SIMILARITY_CAPACITY_EXCEEDED',
        ]);
    }

    public function test_it_excludes_a_projection_with_a_non_hex_source_hash(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', app_path('Services/similarity/cli.py'));
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn("CHAPTER 1\nShared body");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $research = $this->publicCandidate();
        $this->trustedProjection($research, "CHAPTER 1\nShared body");
        $research->manuscriptSearchDocument()->update(['source_sha256' => str_repeat('z', 64)]);

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk()->assertJsonPath('data', []);
    }

    public function test_it_excludes_a_whitespace_only_projection_without_a_false_catalog_change(): void
    {
        config()->set('researchnav.similarity.python_binary', 'python');
        config()->set('researchnav.similarity.cli_path', app_path('Services/similarity/cli.py'));
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extractRaw')->once()->andReturn("CHAPTER 1\nShared body");
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $this->trustedProjection($this->publicCandidate(), "\t\n");

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk()->assertJsonPath('data', []);
    }

    private function pdf(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('manuscript.pdf', "%PDF-1.4\n1 0 obj\n");
    }

    private function researcher(): User
    {
        return User::factory()->create(['role' => 'researcher', 'access_status' => 'active']);
    }

    private function publicCandidate(string $submissionStatus = 'archived'): ResearchDocument
    {
        return ResearchDocument::factory()->create([
            'submitted_by' => User::factory()->create()->id,
            'submission_status' => $submissionStatus,
            'archive_status' => 'archived',
            'visibility' => 'public',
        ]);
    }

    private function trustedProjection(ResearchDocument $research, string $body, ?string $version = null): void
    {
        ManuscriptSearchDocument::query()->create([
            'research_document_id' => $research->id,
            'body_text' => $body,
            'body_text_bytes' => strlen($body),
            'body_text_chars' => mb_strlen($body),
            'extraction_status' => 'ready',
            'source_sha256' => str_repeat('a', 64),
            'extractor_version' => $version ?? config('researchnav.manuscript_search.extractor_version'),
        ]);
    }

    private function as(User $user): static
    {
        return $this->withSession(['user_id' => $user->id]);
    }

    /** @return array<string, string> */
    private function origin(): array
    {
        return ['Origin' => 'http://localhost:5173'];
    }

    private function uploadRoot(): string
    {
        return storage_path('app/private/similarity-content-upload');
    }
}
