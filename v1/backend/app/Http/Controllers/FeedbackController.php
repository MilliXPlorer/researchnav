<?php

namespace App\Http\Controllers;

use App\Http\Requests\ResearcherFeedbackActionRequest;
use App\Http\Requests\StoreFeedbackRequest;
use App\Http\Requests\UpdateFeedbackStatusRequest;
use App\Http\Resources\FeedbackResource;
use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Policies\FeedbackCommentPolicy;
use App\Services\ConsolidatedReadAdapter;
use App\Services\FeedbackService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class FeedbackController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument, ConsolidatedReadAdapter $shadow)
    {
        $actor = $this->actor($request);
        $policy = new FeedbackCommentPolicy;
        $this->allowed($policy->view($actor, $researchDocument));
        $authorId = $policy->viewConsolidated($actor, $researchDocument) ? null : $actor->id;

        $feedback = $shadow->enabled()
            ? $shadow->feedbackForDocument($researchDocument->id, $authorId)
            : $researchDocument->feedbackComments()
                ->when($authorId !== null, fn ($query) => $query->where(FeedbackComment::column('user_id'), $authorId))
                ->with(['user', 'documentFile'])
                ->latest()
                ->get();

        return FeedbackResource::collection($feedback)->response()->header('Cache-Control', 'private, no-store');
    }

    public function store(StoreFeedbackRequest $request, ResearchDocument $researchDocument, FeedbackService $service)
    {
        $this->allowed((new FeedbackCommentPolicy)->create($this->actor($request), $researchDocument));
        $data = $request->validated();
        if (isset($data['document_file_id']) && ! $researchDocument->files()->whereKey($data['document_file_id'])->exists()) {
            throw ValidationException::withMessages(['document_file_id' => ['The file does not belong to this research.']]);
        }

        return (new FeedbackResource($service->create($this->actor($request), $researchDocument, $data, $request)))->response()->setStatusCode(201)->header('Cache-Control', 'private, no-store');
    }

    public function update(UpdateFeedbackStatusRequest $request, ResearchDocument $researchDocument, FeedbackComment $feedback, FeedbackService $service)
    {
        abort_unless($feedback->research_document_id === $researchDocument->id, 404);
        $this->allowed((new FeedbackCommentPolicy)->update($this->actor($request), $feedback));
        $data = $request->validated();

        return (new FeedbackResource($service->setStatus($this->actor($request), $feedback, $data['feedback_status'], $request)))->response()->header('Cache-Control', 'private, no-store');
    }

    public function researcherAction(ResearcherFeedbackActionRequest $request, ResearchDocument $researchDocument, FeedbackComment $feedback, FeedbackService $service)
    {
        abort_unless($feedback->research_document_id === $researchDocument->id, 404);
        $this->allowed((new FeedbackCommentPolicy)->researcherAction($this->actor($request), $feedback));

        return (new FeedbackResource($service->recordResearcherAction($this->actor($request), $feedback, $request->validated(), $request)))->response()->header('Cache-Control', 'private, no-store');
    }
}
