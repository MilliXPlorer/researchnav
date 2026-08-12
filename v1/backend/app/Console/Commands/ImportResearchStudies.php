<?php

namespace App\Console\Commands;

use App\Services\ResearchStudyImportService;
use Illuminate\Console\Command;
use Throwable;

class ImportResearchStudies extends Command
{
    protected $signature = 'research:import-studies
        {--owner= : Existing active owner account email}
        {--source= : Directory containing catalog.json and DOCX files}';

    protected $description = 'Import private research-study source data into the repository';

    public function handle(ResearchStudyImportService $importer): int
    {
        $owner = trim((string) $this->option('owner'));
        if ($owner === '') {
            $this->error('Provide an active owner email with --owner.');

            return self::FAILURE;
        }

        $source = trim((string) $this->option('source'));
        $source = $source !== '' ? $source : (string) config('researchnav.research_study_import_source');

        try {
            $result = $importer->import($source, $owner);
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info("Imported: {$result['imported']}; updated: {$result['updated']}; skipped duplicate files: {$result['skipped_duplicates']}.");

        return self::SUCCESS;
    }
}
