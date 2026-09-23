<?php

namespace App\Http\Controllers;

use App\Http\Requests\ResearcherFeedbackActionRequest;
use App\Http\Requests\StoreFeedbackRequest;
use App\Http\Requests\UpdateFeedbackStatusRequest;
use App\Http\Resources\FeedbackResource;
use App\Models\FeedbackAttachment;
use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Policies\FeedbackCommentPolicy;
use App\Services\AuditService;
use App\Services\ConsolidatedReadAdapter;
use App\Services\DocumentReviewAuthorization;
use App\Services\FeedbackService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class FeedbackController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument, ConsolidatedReadAdapter $shadow)
    {
        $actor = $this->actor($request);
        $policy = new FeedbackCommentPolicy;
        $this->allowed($policy->view($actor, $researchDocument));
        $authorId = $policy->viewConsolidated($actor, $researchDocument) ? null : $actor->id;
        $researcherIds = $this->researcherParticipantIds($researchDocument, $actor);

        if ($shadow->enabled()) {
            $feedback = $shadow->feedbackForDocument($researchDocument->id, $authorId);
            if ($authorId !== null && $researcherIds->isNotEmpty()) {
                $all = $shadow->feedbackForDocument($researchDocument->id, null);
                $researcherSet = $researcherIds->map(fn ($id) => (string) $id)->flip();
                $feedback = $all->filter(fn (FeedbackComment $item): bool => (string) $item->user_id === (string) $authorId || $researcherSet->has((string) $item->user_id))->values();
            }
            $this->attachConversationFiles($feedback);

            return FeedbackResource::collection($feedback)->response()->header('Cache-Control', 'private, no-store');
        }

        $feedback = $researchDocument->feedbackComments()
            ->when($authorId !== null, function ($query) use ($authorId, $researcherIds): void {
                $userColumn = FeedbackComment::column('user_id');
                $query->where(function ($nested) use ($userColumn, $authorId, $researcherIds): void {
                    $nested->where($userColumn, $authorId);
                    if ($researcherIds->isNotEmpty()) {
                        $nested->orWhereIn($userColumn, $researcherIds->all());
                    }
                });
            })
            ->with(['user', 'documentFile', 'attachment'])
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

        return (new FeedbackResource($service->create($this->actor($request), $researchDocument, $data, $request, $request->file('attachment'))))->response()->setStatusCode(201)->header('Cache-Control', 'private, no-store');
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

    public function downloadAttachment(Request $request, ResearchDocument $researchDocument, FeedbackComment $feedback)
    {
        abort_unless($feedback->research_document_id === $researchDocument->id, 404);
        $actor = $this->actor($request);
        $policy = new FeedbackCommentPolicy;
        $this->allowed($policy->view($actor, $researchDocument));
        if (! $this->canViewFeedback($actor, $researchDocument, $feedback, $policy)) {
            abort(403);
        }
        $attachment = FeedbackAttachment::query()
            ->where('feedback_comment_id', $feedback->getKey())
            ->where('research_document_id', $researchDocument->id)
            ->firstOrFail();
        if (! Storage::disk('researchnav_private')->exists($attachment->file_path)) {
            abort(404);
        }
        app(AuditService::class)->log($actor, 'FEEDBACK_ATTACHMENT_DOWNLOADED', $feedback, 'Downloaded a feedback conversation attachment.', $request);

        return response()->streamDownload(function () use ($attachment): void {
            $handle = Storage::disk('researchnav_private')->readStream($attachment->file_path);
            if ($handle === false) {
                abort(404);
            }
            try {
                fpassthru($handle);
            } finally {
                fclose($handle);
            }
        }, $attachment->original_filename, ['Content-Type' => $attachment->mime_type, 'Cache-Control' => 'private, no-store']);
    }

    /** @return \Illuminate\Support\Collection<int, mixed> */
    private function researcherParticipantIds(ResearchDocument $research, $actor): \Illuminate\Support\Collection
    {
        if (! DocumentReviewAuthorization::canAuthor($actor, $research) || $research->section_id === null) {
            return collect();
        }

        return DB::table('class_section_members')
            ->where('research_document_id', $research->id)
            ->where('class_section_id', $research->section_id)
            ->pluck('user_id')
            ->filter()
            ->unique()
            ->values();
    }

    /** @param \Illuminate\Support\Collection<int, FeedbackComment> $feedback */
    private function attachConversationFiles(\Illuminate\Support\Collection $feedback): void
    {
        if ($feedback->isEmpty()) {
            return;
        }
        $attachments = FeedbackAttachment::query()
            ->whereIn('feedback_comment_id', $feedback->map(fn (FeedbackComment $item) => $item->getKey())->all())
            ->get()
            ->keyBy('feedback_comment_id');
        foreach ($feedback as $item) {
            $item->setRelation('attachment', $attachments->get($item->getKey()));
        }
    }

    private function canViewFeedback($actor, ResearchDocument $research, FeedbackComment $feedback, FeedbackCommentPolicy $policy): bool
    {
        if ($policy->viewConsolidated($actor, $research)) {
            return true;
        }
        if ((string) $feedback->user_id === (string) $actor->id) {
            return true;
        }

        return $this->researcherParticipantIds($research, $actor)
            ->map(fn ($id) => (string) $id)
            ->contains((string) $feedback->user_id);
    }
}
