<?php

namespace Tests\Feature;

use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use App\Models\User;
use App\Services\ReportingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SimilarityHistoryReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_reports_history_without_mutating_or_recalculating_rows(): void
    {
        SimilarityResult::factory()->create(['algorithm_version' => 'title-tfidf-cosine-v1']);
        $before = SimilarityResult::query()->firstOrFail()->getAttributes();

        $this->artisan('similarity:history-report', ['--json' => true])
            ->expectsOutputToContain('"rows_requiring_recalculation":1')
            ->assertExitCode(0);

        $this->assertSame($before, SimilarityResult::query()->firstOrFail()->getAttributes());
    }

    public function test_expand_migration_backfills_legacy_decisions_without_changing_historical_scores_or_versions(): void
    {
        $migration = require database_path('migrations/2026_09_01_000036_add_weighted_similarity_fields.php');
        $migration->down();
        $user = User::factory()->create();
        $source = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $match = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        DB::table('similarity_results')->insert([
            'source_research_id' => $source->id,
            'matched_research_id' => $match->id,
            'source_title' => $source->title,
            'matched_title' => $match->title,
            'cosine_score' => '0.750000000000',
            'final_similarity_score' => '0.750000000000',
            'threshold' => '0.700000',
            'is_flagged' => true,
            'analysis_type' => 'title',
            'algorithm_version' => 'title-tfidf-cosine-v1',
            'analyzed_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $migration->up();
        $legacy = SimilarityResult::query()->sole();
        $this->assertSame('title-tfidf-cosine-v1', $legacy->algorithm_version);
        $this->assertSame('0.750000000000', $legacy->final_similarity_score);
        $this->assertTrue($legacy->overall_flagged);
        $this->assertTrue($legacy->adviser_review_required);
        $this->assertSame('overall_high_similarity', $legacy->flag_reason);
        $this->assertNull($legacy->overall_similarity_score);
        $queue = app(ReportingService::class)->duplicateFlags();
        $this->assertCount(1, $queue);
        $this->assertSame($legacy->id, $queue[0]['id']);
        $this->assertNull($queue[0]['overall_similarity_score']);
    }

    public function test_down_refuses_to_drop_weighted_fields_after_weighted_rows_exist(): void
    {
        SimilarityResult::factory()->create();
        $migration = require database_path('migrations/2026_09_01_000036_add_weighted_similarity_fields.php');

        $this->expectException(\RuntimeException::class);
        $migration->down();
    }
}
