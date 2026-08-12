<?php

namespace App\Http\Controllers;

use App\Http\Requests\ArchiveResearchRequest;
use App\Http\Requests\StoreResearchRequest;
use App\Http\Requests\SubmitResearchRequest;
use App\Http\Requests\TransitionResearchRequest;
use App\Http\Requests\UpdateResearchRequest;
use App\Http\Resources\PublicResearchAuthorResource;
use App\Http\Resources\ResearchAuthorResource;
use App\Http\Resources\ResearchDocumentResource;
use App\Models\ResearchDocument;
use App\Policies\ResearchDocumentPolicy;
use App\Services\DomainAuthorization;
use App\Services\ResearchService;
use Illuminate\Http\Request;

class ResearchController extends DomainController
{
    public function index(Request $request)
    {
        $actor = $this->actor($request);
        $query = ResearchDocument::query()->with(['authors', 'category']);
        if (! DomainAuthorization::isOffice($actor)) {
            $query->where(function ($query) use ($actor): void {
                $query->where('submitted_by', $actor->id)
                    ->orWhereHas('reviewAssignments', fn ($assignments) => $assignments->where('reviewer_id', $actor->id)->where('is_active', true))
                    ->orWhere(function ($archived) {
                        $archived->where('submission_status', 'archived')->where('archive_status', 'archived')->whereIn('visibility', ['registered_only', 'public']);
                    });
            });
        }

        return ResearchDocumentResource::collection($query->latest()->paginate());
    }

    public function store(StoreResearchRequest $request, ResearchService $service)
    {
        $data = $request->validated();

        return (new ResearchDocumentResource($service->createDraft($this->actor($request), $data, $data['authors'], $request)))->response()->setStatusCode(201);
    }

    public function show(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed((new ResearchDocumentPolicy)->view($this->actor($request), $researchDocument));

        return new ResearchDocumentResource($researchDocument->load(['authors', 'category']));
    }

    public function update(UpdateResearchRequest $request, ResearchDocument $researchDocument, ResearchService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->update($this->actor($request), $researchDocument));
        $data = $request->validated();

        return new ResearchDocumentResource($service->update($this->actor($request), $researchDocument, $data, $data['authors'] ?? null, $request));
    }

    public function authors(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed((new ResearchDocumentPolicy)->view($this->actor($request), $researchDocument));

        $actor = $this->actor($request);
        $authors = $researchDocument->authors()->orderBy('author_order')->get();
        if (! (new ResearchDocumentPolicy)->viewInternal($actor, $researchDocument)) {
            return PublicResearchAuthorResource::collection($authors);
        }

        return ResearchAuthorResource::collection($authors);
    }

    public function replaceAuthors(UpdateResearchRequest $request, ResearchDocument $researchDocument, ResearchService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->update($this->actor($request), $researchDocument));
        $authors = $request->validated()['authors'] ?? [];

        return ResearchAuthorResource::collection($service->update($this->actor($request), $researchDocument, [], $authors, $request)->authors);
    }

    public function submit(SubmitResearchRequest $request, ResearchDocument $researchDocument, ResearchService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->submit($this->actor($request), $researchDocument));

        return new ResearchDocumentResource($service->submit($this->actor($request), $researchDocument, $request));
    }

    public function transition(TransitionResearchRequest $request, ResearchDocument $researchDocument, ResearchService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->transition($this->actor($request), $researchDocument));

        return new ResearchDocumentResource($service->transition($this->actor($request), $researchDocument, $request->validated()['submission_status'], $request));
    }

    public function archive(ArchiveResearchRequest $request, ResearchDocument $researchDocument, ResearchService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->archive($this->actor($request), $researchDocument));

        return new ResearchDocumentResource($service->archive($this->actor($request), $researchDocument, $request->validated()['visibility'], $request));
    }
}
