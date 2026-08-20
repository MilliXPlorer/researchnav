<?php

namespace App\Http\Controllers;

use App\Http\Requests\PublicRepositorySimilarityRequest;
use App\Http\Requests\RunSimilarityCheckRequest;
use App\Http\Resources\PublicRepositorySimilarityResource;
use App\Http\Resources\SimilarityResultResource;
use App\Models\ResearchDocument;
use App\Policies\ResearchDocumentPolicy;
use App\Services\PublicRepositorySimilarityCapacityException;
use App\Services\PublicRepositorySimilarityCatalogChangedException;
use App\Services\PublicRepositorySimilarityService;
use App\Services\SimilarityProcessException;
use App\Services\SimilarityService;
use App\Services\SimilarityUnavailableException;
use Illuminate\Http\Request;

class SimilarityController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument, SimilarityService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($this->actor($request), $researchDocument));

        return SimilarityResultResource::collection($service->relatedStudies($researchDocument));
    }

    public function check(RunSimilarityCheckRequest $request, ResearchDocument $researchDocument, SimilarityService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($this->actor($request), $researchDocument));

        try {
            return SimilarityResultResource::collection($service->check($this->actor($request), $researchDocument, $request))
                ->response()
                ->setStatusCode(201);
        } catch (SimilarityUnavailableException) {
            return response()->json(['error' => 'SIMILARITY_UNAVAILABLE'], 503);
        } catch (SimilarityProcessException) {
            return response()->json(['error' => 'SIMILARITY_PROCESS_FAILED'], 502);
        }
    }

    /**
     * Score a typed title or keywords from the search bar against the archived
     * repository, without requiring an existing research record.
     *
     * This is the pre-submission duplicate check: a researcher can validate a
     * proposed title before any document exists. Like the public endpoint it
     * writes nothing, so no similarity result, audit entry, or notification is
     * created, and only the archived catalog is compared.
     */
    public function query(
        PublicRepositorySimilarityRequest $request,
        PublicRepositorySimilarityService $service,
    ) {
        try {
            return PublicRepositorySimilarityResource::collection(
                $service->compare($request->string('q')->toString())
            );
        } catch (PublicRepositorySimilarityCapacityException) {
            return response()->json(['error' => 'SIMILARITY_CAPACITY_EXCEEDED'], 503);
        } catch (PublicRepositorySimilarityCatalogChangedException) {
            return response()->json(['error' => 'SIMILARITY_CATALOG_CHANGED'], 409);
        } catch (SimilarityUnavailableException) {
            return response()->json(['error' => 'SIMILARITY_UNAVAILABLE'], 503);
        } catch (SimilarityProcessException) {
            return response()->json(['error' => 'SIMILARITY_PROCESS_FAILED'], 502);
        }
    }
}
