<?php

namespace App\Console\Commands;

use App\Models\SimilarityResult;
use App\Services\SimilarityScorePolicy;
use Illuminate\Console\Command;

class SimilarityHistoryReport extends Command
{
    protected $signature = 'similarity:history-report {--json : Emit a machine-readable report}';

    protected $description = 'Report similarity history by algorithm version without recalculating rows.';

    public function handle(SimilarityScorePolicy $policy): int
    {
        $byVersion = SimilarityResult::query()
            ->selectRaw('algorithm_version, count(*) as result_count')
            ->groupBy('algorithm_version')
            ->orderBy('algorithm_version')
            ->get()
            ->map(fn ($row) => ['algorithm_version' => $row->algorithm_version, 'rows' => (int) $row->result_count])
            ->all();
        $report = [
            'current_algorithm_version' => $policy->algorithmVersion(),
            'rows_requiring_recalculation' => SimilarityResult::query()
                ->where(fn ($query) => $query->whereNull('algorithm_version')->orWhere('algorithm_version', '!=', $policy->algorithmVersion()))
                ->count(),
            'rows_by_algorithm_version' => $byVersion,
        ];

        if ($this->option('json')) {
            $this->line((string) json_encode($report, JSON_THROW_ON_ERROR));
        } else {
            $this->table(['algorithm_version', 'rows'], $byVersion);
            $this->line('Rows requiring recalculation: '.$report['rows_requiring_recalculation']);
        }

        return self::SUCCESS;
    }
}
