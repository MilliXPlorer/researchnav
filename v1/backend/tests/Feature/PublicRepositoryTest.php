<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\DocumentFile;
use App\Models\ManuscriptSdgClassification;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicRepositoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_is_sessionless_and_returns_only_archived_public_non_deleted_records(): void
    {
        config()->set('session.driver', 'database');
        $category = $this->category('Public');
        $archived = $this->document($category, ['title' => 'Archived Public', 'submission_status' => 'archived']);
        $approved = $this->document($category, ['title' => 'Approved Public', 'submission_status' => 'approved']);
        $this->document($category, ['title' => 'Draft Private', 'submission_status' => 'draft', 'archive_status' => 'not_archived', 'visibility' => 'private']);
        $this->document($category, ['title' => 'Under Review', 'submission_status' => 'under_review', 'archive_status' => 'not_archived', 'visibility' => 'private']);
        $this->document($category, ['title' => 'Approved Unarchived', 'submission_status' => 'approved', 'archive_status' => 'not_archived']);
        $this->document($category, ['title' => 'Registered Only', 'visibility' => 'registered_only']);
        $deleted = $this->document($category, ['title' => 'Deleted Public']);
        $deleted->delete();

        $response = $this->getJson('/api/repository')
            ->assertOk()
            ->assertCookieMissing('researchnav_sid')
            ->assertJsonCount(2, 'data');

        $this->assertSame([$approved->id, $archived->id], collect($response->json('data'))->pluck('id')->all());
        $this->assertDatabaseCount('sessions', 0);
    }

    public function test_index_searches_title_abstract_keywords_and_authors(): void
    {
        $category = $this->category('Computing');
        $title = $this->document($category, ['title' => 'Climate Resilience']);
        $abstract = $this->document($category, ['title' => 'Water Systems', 'abstract' => 'A climate adaptation study.']);
        $keywords = $this->document($category, ['title' => 'Community Planning', 'keywords' => 'climate, policy']);
        $author = $this->document($category, ['title' => 'Coastal Mapping']);
        ResearchAuthor::factory()->create(['research_document_id' => $author->id, 'author_name' => 'Climate Santos']);
        $this->document($category, ['title' => 'Quantum Computing', 'abstract' => 'Unrelated', 'keywords' => 'qubits']);

        $response = $this->getJson('/api/repository?q=climate')->assertOk()->assertJsonCount(4, 'data');

        $this->assertEqualsCanonicalizing(
            [$title->id, $abstract->id, $keywords->id, $author->id],
            collect($response->json('data'))->pluck('id')->all(),
        );
    }

    public function test_index_escapes_like_wildcards_in_literal_searches(): void
    {
        $category = $this->category('Energy');
        $percent = $this->document($category, ['title' => '100% Renewable Energy']);
        $underscore = $this->document($category, ['title' => 'Project_A Research']);
        $this->document($category, ['title' => '1000 Renewable Energy']);
        $this->document($category, ['title' => 'Project XA Research']);

        $this->getJson('/api/repository?q=100%')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $percent->id);

        $this->getJson('/api/repository?q=Project_A')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $underscore->id);
    }

    public function test_index_combines_author_keyword_category_and_year_filters(): void
    {
        $computing = $this->category('Computing');
        $health = $this->category('Health');
        $match = $this->document($computing, [
            'title' => 'Target Study',
            'keywords' => 'machine learning, education',
            'publication_year' => 2025,
        ]);
        ResearchAuthor::factory()->create(['research_document_id' => $match->id, 'author_name' => 'Ada Rivera']);

        $wrongYear = $this->document($computing, ['title' => 'Wrong Year', 'keywords' => 'machine learning', 'publication_year' => 2024]);
        ResearchAuthor::factory()->create(['research_document_id' => $wrongYear->id, 'author_name' => 'Ada Rivera']);
        $wrongCategory = $this->document($health, ['title' => 'Wrong Category', 'keywords' => 'machine learning', 'publication_year' => 2025]);
        ResearchAuthor::factory()->create(['research_document_id' => $wrongCategory->id, 'author_name' => 'Ada Rivera']);

        $this->getJson('/api/repository?author=Ada&keywords=machine&category=computing&year=2025')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $match->id);

        $this->getJson('/api/repository?category_id='.$computing->id.'&publication_year=2025')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $match->id);
    }

    public function test_index_filters_public_research_by_inclusive_year_range(): void
    {
        $category = $this->category('Range');
        $older = $this->document($category, ['title' => 'Older', 'publication_year' => 2021]);
        $firstMatch = $this->document($category, ['title' => 'First match', 'publication_year' => 2022]);
        $lastMatch = $this->document($category, ['title' => 'Last match', 'publication_year' => 2024]);
        $newer = $this->document($category, ['title' => 'Newer', 'publication_year' => 2025]);

        $response = $this->getJson('/api/repository?year_from=2022&year_to=2024')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->assertEqualsCanonicalizing(
            [$firstMatch->id, $lastMatch->id],
            collect($response->json('data'))->pluck('id')->all(),
        );
        $this->assertNotContains($older->id, collect($response->json('data'))->pluck('id')->all());
        $this->assertNotContains($newer->id, collect($response->json('data'))->pluck('id')->all());

        $this->getJson('/api/repository?year_from=2024')
            ->assertOk()
            ->assertJsonCount(2, 'data');
        $this->getJson('/api/repository?year_to=2022')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->getJson('/api/repository?year_from=2024&year_to=2022')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['year_from', 'year_to']);
    }

    public function test_index_filters_only_public_documents_with_a_current_ready_sdg_classification(): void
    {
        $category = $this->category('SDG');
        $match = $this->document($category, ['title' => 'Current SDG match']);
        $staleProjection = $this->document($category, ['title' => 'Stale projection']);
        $staleVersion = $this->document($category, ['title' => 'Stale detector']);
        $notReady = $this->document($category, ['title' => 'Not ready']);
        $private = $this->document($category, ['title' => 'Private SDG match', 'visibility' => 'private']);

        $this->classification($this->projection($match), 4);
        $this->classification($this->projection($staleProjection), 4, now()->subSecond());
        $this->classification($this->projection($staleVersion), 4, null, 'sdg-declaration/older');
        $this->classification($this->projection($notReady, 'failed'), 4);
        $this->classification($this->projection($private), 4);

        $response = $this->getJson('/api/repository?sdg=4')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $match->id);

        $response->assertJsonMissingPath('data.0.sdg')
            ->assertJsonMissingPath('data.0.sdgs');
    }

    public function test_index_orders_and_paginates_by_year_then_title(): void
    {
        $category = $this->category('Ordering');
        $alpha = $this->document($category, ['title' => 'Alpha', 'publication_year' => 2025]);
        $beta = $this->document($category, ['title' => 'Beta', 'publication_year' => 2025]);
        $older = $this->document($category, ['title' => 'Older', 'publication_year' => 2024]);

        $first = $this->getJson('/api/repository?per_page=2&page=1')
            ->assertOk()
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonPath('meta.total', 3);
        $this->assertSame([$alpha->id, $beta->id], collect($first->json('data'))->pluck('id')->all());

        $this->getJson('/api/repository?per_page=2&page=2')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $older->id)
            ->assertJsonPath('meta.current_page', 2);
    }

    public function test_show_returns_public_metadata_without_internal_identity_or_import_fields(): void
    {
        $category = $this->category('Privacy');
        $document = $this->document($category, [
            'title' => 'Public Detail',
            'import_source_sha256' => str_repeat('a', 64),
            'import_source_filename' => 'private-source.docx',
        ]);
        $linkedUser = User::factory()->create();
        ResearchAuthor::factory()->create([
            'research_document_id' => $document->id,
            'user_id' => $linkedUser->id,
            'author_name' => 'Public Author',
        ]);

        $response = $this->getJson('/api/repository/'.$document->id)
            ->assertOk()
            ->assertJsonPath('data.title', 'Public Detail')
            ->assertJsonPath('data.category.slug', 'privacy')
            ->assertJsonPath('data.authors.0.author_name', 'Public Author');

        foreach (['submitted_by', 'section_id', 'submission_status', 'archive_status', 'visibility', 'deleted_at', 'import_source_sha256', 'import_source_filename'] as $field) {
            $response->assertJsonMissingPath('data.'.$field);
        }
        $response->assertJsonMissingPath('data.authors.0.id')
            ->assertJsonMissingPath('data.authors.0.user_id');
    }

    public function test_index_reports_a_current_final_manuscript_as_downloadable(): void
    {
        $category = $this->category('Files');
        $document = $this->document($category, ['title' => 'Available manuscript']);
        DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $document->submitted_by,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'manuscript.pdf',
            'stored_filename' => 'manuscript.pdf',
            'file_path' => 'research/'.$document->id.'/manuscript.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 100,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);

        $this->getJson('/api/repository')
            ->assertOk()
            ->assertJsonPath('data.0.has_downloadable_manuscript', true);
    }

    public function test_show_returns_not_found_for_non_public_or_deleted_documents(): void
    {
        $category = $this->category('Hidden');
        $private = $this->document($category, ['visibility' => 'private']);
        $unarchived = $this->document($category, ['archive_status' => 'not_archived']);
        $deleted = $this->document($category);
        $deleted->delete();

        foreach ([$private->id, $unarchived->id, $deleted->id, 999999] as $id) {
            $this->getJson('/api/repository/'.$id)
                ->assertNotFound()
                ->assertExactJson(['error' => 'NOT_FOUND']);
        }
    }

    public function test_index_rejects_invalid_filters(): void
    {
        foreach ([
            '/api/repository?per_page=0',
            '/api/repository?per_page=51',
            '/api/repository?year=1900',
            '/api/repository?publication_year=2156',
            '/api/repository?category_id=999999',
            '/api/repository?sdg=0',
            '/api/repository?sdg=18',
            '/api/repository?q='.str_repeat('x', 201),
        ] as $path) {
            $this->getJson($path)->assertUnprocessable()->assertJsonPath('error', 'VALIDATION_FAILED');
        }
    }

    private function category(string $name): Category
    {
        return Category::query()->create(['name' => $name, 'slug' => str($name)->slug()->toString()]);
    }

    /** @param array<string, mixed> $attributes */
    private function document(Category $category, array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create(array_merge([
            'category_id' => $category->id,
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
        ], $attributes));
    }

    private function projection(ResearchDocument $document, string $status = 'ready'): ManuscriptSearchDocument
    {
        return ManuscriptSearchDocument::query()->create([
            'research_document_id' => $document->id,
            'body_text' => $status === 'ready' ? 'SDG 4' : null,
            'body_text_bytes' => $status === 'ready' ? 5 : null,
            'body_text_chars' => $status === 'ready' ? 5 : null,
            'extraction_status' => $status,
            'indexed_at' => now(),
        ]);
    }

    private function classification(ManuscriptSearchDocument $projection, int $sdgNumber, mixed $indexedAt = null, ?string $detectorVersion = null): void
    {
        $classification = ManuscriptSdgClassification::query()->create([
            'manuscript_search_document_id' => $projection->id,
            'detector_version' => $detectorVersion ?? (string) config('researchnav.sdg.detector_version'),
            'projection_indexed_at' => $indexedAt ?? $projection->indexed_at,
            'classified_at' => now(),
        ]);
        $classification->detections()->create(['sdg_number' => $sdgNumber]);
    }
}
