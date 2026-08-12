<?php

namespace App\Http\Controllers;

use App\Http\Resources\SimilarityResultResource;
use App\Models\ResearchDocument;
use App\Policies\ResearchDocumentPolicy;
use App\Services\SimilarityService;
use Illuminate\Http\Request;

class SimilarityController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument, SimilarityService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($this->actor($request), $researchDocument));

        return SimilarityResultResource::collection($service->relatedStudies($researchDocument));
    }

    public function check()
    {
        return response()->json(['error' => 'ALGORITHM_NOT_IMPLEMENTED'], 501);
    }
}
