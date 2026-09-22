<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ManuscriptTextExtractionException;
use App\Services\ManuscriptTextExtractor;
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

    public function test_it_extracts_and_compares_a_temporary_upload_without_persisting_it(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->withArgs(function (string $path): bool {
            return File::exists($path)
                && str_ends_with(str_replace('\\', '/', $path), '/upload.pdf')
                && str_contains(str_replace('\\', '/', $path), '/storage/app/private/similarity-content-upload/');
        })->andReturn('machine learning student performance prediction');
        $this->app->instance(ManuscriptTextExtractor::class, $extractor);

        $this->as($this->researcher())->post('/api/similarity/content-upload', [
            'file' => $this->pdf(),
        ], $this->origin())->assertOk()->assertExactJson(['data' => []]);

        $this->assertSame([], File::directories($this->uploadRoot()));
        $this->assertDatabaseCount('similarity_results', 0);
        $this->assertDatabaseCount('document_files', 0);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_it_returns_a_sanitized_error_and_cleans_up_an_unreadable_upload(): void
    {
        $extractor = Mockery::mock(ManuscriptTextExtractor::class);
        $extractor->shouldReceive('extract')->once()->andThrow(
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

    private function pdf(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('manuscript.pdf', "%PDF-1.4\n1 0 obj\n");
    }

    private function researcher(): User
    {
        return User::factory()->create(['role' => 'researcher', 'access_status' => 'active']);
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
