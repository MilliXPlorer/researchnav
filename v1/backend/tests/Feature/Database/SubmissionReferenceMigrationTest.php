<?php

namespace Tests\Feature\Database;

use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SubmissionReferenceMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_forward_migration_backfills_more_than_one_thousand_null_references_and_requires_the_column(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $documents = ResearchDocument::factory()->count(1001)->create(['submitted_by' => $owner->id]);
        $ids = $documents->pluck('id')->all();
        $migration = require database_path('migrations/2026_09_01_000040_make_submission_reference_required.php');

        $migration->down();
        DB::table('research_documents')->whereIn('id', $ids)->update(['submission_reference' => null]);
        $this->assertSame(1001, DB::table('research_documents')->whereNull('submission_reference')->count());

        $migration->up();

        $this->assertSame(0, DB::table('research_documents')->whereNull('submission_reference')->count());
        $this->assertSame(1001, DB::table('research_documents')->whereIn('id', $ids)->distinct('submission_reference')->count('submission_reference'));
        foreach ($ids as $id) {
            $this->assertDatabaseHas('research_documents', [
                'id' => $id,
                'submission_reference' => 'RN-LEGACY-'.str_pad((string) $id, 8, '0', STR_PAD_LEFT),
            ]);
        }

        $column = collect(Schema::getColumns('research_documents'))->firstWhere('name', 'submission_reference');
        $this->assertNotNull($column);
        $this->assertFalse($column['nullable']);
    }
}
