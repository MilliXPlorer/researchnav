<?php

namespace App\Http\Controllers;

use App\Http\Requests\ResubmitRevisionRequest;
use App\Http\Requests\StoreRevisionRequest;
use App\Http\Resources\RevisionResource;
use App\Models\ResearchDocument;
use App\Models\Revision;
use App\Policies\ResearchDocumentPolicy;
use App\Policies\RevisionPolicy;
use App\Services\RevisionService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class RevisionController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($this->actor($request), $researchDocument));

        return RevisionResource::collection($researchDocument->revisions()->orderByDesc('revision_number')->get());
    }

    public function store(StoreRevisionRequest $request, ResearchDocument $researchDocument, RevisionService $service)
    {
        $this->allowed((new RevisionPolicy)->create($this->actor($request), $researchDocument));
        $data = $request->validated();
        if (isset($data['document_file_id']) && ! $researchDocument->files()->whereKey($data['document_file_id'])->exists()) {
            throw ValidationException::withMessages(['document_file_id' => ['The file does not belong to this research.']]);
        }

        return (new RevisionResource($service->request($this->actor($request), $researchDocument, $data, $request)))->response()->setStatusCode(201);
    }

    public function resubmit(ResubmitRevisionRequest $request, ResearchDocument $researchDocument, Revision $revision, RevisionService $service)
    {
        abort_unless($revision->research_document_id === $researchDocument->id, 404);
        $this->allowed((new RevisionPolicy)->resubmit($this->actor($request), $revision));

        return new RevisionResource($service->resubmit($this->actor($request), $revision, $request));
    }
}
