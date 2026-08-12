<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreFeedbackRequest;
use App\Http\Resources\FeedbackResource;
use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Policies\FeedbackCommentPolicy;
use App\Policies\ResearchDocumentPolicy;
use App\Services\FeedbackService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class FeedbackController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($this->actor($request), $researchDocument));

        return FeedbackResource::collection($researchDocument->feedbackComments()->latest()->get());
    }

    public function store(StoreFeedbackRequest $request, ResearchDocument $researchDocument, FeedbackService $service)
    {
        $this->allowed((new FeedbackCommentPolicy)->create($this->actor($request), $researchDocument));
        $data = $request->validated();
        if (isset($data['document_file_id']) && ! $researchDocument->files()->whereKey($data['document_file_id'])->exists()) {
            throw ValidationException::withMessages(['document_file_id' => ['The file does not belong to this research.']]);
        }

        return (new FeedbackResource($service->create($this->actor($request), $researchDocument, $data, $request)))->response()->setStatusCode(201);
    }

    public function update(Request $request, ResearchDocument $researchDocument, FeedbackComment $feedback, FeedbackService $service)
    {
        abort_unless($feedback->research_document_id === $researchDocument->id, 404);
        $this->allowed((new FeedbackCommentPolicy)->update($this->actor($request), $feedback));
        $data = $request->validate(['feedback_status' => ['required', 'in:acknowledged,resolved']]);

        return new FeedbackResource($service->setStatus($this->actor($request), $feedback, $data['feedback_status'], $request));
    }
}
