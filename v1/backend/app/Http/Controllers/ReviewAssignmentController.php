<?php

namespace App\Http\Controllers;

use App\Http\Requests\AssignReviewersRequest;
use App\Http\Resources\ReviewAssignmentResource;
use App\Models\ResearchDocument;
use App\Services\DomainAuthorization;
use App\Services\ReviewAssignmentService;
use Illuminate\Http\Request;

class ReviewAssignmentController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed(DomainAuthorization::isOffice($this->actor($request)));

        return ReviewAssignmentResource::collection($researchDocument->reviewAssignments()->with(['reviewer', 'assigner'])->get());
    }

    public function update(AssignReviewersRequest $request, ResearchDocument $researchDocument, ReviewAssignmentService $service)
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isOffice($actor));
        $research = $service->replace($actor, $researchDocument, $request->validated()['reviewers'], $request);

        return ReviewAssignmentResource::collection($research->reviewAssignments);
    }
}
