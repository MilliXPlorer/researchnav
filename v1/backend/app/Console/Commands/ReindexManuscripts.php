<?php

namespace App\Console\Commands;

use App\Models\ResearchDocument;
use App\Services\ManuscriptSearchProjectionService;
use Illuminate\Console\Command;

class ReindexManuscripts extends Command
{
    protected $signature = 'repository:reindex-manuscripts
                            {--document=* : Research document ID(s)}
                            {--force : Re-extract matching ready projections}
                            {--retry-failed : Retry failed projections}
                            {--chunk=100 : Records per database chunk}';

    protected $description = 'Rebuild searchable manuscript text projections.';

    public function handle(ManuscriptSearchProjectionService $projections): int
    {
        $chunk = max(1, min(500, (int) $this->option('chunk')));
        $documentOptions = $this->option('document');
        if (collect($documentOptions)->contains(fn ($id): bool => preg_match('/\A[1-9]\d*\z/', (string) $id) !== 1)) {
            $this->error('Every --document value must be a positive integer ID.');

            return self::FAILURE;
        }
        $ids = array_values(array_unique(array_map('intval', $documentOptions)));
        $counts = ['processed' => 0, 'indexed' => 0, 'skipped' => 0, 'failed' => 0, 'no_source' => 0, 'unsupported' => 0, 'ineligible' => 0];

        $query = ResearchDocument::query()->orderBy('id');
        if ($ids !== []) {
            $query->whereIn('id', $ids);
        }
        $query->chunkById($chunk, function ($documents) use ($projections, &$counts): void {
            foreach ($documents as $document) {
                $counts['processed']++;
                $outcome = $projections->reindex((int) $document->id, (bool) $this->option('force'), (bool) $this->option('retry-failed'));
                $counts[$outcome]++;
            }
        });
        $purged = $projections->purgeIneligible();
        $this->line('Processed: '.$counts['processed'].' Indexed: '.$counts['indexed'].' Skipped: '.$counts['skipped'].' Failed: '.$counts['failed'].' No source: '.$counts['no_source'].' Unsupported: '.$counts['unsupported'].' Ineligible: '.$counts['ineligible'].' Purged: '.$purged);

        return $counts['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
