<?php

namespace Tests\Feature\Database;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ClassSectionInstituteMigrationTest extends TestCase
{
    public function test_migration_schema_backfill_and_rollback_are_exact(): void
    {
        Schema::dropIfExists('research_documents');
        Schema::dropIfExists('class_sections');
        Schema::create('class_sections', function (Blueprint $table): void {
            $table->id();
            $table->char('instructor_id', 36);
            $table->string('name', 150);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('name', 'class_sections_name_idx');
        });
        Schema::create('research_documents', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('section_id')->nullable();
            $table->string('institute', 255)->nullable();
            $table->softDeletes();
        });

        foreach (range(1, 5) as $id) {
            DB::table('class_sections')->insert(['id' => $id, 'instructor_id' => str_repeat((string) $id, 36), 'name' => 'Section '.$id]);
        }
        DB::table('research_documents')->insert([
            ['section_id' => 1, 'institute' => ' Institute of Business and Financial Management ', 'deleted_at' => null],
            ['section_id' => 1, 'institute' => 'Institute of Business and Financial Management', 'deleted_at' => null],
            ['section_id' => 2, 'institute' => null, 'deleted_at' => null],
            ['section_id' => 3, 'institute' => '   ', 'deleted_at' => null],
            ['section_id' => 4, 'institute' => 'Institute A', 'deleted_at' => null],
            ['section_id' => 4, 'institute' => 'Institute B', 'deleted_at' => null],
            ['section_id' => 5, 'institute' => 'Deleted Institute', 'deleted_at' => now()],
        ]);

        $migration = require database_path('migrations/2026_11_18_000001_add_institute_to_class_sections_table.php');
        $migration->up();

        $this->assertTrue(Schema::hasColumn('class_sections', 'institute'));
        $column = collect(Schema::getColumns('class_sections'))->firstWhere('name', 'institute');
        $this->assertTrue($column['nullable']);
        $this->assertSame('varchar', $column['type_name']);
        $this->assertStringContainsString("string('institute', 180)", file_get_contents(database_path('migrations/2026_11_18_000001_add_institute_to_class_sections_table.php')));
        $this->assertTrue(collect(Schema::getIndexes('class_sections'))->contains('name', 'class_sections_institute_active_idx'));
        $this->assertSame('Institute of Business and Financial Management', DB::table('class_sections')->where('id', 1)->value('institute'));
        foreach ([2, 3, 4, 5] as $id) {
            $this->assertNull(DB::table('class_sections')->where('id', $id)->value('institute'));
        }

        $migration->down();

        $this->assertFalse(Schema::hasColumn('class_sections', 'institute'));
        $this->assertTrue(collect(Schema::getIndexes('class_sections'))->contains('name', 'class_sections_name_idx'));
    }
}
