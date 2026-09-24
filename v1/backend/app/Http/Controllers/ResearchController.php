<?php

namespace App\Http\Controllers;

use App\Http\Requests\ArchiveResearchRequest;
use App\Http\Requests\ResearchIndexRequest;
use App\Http\Requests\StoreResearchRequest;
use App\Http\Requests\SubmitResearchRequest;
use App\Http\Requests\TransitionResearchRequest;
use App\Http\Requests\UpdateResearchRequest;
use App\Http\Resources\PublicResearchAuthorResource;
use App\Http\Resources\ResearchAuthorResource;
use App\Http\Resources\ResearchDocumentResource;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Policies\ResearchDocumentPolicy;
use App\Services\DomainAuthorization;
use App\Services\ResearchService;
use Illuminate\Http\Request;

class ResearchController extends DomainController
{
    public function index(ResearchIndexRequest $request)
    {
        $actor = $this->actor($request);
        $input = $request->validated();
        $query = ResearchDocument::query()->with(['authors', 'category', 'sdgs']);
        if (! DomainAuthorization::isOffice($actor)) {
            $query->where(function ($query) use ($actor): void {
                if (DomainAuthorization::isResearcher($actor)) {
                    $query->whereIn('id', function ($memberships) use ($actor): void {
                        $memberships->select('research_document_id')
                            ->from('class_section_members')
                            ->whereNotNull('research_document_id')
                            ->where('user_id', $actor->id);
                    });
                }
                $query->orWhereHas('reviewAssignments', fn ($assignments) => $assignments
                    ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                    ->where(ReviewAssignment::column('review_role'), $actor->role)
                    ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
                    ->orWhere(function ($archived) {
                        $archived->where('submission_status', 'archived')->where('archive_status', 'archived')->whereIn('visibility', ['registered_only', 'public']);
                    });
            });
        }
        if ($request->boolean('mine')) {
            $this->allowed(DomainAuthorization::isResearcher($actor));
            $query->whereIn('id', function ($memberships) use ($actor): void {
                $memberships->select('research_document_id')
                    ->from('class_section_members')
                    ->whereNotNull('research_document_id')
                    ->where('user_id', $actor->id);
            })->whereNull('import_source_sha256');
        }
        if (($submissionStatus = $input['submission_status'] ?? null) !== null) {
            $query->where('submission_status', $submissionStatus);
        }

        $sort = $input['sort'] ?? null;
        $direction = $input['direction'] ?? 'asc';
        if ($sort !== null) {
            $query->orderBy($sort, $direction)->orderBy('id', $direction);
        } else {
            $query->latest()->orderByDesc('id');
        }

        return ResearchDocumentResource::collection(
            $query->paginate($input['per_page'] ?? null)->appends($request->query()),
        );
    }

    public function store(StoreResearchRequest $request, ResearchService $service)
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isActiveAdministrator($actor));
        $data = $request->validated();

        return (new ResearchDocumentResource($service->createDraft($actor, $data, $data['authors'], $request)))->response()->setStatusCode(201);
    }

    public function show(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed((new ResearchDocumentPolicy)->view($this->actor($request), $researchDocument));

        return new ResearchDocumentResource($researchDocument->load(['authors', 'category', 'sdgs']));
    }

    public function update(UpdateResearchRequest $request, ResearchDocument $researchDocument, ResearchService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->updateMetadata($this->actor($request), $researchDocument));
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

    public function people(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($this->actor($request), $researchDocument));
        $researchDocument->load(['section.instructor', 'reviewAssignments' => fn ($query) => $query->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true)->with('reviewer')]);

        return response()->json(['data' => [
            'section' => $researchDocument->section === null ? null : [
                'id' => $researchDocument->section->id,
                'name' => $researchDocument->section->name,
                'academic_year' => $researchDocument->section->academic_year,
                'instructor_name' => $researchDocument->section->instructor?->displayName(),
            ],
            'reviewers' => $researchDocument->reviewAssignments->map(fn ($assignment) => [
                'review_role' => $assignment->review_role,
                'designation' => $assignment->designation,
                'name' => $assignment->reviewer?->profileName() ?? 'Assigned reviewer',
            ])->values(),
        ]]);
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
        $target = $request->validated()['submission_status'];
        $this->allowed((new ResearchDocumentPolicy)->transition($this->actor($request), $researchDocument, $target));

        return new ResearchDocumentResource($service->transition($this->actor($request), $researchDocument, $target, $request));
    }

    public function archive(ArchiveResearchRequest $request, ResearchDocument $researchDocument, ResearchService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->archive($this->actor($request), $researchDocument));

        return new ResearchDocumentResource($service->archive($this->actor($request), $researchDocument, $request->validated()['visibility'], $request));
    }

    public function destroy(Request $request, ResearchDocument $researchDocument, ResearchService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->delete($this->actor($request), $researchDocument));
        $service->deleteImported($this->actor($request), $researchDocument, $request);

        return response()->noContent();
    }
}
