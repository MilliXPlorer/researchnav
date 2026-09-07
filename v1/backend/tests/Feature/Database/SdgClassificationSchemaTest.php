<?php

namespace Tests\Feature\Database;

use App\Models\ManuscriptSdgClassification;
use App\Models\ManuscriptSdgDetection;
use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\SustainableDevelopmentGoal;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SdgClassificationSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_sdg_tables_have_the_required_columns_indexes_and_foreign_keys(): void
    {
        $this->assertTrue(Schema::hasColumns('sustainable_development_goals', ['number', 'title']));
        $this->assertTrue(Schema::hasColumns('manuscript_sdg_classifications', [
            'id',
            'manuscript_search_document_id',
            'detector_version',
            'projection_indexed_at',
            'classified_at',
            'created_at',
            'updated_at',
        ]));
        $this->assertTrue(Schema::hasColumns('manuscript_sdg_detections', [
            'id',
            'manuscript_sdg_classification_id',
            'sdg_number',
            'created_at',
            'updated_at',
        ]));

        $goalIndexes = collect(Schema::getIndexes('sustainable_development_goals'))->keyBy('name');
        $classificationIndexes = collect(Schema::getIndexes('manuscript_sdg_classifications'))->keyBy('name');
        $detectionIndexes = collect(Schema::getIndexes('manuscript_sdg_detections'))->keyBy('name');

        foreach ([
            [$goalIndexes, 'sustainable_development_goals_title_unique', true, ['title']],
            [$classificationIndexes, 'manuscript_sdg_classifications_search_document_unique', true, ['manuscript_search_document_id']],
            [$detectionIndexes, 'manuscript_sdg_detections_classification_sdg_unique', true, ['manuscript_sdg_classification_id', 'sdg_number']],
            [$detectionIndexes, 'manuscript_sdg_detections_sdg_number_idx', false, ['sdg_number']],
        ] as [$indexes, $name, $unique, $columns]) {
            $index = $indexes->get($name);

            $this->assertNotNull($index, $name.' was not migrated.');
            $this->assertSame($unique, (bool) $index['unique']);
            $this->assertSame($columns, $index['columns']);
        }

        $this->assertForeignKey('manuscript_sdg_classifications', 'manuscript_search_document_id', 'manuscript_search_documents', 'cascade');
        $this->assertForeignKey('manuscript_sdg_detections', 'manuscript_sdg_classification_id', 'manuscript_sdg_classifications', 'cascade');
        $this->assertForeignKey('manuscript_sdg_detections', 'sdg_number', 'sustainable_development_goals', 'restrict');
    }

    public function test_taxonomy_is_seeded_in_its_frozen_numeric_order(): void
    {
        $this->assertSame([
            1 => 'No Poverty',
            2 => 'Zero Hunger',
            3 => 'Good Health and Well-being',
            4 => 'Quality Education',
            5 => 'Gender Equality',
            6 => 'Clean Water and Sanitation',
            7 => 'Affordable and Clean Energy',
            8 => 'Decent Work and Economic Growth',
            9 => 'Industry, Innovation and Infrastructure',
            10 => 'Reduced Inequalities',
            11 => 'Sustainable Cities and Communities',
            12 => 'Responsible Consumption and Production',
            13 => 'Climate Action',
            14 => 'Life Below Water',
            15 => 'Life on Land',
            16 => 'Peace, Justice and Strong Institutions',
            17 => 'Partnerships for the Goals',
        ], SustainableDevelopmentGoal::query()->orderBy('number')->pluck('title', 'number')->all());
    }

    public function test_taxonomy_number_and_title_are_unique(): void
    {
        try {
            SustainableDevelopmentGoal::query()->create(['number' => 1, 'title' => 'A distinct title']);
            $this->fail('The taxonomy number must be the primary key.');
        } catch (QueryException) {
            // Expected: taxonomy numbers are primary keys.
        }

        $this->expectException(QueryException::class);
        SustainableDevelopmentGoal::query()->create(['number' => 18, 'title' => 'No Poverty']);
    }

    public function test_a_classification_can_represent_a_complete_zero_detection_result_and_exposes_its_relations(): void
    {
        $searchDocument = $this->createSearchDocument();
        $classification = ManuscriptSdgClassification::query()->create([
            'manuscript_search_document_id' => $searchDocument->id,
            'detector_version' => 'sdg-detector/1.0',
            'projection_indexed_at' => now(),
            'classified_at' => now(),
        ]);

        $this->assertInstanceOf(HasOne::class, $searchDocument->sdgClassification());
        $this->assertInstanceOf(BelongsTo::class, $classification->manuscriptSearchDocument());
        $this->assertInstanceOf(HasMany::class, $classification->detections());
        $this->assertSame($classification->id, $searchDocument->fresh()->sdgClassification->id);
        $this->assertSame($searchDocument->id, $classification->manuscriptSearchDocument->id);
        $this->assertCount(0, $classification->detections);

        $detection = ManuscriptSdgDetection::query()->create([
            'manuscript_sdg_classification_id' => $classification->id,
            'sdg_number' => 4,
        ]);

        $this->assertInstanceOf(BelongsTo::class, $detection->classification());
        $this->assertInstanceOf(BelongsTo::class, $detection->sustainableDevelopmentGoal());
        $this->assertSame($classification->id, $detection->classification->id);
        $this->assertSame('Quality Education', $detection->sustainableDevelopmentGoal->title);
    }

    public function test_unique_keys_and_taxonomy_foreign_key_are_enforced(): void
    {
        $classification = $this->createClassification();

        $this->expectException(QueryException::class);
        ManuscriptSdgClassification::query()->create([
            'manuscript_search_document_id' => $classification->manuscript_search_document_id,
            'detector_version' => 'sdg-detector/1.0',
            'projection_indexed_at' => now(),
            'classified_at' => now(),
        ]);
    }

    public function test_detection_unique_key_and_foreign_keys_are_enforced(): void
    {
        $classification = $this->createClassification();
        ManuscriptSdgDetection::query()->create([
            'manuscript_sdg_classification_id' => $classification->id,
            'sdg_number' => 4,
        ]);

        try {
            ManuscriptSdgDetection::query()->create([
                'manuscript_sdg_classification_id' => $classification->id,
                'sdg_number' => 4,
            ]);
            $this->fail('The classification and SDG number combination must be unique.');
        } catch (QueryException) {
            // Expected: the unique detection key is enforced.
        }

        $this->expectException(QueryException::class);
        ManuscriptSdgDetection::query()->create([
            'manuscript_sdg_classification_id' => $classification->id,
            'sdg_number' => 18,
        ]);
    }

    public function test_deleting_a_search_document_cascades_its_classification_and_detections(): void
    {
        $classification = $this->createClassification();
        $detection = ManuscriptSdgDetection::query()->create([
            'manuscript_sdg_classification_id' => $classification->id,
            'sdg_number' => 13,
        ]);

        $classification->manuscriptSearchDocument->delete();

        $this->assertDatabaseMissing('manuscript_sdg_classifications', ['id' => $classification->id]);
        $this->assertDatabaseMissing('manuscript_sdg_detections', ['id' => $detection->id]);
    }

    public function test_migration_down_removes_only_sdg_objects_and_up_recreates_the_taxonomy(): void
    {
        $searchDocument = $this->createSearchDocument();
        $migration = require database_path('migrations/2026_09_07_000050_create_sdg_classification_tables.php');

        $migration->down();

        $this->assertFalse(Schema::hasTable('manuscript_sdg_detections'));
        $this->assertFalse(Schema::hasTable('manuscript_sdg_classifications'));
        $this->assertFalse(Schema::hasTable('sustainable_development_goals'));
        $this->assertDatabaseHas('manuscript_search_documents', ['id' => $searchDocument->id]);

        $migration->up();

        $this->assertTrue(Schema::hasTable('manuscript_sdg_detections'));
        $this->assertTrue(Schema::hasTable('manuscript_sdg_classifications'));
        $this->assertSame(17, SustainableDevelopmentGoal::query()->count());
    }

    private function assertForeignKey(string $table, string $column, string $foreignTable, string $onDelete): void
    {
        $foreignKey = collect(Schema::getForeignKeys($table))
            ->first(fn (array $foreignKey): bool => $foreignKey['columns'] === [$column]);

        $this->assertNotNull($foreignKey, $table.'.'.$column.' foreign key was not migrated.');
        $this->assertSame($foreignTable, $foreignKey['foreign_table']);
        $this->assertSame($onDelete, $foreignKey['on_delete']);
        $this->assertSame('restrict', $foreignKey['on_update']);
    }

    private function createClassification(): ManuscriptSdgClassification
    {
        return ManuscriptSdgClassification::query()->create([
            'manuscript_search_document_id' => $this->createSearchDocument()->id,
            'detector_version' => 'sdg-detector/1.0',
            'projection_indexed_at' => now(),
            'classified_at' => now(),
        ]);
    }

    private function createSearchDocument(): ManuscriptSearchDocument
    {
        $user = User::factory()->create();
        $researchDocument = ResearchDocument::factory()->create(['submitted_by' => $user->id]);

        return ManuscriptSearchDocument::query()->create([
            'research_document_id' => $researchDocument->id,
            'extraction_status' => 'ready',
            'body_text' => 'Searchable manuscript body.',
            'body_text_bytes' => 27,
            'body_text_chars' => 27,
            'indexed_at' => now(),
        ]);
    }
}
