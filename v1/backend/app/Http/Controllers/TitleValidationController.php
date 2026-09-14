<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreTitleRecommendationRequest;
use App\Http\Requests\StoreTitleValidationRequest;
use App\Http\Requests\ValidateTitleRequest;
use App\Http\Resources\TitleValidationResource;
use App\Models\ResearchDocument;
use App\Models\TitleValidation;
use App\Policies\ResearchDocumentPolicy;
use App\Policies\TitleValidationPolicy;
use App\Services\ConsolidatedReadAdapter;
use App\Services\TitleValidationService;
use Illuminate\Http\Request;

class TitleValidationController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument, ConsolidatedReadAdapter $shadow)
    {
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($this->actor($request), $researchDocument));

        $validations = $shadow->enabled()
            ? $shadow->titleValidationsForDocument($researchDocument->id)
            : $researchDocument->titleValidations()->with(['validator', 'similarityResult'])->latest()->get();

        return TitleValidationResource::collection($validations);
    }

    public function store(StoreTitleValidationRequest $request, ResearchDocument $researchDocument, TitleValidationService $service)
    {
        $this->allowed((new TitleValidationPolicy)->create($this->actor($request), $researchDocument));

        return (new TitleValidationResource($service->createPending($this->actor($request), $researchDocument, $request->validated(), $request)))->response()->setStatusCode(201);
    }

    public function update(ValidateTitleRequest $request, ResearchDocument $researchDocument, TitleValidation $titleValidation, TitleValidationService $service)
    {
        abort_unless($titleValidation->research_document_id === $researchDocument->id, 404);
        $this->allowed((new TitleValidationPolicy)->update($this->actor($request), $titleValidation));

        return new TitleValidationResource($service->record($this->actor($request), $titleValidation, $request->validated(), $request));
    }

    public function recommend(StoreTitleRecommendationRequest $request, ResearchDocument $researchDocument, TitleValidationService $service)
    {
        $this->allowed((new TitleValidationPolicy)->recommend($this->actor($request), $researchDocument));

        return (new TitleValidationResource($service->recommend($this->actor($request), $researchDocument, $request->validated(), $request)))->response()->setStatusCode(201);
    }
}
