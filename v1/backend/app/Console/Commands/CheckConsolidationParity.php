<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CheckConsolidationParity extends Command
{
    protected $signature = 'consolidation:check-parity';

    protected $description = 'Compare typed source tables with consolidation shadow tables without changing data.';

    public function handle(): int
    {
        if (! DB::getSchemaBuilder()->hasTable('revisions')) {
            return $this->checkConsolidatedOnlySchema();
        }

        $checks = [
            ['revisions', 'revision'],
            ['title_validations', 'title_validation'],
            ['feedback_comments', 'feedback'],
            ['evaluations', 'evaluation'],
            ['methodology_reviews', 'methodology_review'],
            ['compliance_reviews', 'compliance_review'],
            ['metadata_reviews', 'metadata_review'],
        ];
        $failed = false;

        foreach ($checks as [$source, $type]) {
            $sourceCount = DB::table($source)->count();
            $shadowCount = DB::table('research_review_records')->where('source_type', $type)->count();
            $missing = DB::table($source)
                ->whereNotExists(fn ($query) => $query
                    ->select(DB::raw(1))
                    ->from('research_review_records')
                    ->whereColumn('research_review_records.source_id', "{$source}.id")
                    ->where('research_review_records.source_type', $type))
                ->count();
            $failed = $failed || $sourceCount !== $shadowCount || $missing !== 0;
            $this->line(sprintf('%-24s source=%d shadow=%d missing=%d', $type, $sourceCount, $shadowCount, $missing));
        }

        $activitySource = DB::table('monitoring_logs')->count() + DB::table('audit_logs')->count();
        $activityShadow = DB::table('activity_logs')->count();
        $failed = $failed || $activitySource !== $activityShadow;
        $this->line(sprintf('%-24s source=%d shadow=%d', 'activity', $activitySource, $activityShadow));

        $duplicateReviewKeys = DB::table('research_review_records')
            ->select('source_type', 'source_id')
            ->groupBy('source_type', 'source_id')
            ->havingRaw('COUNT(*) > 1')
            ->count();
        $duplicateActivityKeys = DB::table('activity_logs')
            ->select('stream', 'source_id')
            ->groupBy('stream', 'source_id')
            ->havingRaw('COUNT(*) > 1')
            ->count();
        $failed = $failed || $duplicateReviewKeys !== 0 || $duplicateActivityKeys !== 0;
        $this->line("duplicate_review_keys={$duplicateReviewKeys} duplicate_activity_keys={$duplicateActivityKeys}");

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function checkConsolidatedOnlySchema(): int
    {
        $expected = ['activity_logs', 'research_review_records', 'legacy_id_sequences'];
        $missing = array_values(array_filter($expected, fn (string $table) => ! DB::getSchemaBuilder()->hasTable($table)));
        if ($missing !== []) {
            $this->error('Missing consolidated tables: '.implode(', ', $missing));

            return self::FAILURE;
        }

        $duplicateReviews = DB::table('research_review_records')
            ->select('source_type', 'source_id')
            ->groupBy('source_type', 'source_id')
            ->havingRaw('COUNT(*) > 1')
            ->count();
        $duplicateActivity = DB::table('activity_logs')
            ->select('stream', 'source_id')
            ->groupBy('stream', 'source_id')
            ->havingRaw('COUNT(*) > 1')
            ->count();
        $invalidSequences = DB::table('legacy_id_sequences')
            ->where('next_id', '<=', 0)
            ->count();
        $this->line('consolidated_only=true');
        $this->line('review_rows='.DB::table('research_review_records')->count());
        $this->line('activity_rows='.DB::table('activity_logs')->count());
        $this->line("duplicate_review_keys={$duplicateReviews} duplicate_activity_keys={$duplicateActivity} invalid_sequences={$invalidSequences}");

        return $duplicateReviews === 0 && $duplicateActivity === 0 && $invalidSequences === 0 ? self::SUCCESS : self::FAILURE;
    }
}
