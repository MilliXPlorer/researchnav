<?php

namespace App\Console\Commands;

use App\Models\PendingPrivateFileDeletion;
use App\Services\DocumentService;
use Illuminate\Console\Command;

class RetryPendingPrivateFileDeletions extends Command
{
    protected $signature = 'repository:retry-private-file-deletions
                            {--limit=100 : Maximum pending deletions to attempt (1-500)}';

    protected $description = 'Retry durable private-storage file deletions.';

    public function handle(DocumentService $documents): int
    {
        $limit = max(1, min(500, (int) $this->option('limit')));
        $processed = 0;
        $deleted = 0;

        PendingPrivateFileDeletion::query()->orderBy('id')->limit($limit)->get()
            ->each(function (PendingPrivateFileDeletion $pending) use ($documents, &$processed, &$deleted): void {
                $processed++;
                if ($documents->retryPendingDeletion($pending)) {
                    $deleted++;
                }
            });

        $this->line("Processed: {$processed} Deleted: {$deleted} Pending: ".($processed - $deleted));

        return $processed === $deleted ? self::SUCCESS : self::FAILURE;
    }
}
