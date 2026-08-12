<?php

namespace App\Services;

use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FeedbackService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring) {}

    /** @param array<string, mixed> $data */
    public function create(User $actor, ResearchDocument $research, array $data, ?Request $request = null): FeedbackComment
    {
        return DB::transaction(function () use ($actor, $research, $data, $request): FeedbackComment {
            $feedback = FeedbackComment::query()->create(array_merge($data, ['research_document_id' => $research->id, 'user_id' => $actor->id, 'feedback_status' => 'open']));
            $this->monitoring->log($research, 'FEEDBACK_CREATED', $actor, 'Feedback created.', null, null, 'open');
            $this->audit->log($actor, 'FEEDBACK_CREATED', $feedback, 'Created feedback.', $request);
            $research->submitter?->notify(new ResearchActivityNotification($research, 'FEEDBACK_CREATED', 'New feedback', 'New feedback was added to your research.'));

            return $feedback->load(['user', 'documentFile']);
        });
    }

    public function setStatus(User $actor, FeedbackComment $feedback, string $status, ?Request $request = null): FeedbackComment
    {
        return DB::transaction(function () use ($actor, $feedback, $status, $request): FeedbackComment {
            $previous = $feedback->feedback_status;
            $feedback->update(['feedback_status' => $status]);
            $research = $feedback->researchDocument;
            $this->monitoring->log($research, 'FEEDBACK_'.$status, $actor, 'Feedback status updated.', $previous, $status, 'open');
            $this->audit->log($actor, 'FEEDBACK_STATUS_UPDATED', $feedback, "Feedback marked {$status}.", $request);
            $research->submitter?->notify(new ResearchActivityNotification($research, 'FEEDBACK_STATUS_UPDATED', 'Feedback updated', "Feedback was marked {$status}."));

            return $feedback->fresh(['user', 'documentFile']);
        });
    }
}
