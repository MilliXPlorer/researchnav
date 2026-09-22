<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Policies\FeedbackCommentPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class FeedbackService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring, private readonly ConsolidationShadowService $shadow) {}

    /** @param array<string, mixed> $data */
    public function create(User $actor, ResearchDocument $research, array $data, ?Request $request = null): FeedbackComment
    {
        return DB::transaction(function () use ($actor, $research, $data, $request): FeedbackComment {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DocumentReviewAuthorization::canAuthor($actor, $locked)) {
                throw $this->notAuthorized();
            }
            $file = null;
            if (isset($data['document_file_id'])) {
                $file = DocumentFile::query()->whereKey($data['document_file_id'])->lockForUpdate()->firstOrFail();
                if ($file->research_document_id !== $locked->id) {
                    throw ValidationException::withMessages(['document_file_id' => ['The file does not belong to this research.']]);
                }
            }

            $feedbackData = array_merge($data, ['research_document_id' => $locked->id, 'user_id' => $actor->id, 'feedback_status' => 'open']);
            if ((new FeedbackComment)->usesFinalStorage()) {
                $feedbackData['reviewer_role'] = $actor->role;
                $feedbackData['reviewed_at'] = now();
                if (($data['feedback_type'] ?? null) === 'revision_request') {
                    $feedbackData['required_action'] = $data['comment'];
                }
            }
            $feedback = FeedbackComment::query()->create($feedbackData);
            $this->shadow->mirrorFeedback($feedback);
            $this->monitoring->log($locked, 'FEEDBACK_CREATED', $actor, 'Feedback created.', null, null, 'open');
            $this->audit->log($actor, 'FEEDBACK_CREATED', $feedback, 'Created feedback.', $request);
            $actionUrl = '/research/'.$locked->id.'?'.http_build_query(array_filter([
                'tab' => 'documents',
                'folder' => $file?->relative_path ?? ($file ? 'Unfiled' : null),
                'file' => $file?->id,
                'panel' => $file ? 'feedback' : null,
            ], static fn (mixed $value): bool => $value !== null), '', '&', PHP_QUERY_RFC3986);
            $this->notifyResearcher($locked, new ResearchActivityNotification($locked, 'FEEDBACK_CREATED', 'New feedback', 'New feedback was added to your research.', $actionUrl));

            return $feedback->load(['user', 'documentFile']);
        });
    }

    public function setStatus(User $actor, FeedbackComment $feedback, string $status, ?Request $request = null): FeedbackComment
    {
        return DB::transaction(function () use ($actor, $feedback, $status, $request): FeedbackComment {
            $lockedFeedback = FeedbackComment::query()->whereKey($feedback->id)->lockForUpdate()->firstOrFail();
            $lockedResearch = ResearchDocument::query()->whereKey($lockedFeedback->research_document_id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            $lockedFeedback->setRelation('researchDocument', $lockedResearch);
            if (! (new FeedbackCommentPolicy)->update($actor, $lockedFeedback)) {
                throw $this->notAuthorized();
            }
            if (! in_array($status, ['open', 'resolved'], true)) {
                throw ValidationException::withMessages(['feedback_status' => ['Feedback status must be open or resolved.']]);
            }

            $previous = $lockedFeedback->feedback_status;
            if ($previous === $status) {
                return $lockedFeedback->fresh(['user', 'documentFile']);
            }
            $values = ['feedback_status' => $status];
            if (Schema::hasColumn($lockedFeedback->getTable(), 'resolved_at')) {
                $values['resolved_at'] = $status === 'resolved' ? now() : null;
            }
            $lockedFeedback->update($values);
            $this->shadow->mirrorFeedback($lockedFeedback->fresh());
            $this->monitoring->log($lockedResearch, 'FEEDBACK_'.$status, $actor, 'Feedback status updated.', $previous, $status, 'open');
            $this->audit->log($actor, 'FEEDBACK_STATUS_UPDATED', $lockedFeedback, "Feedback marked {$status}.", $request);
            $lockedFeedback->loadMissing('documentFile');
            $this->notifyResearcher($lockedResearch, new ResearchActivityNotification($lockedResearch, 'FEEDBACK_STATUS_UPDATED', 'Feedback updated', "Feedback was marked {$status}.", $this->feedbackUrl($lockedResearch, $lockedFeedback)));

            return $lockedFeedback->fresh(['user', 'documentFile']);
        });
    }

    /** @param array{action:string,remarks?:string|null} $data */
    public function recordResearcherAction(User $actor, FeedbackComment $feedback, array $data, ?Request $request = null): FeedbackComment
    {
        return DB::transaction(function () use ($actor, $feedback, $data, $request): FeedbackComment {
            $lockedFeedback = FeedbackComment::query()->whereKey($feedback->id)->lockForUpdate()->firstOrFail();
            $research = ResearchDocument::query()->whereKey($lockedFeedback->research_document_id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::isResearcherParticipant($actor, $research)) {
                throw $this->notAuthorized();
            }
            $action = $data['action'];
            if (($action === 'acknowledge' && $lockedFeedback->researcher_acknowledged_at !== null)
                || ($action === 'address' && $lockedFeedback->researcher_addressed_at !== null)) {
                return $lockedFeedback->fresh(['user', 'documentFile']);
            }
            $values = $action === 'acknowledge'
                ? ['researcher_acknowledged_at' => now()]
                : ['researcher_acknowledged_at' => $lockedFeedback->researcher_acknowledged_at ?? now(), 'researcher_addressed_at' => now(), 'researcher_action_remarks' => $data['remarks']];
            $lockedFeedback->update($values);
            $this->shadow->mirrorFeedback($lockedFeedback->fresh());
            $event = $action === 'acknowledge' ? 'FEEDBACK_ACKNOWLEDGED_BY_RESEARCHER' : 'FEEDBACK_ADDRESSED_BY_RESEARCHER';
            $this->monitoring->log($research, $event, $actor, $action === 'acknowledge' ? 'Researcher acknowledged feedback.' : 'Researcher marked feedback addressed.', null, null, 'open');
            $this->audit->log($actor, $event, $lockedFeedback, $action === 'acknowledge' ? 'Acknowledged reviewer feedback.' : 'Marked reviewer feedback addressed.', $request);
            $lockedFeedback->loadMissing('documentFile');
            $author = User::query()->find($lockedFeedback->user_id);
            if ($author !== null && DocumentReviewAuthorization::canAuthor($author, $research)) {
                $author->notify(new ResearchActivityNotification($research, $event, 'Feedback update', $action === 'acknowledge' ? 'The researcher acknowledged your feedback.' : 'The researcher marked your feedback addressed.', $this->feedbackUrl($research, $lockedFeedback)));
            }

            return $lockedFeedback->fresh(['user', 'documentFile']);
        });
    }

    private function currentActor(User $actor): User
    {
        $current = User::query()->lockForUpdate()->find($actor->id);
        if ($current === null || ! DomainAuthorization::isActiveAccount($current)) {
            throw $this->notAuthorized();
        }

        return $current;
    }

    private function notifyResearcher(ResearchDocument $research, ResearchActivityNotification $notification): void
    {
        $researcher = User::query()->find($research->submitted_by);
        if ($researcher !== null && DomainAuthorization::isResearcherParticipant($researcher, $research)) {
            $researcher->notify($notification);
        }
    }

    private function feedbackUrl(ResearchDocument $research, FeedbackComment $feedback): string
    {
        $file = $feedback->documentFile;

        return '/research/'.$research->id.'?'.http_build_query(array_filter([
            'tab' => 'documents',
            'folder' => $file?->relative_path ?? ($file ? 'Unfiled' : null),
            'file' => $file?->id,
            'panel' => $file ? 'feedback' : null,
        ], static fn (mixed $value): bool => $value !== null), '', '&', PHP_QUERY_RFC3986);
    }

    private function notAuthorized(): ValidationException
    {
        return ValidationException::withMessages(['authorization' => ['The actor is not authorized to manage feedback.']]);
    }
}
