<?php

namespace Tests\Feature\Database;

use App\Models\DocumentFile;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ManuscriptSearchDocumentSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_manuscript_search_document_schema_has_its_required_columns_and_indexes(): void
    {
        $this->assertTrue(Schema::hasTable('manuscript_search_documents'));
        $this->assertTrue(Schema::hasColumns('manuscript_search_documents', [
            'id',
            'research_document_id',
            'source_document_file_id',
            'source_kind',
            'source_extension',
            'source_sha256',
            'source_size_bytes',
            'source_file_updated_at',
            'body_text',
            'body_text_bytes',
            'body_text_chars',
            'extraction_status',
            'error_code',
            'extractor_version',
            'last_attempted_at',
            'indexed_at',
            'created_at',
            'updated_at',
        ]));

        $indexes = collect(Schema::getIndexes('manuscript_search_documents'))->keyBy('name');

        foreach ([
            'manuscript_search_documents_research_document_unique',
            'manuscript_search_documents_source_file_unique',
            'manuscript_search_documents_source_sha256_idx',
            'manuscript_search_documents_status_attempt_idx',
            'manuscript_search_documents_indexed_at_idx',
        ] as $index) {
            $this->assertTrue($indexes->has($index), $index.' was not migrated.');
        }

        $this->assertTrue((bool) $indexes->get('manuscript_search_documents_research_document_unique')['unique']);
        $this->assertTrue((bool) $indexes->get('manuscript_search_documents_source_file_unique')['unique']);
    }

    public function test_search_document_models_expose_the_one_to_one_source_relationships(): void
    {
        $user = User::factory()->create();
        $researchDocument = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $sourceFile = DocumentFile::query()->create([
            'research_document_id' => $researchDocument->id,
            'uploaded_by' => $user->id,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'manuscript.pdf',
            'stored_filename' => 'manuscript.pdf',
            'file_path' => 'research/manuscript.pdf',
            'file_extension' => 'pdf',
            'file_size' => 1024,
            'uploaded_at' => now(),
        ]);
        $searchDocument = ManuscriptSearchDocument::query()->create([
            'research_document_id' => $researchDocument->id,
            'source_document_file_id' => $sourceFile->id,
            'source_kind' => 'final_manuscript',
            'source_extension' => 'pdf',
            'source_sha256' => str_repeat('a', 64),
            'source_size_bytes' => 1024,
            'source_file_updated_at' => $sourceFile->updated_at,
            'body_text' => 'Searchable manuscript body.',
            'body_text_bytes' => 27,
            'body_text_chars' => 27,
            'extraction_status' => 'ready',
            'extractor_version' => 'test-extractor/1.0',
            'last_attempted_at' => now(),
            'indexed_at' => now(),
        ]);

        $this->assertInstanceOf(HasOne::class, $researchDocument->manuscriptSearchDocument());
        $this->assertInstanceOf(HasOne::class, $sourceFile->manuscriptSearchDocument());
        $this->assertSame($searchDocument->id, $researchDocument->manuscriptSearchDocument->id);
        $this->assertSame($searchDocument->id, $sourceFile->manuscriptSearchDocument->id);
        $this->assertSame($sourceFile->id, $searchDocument->sourceDocumentFile->id);
        $this->assertSame(1024, $searchDocument->source_size_bytes);
        $this->assertSame(27, $searchDocument->body_text_bytes);
        $this->assertSame(27, $searchDocument->body_text_chars);
    }

    public function test_deleting_a_source_file_cascades_its_derived_search_document(): void
    {
        $user = User::factory()->create();
        $researchDocument = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $sourceFile = DocumentFile::query()->create([
            'research_document_id' => $researchDocument->id,
            'uploaded_by' => $user->id,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'manuscript.pdf',
            'stored_filename' => 'manuscript.pdf',
            'file_path' => 'research/manuscript.pdf',
            'uploaded_at' => now(),
        ]);
        $searchDocument = ManuscriptSearchDocument::query()->create([
            'research_document_id' => $researchDocument->id,
            'source_document_file_id' => $sourceFile->id,
            'source_kind' => 'final_manuscript',
        ]);

        $sourceFile->delete();

        $this->assertDatabaseMissing('manuscript_search_documents', ['id' => $searchDocument->id]);
    }

    public function test_migration_down_removes_the_table_and_up_recreates_it(): void
    {
        $migration = require database_path('migrations/2026_08_26_000033_create_manuscript_search_documents_table.php');

        $migration->down();
        $this->assertFalse(Schema::hasTable('manuscript_search_documents'));

        $migration->up();
        $this->assertTrue(Schema::hasTable('manuscript_search_documents'));
    }
}
