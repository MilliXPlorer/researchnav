<?php

namespace App\Console\Commands;

use App\Models\ResearchDocument;
use App\Services\ManuscriptSdgClassificationService;
use App\Services\ManuscriptSearchProjectionService;
use Illuminate\Console\Command;

class ReindexManuscripts extends Command
{
    protected $signature = 'repository:reindex-manuscripts
                             {--document=* : Research document ID(s)}
                             {--year-from= : Include documents published in or after this year}
                             {--year-to= : Include documents published in or before this year}
                             {--force : Re-extract matching ready projections}
                            {--retry-failed : Retry failed projections}
                            {--chunk=100 : Records per database chunk}';

    protected $description = 'Rebuild searchable manuscript text projections.';

    public function handle(ManuscriptSearchProjectionService $projections, ManuscriptSdgClassificationService $classifications): int
    {
        $chunk = max(1, min(500, (int) $this->option('chunk')));
        $documentOptions = $this->option('document');
        if (collect($documentOptions)->contains(fn ($id): bool => preg_match('/\A[1-9]\d*\z/', (string) $id) !== 1)) {
            $this->error('Every --document value must be a positive integer ID.');

            return self::FAILURE;
        }
        $ids = array_values(array_unique(array_map('intval', $documentOptions)));
        $yearFrom = $this->validatedYearOption('year-from');
        $yearTo = $this->validatedYearOption('year-to');
        if ($yearFrom === false || $yearTo === false) {
            return self::FAILURE;
        }
        if ($yearFrom !== null && $yearTo !== null && $yearFrom > $yearTo) {
            $this->error('The --year-from value must not be later than --year-to.');

            return self::FAILURE;
        }
        $counts = ['processed' => 0, 'indexed' => 0, 'classified' => 0, 'skipped' => 0, 'failed' => 0, 'no_source' => 0, 'unsupported' => 0, 'ineligible' => 0];

        $query = ResearchDocument::query()->orderBy('id');
        if ($ids !== []) {
            $query->whereIn('id', $ids);
        }
        if ($yearFrom !== null) {
            $query->where('publication_year', '>=', $yearFrom);
        }
        if ($yearTo !== null) {
            $query->where('publication_year', '<=', $yearTo);
        }
        $query->chunkById($chunk, function ($documents) use ($projections, $classifications, &$counts): void {
            foreach ($documents as $document) {
                $counts['processed']++;
                $wasClassified = $this->hasCurrentClassification($document, $classifications);
                $outcome = $projections->reindex((int) $document->id, (bool) $this->option('force'), (bool) $this->option('retry-failed'));
                $counts[$outcome]++;
                $projection = $document->manuscriptSearchDocument()->first();
                if (! $wasClassified && $projection !== null && $classifications->isCurrent($projection)) {
                    $counts['classified']++;
                }
            }
        });
        $purged = $projections->purgeIneligible();
        $this->line('Processed: '.$counts['processed'].' Indexed: '.$counts['indexed'].' Classified: '.$counts['classified'].' Skipped: '.$counts['skipped'].' Failed: '.$counts['failed'].' No source: '.$counts['no_source'].' Unsupported: '.$counts['unsupported'].' Ineligible: '.$counts['ineligible'].' Purged: '.$purged);

        return $counts['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function validatedYearOption(string $option): int|false|null
    {
        $value = $this->option($option);
        if ($value === null) {
            return null;
        }
        if (preg_match('/\A(?:19(?:0[1-9]|[1-9]\d)|20\d\d|21(?:[0-4]\d|5[0-5]))\z/', (string) $value) !== 1) {
            $this->error('The --'.$option.' value must be a year from 1901 through 2155.');

            return false;
        }

        return (int) $value;
    }

    private function hasCurrentClassification(ResearchDocument $document, ManuscriptSdgClassificationService $classifications): bool
    {
        $projection = $document->manuscriptSearchDocument;

        return $projection !== null && $classifications->isCurrent($projection);
    }
}
