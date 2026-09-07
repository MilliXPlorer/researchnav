<?php

namespace App\Contracts;

use App\Models\ResearchDocument;
use Illuminate\Support\Collection;

interface SimilarityProcess
{
    /**
     * @param  Collection<int, ResearchDocument>  $candidates
     * @return array<int, array<string, mixed>>
     */
    public function run(ResearchDocument $source, Collection $candidates): array;
}
