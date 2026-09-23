<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\FeedbackAttachment;
use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Policies\FeedbackCommentPolicy;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FeedbackService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring, private readonly ConsolidationShadowService $shadow) {}

    /** @param array<string, mixed> $data */
    public function create(User $actor, ResearchDocument $research, array $data, ?Request $request = null, ?UploadedFile $attachment = null): FeedbackComment
    {
        $storedPath = null;

        try {
            return DB::transaction(function () use ($actor, $research, $data, $request, $attachment, &$storedPath): FeedbackComment {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! (new FeedbackCommentPolicy)->create($actor, $locked)) {
                throw $this->notAuthorized();
            }
            $file = null;
            if (isset($data['document_file_id'])) {
                $file = DocumentFile::query()->whereKey($data['document_file_id'])->lockForUpdate()->firstOrFail();
                if ($file->research_document_id !== $locked->id) {
                    throw ValidationException::withMessages(['document_file_id' => ['The file does not belong to this research.']]);
                }
            }
            if ($attachment !== null) {
                $this->validateConversationAttachment($attachment);
            }

            $feedbackData = array_merge($data, ['research_document_id' => $locked->id, 'user_id' => $actor->id, 'feedback_status' => 'open']);
            unset($feedbackData['attachment']);
            if ((new FeedbackComment)->usesFinalStorage()) {
                $feedbackData['reviewer_role'] = $actor->role;
                $feedbackData['reviewed_at'] = now();
                if (($data['feedback_type'] ?? null) === 'revision_request') {
                    $feedbackData['required_action'] = $data['comment'];
                }
            }
            $feedback = FeedbackComment::query()->create($feedbackData);
            if ($attachment !== null) {
                $storedPath = $this->storeConversationAttachment($locked, $feedback, $actor, $attachment);
            }
            $this->shadow->mirrorFeedback($feedback);
            $this->monitoring->log($locked, 'FEEDBACK_CREATED', $actor, 'Feedback created.', null, null, 'open');
            $this->audit->log($actor, 'FEEDBACK_CREATED', $feedback, 'Created feedback.', $request);
            $actionUrl = '/research/'.$locked->id.'?'.http_build_query(array_filter([
                'tab' => 'documents',
                'folder' => $file?->relative_path ?? ($file ? 'Unfiled' : null),
                'file' => $file?->id,
                'panel' => $file ? 'feedback' : null,
            ], static fn (mixed $value): bool => $value !== null), '', '&', PHP_QUERY_RFC3986);
            if (DomainAuthorization::isResearcherParticipant($actor, $locked)
                && ! DocumentReviewAuthorization::canAuthor($actor, $locked)) {
                $this->notifyReviewersOfResearcherReply($locked, $actor, $actionUrl);
            } else {
                $this->notifyResearcher($locked, new ResearchActivityNotification($locked, 'FEEDBACK_CREATED', 'New feedback', 'New feedback was added to your research.', $actionUrl));
            }

            return $feedback->load(['user', 'documentFile', 'attachment']);
        });
        } catch (\Throwable $exception) {
            if ($storedPath !== null) {
                try {
                    Storage::disk('researchnav_private')->delete($storedPath);
                } catch (\Throwable) {
                    // Cleanup must not obscure the original failure.
                }
            }
            throw $exception;
        }
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
                return $lockedFeedback->fresh(['user', 'documentFile', 'attachment']);
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
            $lockedFeedback->loadMissing('attachment');
            $this->notifyResearcher($lockedResearch, new ResearchActivityNotification($lockedResearch, 'FEEDBACK_STATUS_UPDATED', 'Feedback updated', "Feedback was marked {$status}.", $this->feedbackUrl($lockedResearch, $lockedFeedback)));

            return $lockedFeedback->fresh(['user', 'documentFile', 'attachment']);
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
                return $lockedFeedback->fresh(['user', 'documentFile', 'attachment']);
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
            $lockedFeedback->loadMissing('attachment');
            $author = User::query()->find($lockedFeedback->user_id);
            if ($author !== null && DocumentReviewAuthorization::canAuthor($author, $research)) {
                $author->notify(new ResearchActivityNotification($research, $event, 'Feedback update', $action === 'acknowledge' ? 'The researcher acknowledged your feedback.' : 'The researcher marked your feedback addressed.', $this->feedbackUrl($research, $lockedFeedback)));
            }

            return $lockedFeedback->fresh(['user', 'documentFile', 'attachment']);
        });
    }

    private function validateConversationAttachment(UploadedFile $attachment): void
    {
        $extension = $this->extensionForAttachmentMime((string) $attachment->getMimeType());
        if ($extension === null) {
            $clientExtension = strtolower((string) $attachment->getClientOriginalExtension());
            if (! in_array($clientExtension, ['pdf', 'docx'], true)) {
                throw ValidationException::withMessages(['attachment' => ['The attached file type is not supported.']]);
            }
        }
        if (($attachment->getSize() ?? 0) < 1 || ($attachment->getSize() ?? 0) > 25 * 1024 * 1024) {
            throw ValidationException::withMessages(['attachment' => ['The attached file must be between 1 byte and 25 MB.']]);
        }
    }

    private function storeConversationAttachment(ResearchDocument $research, FeedbackComment $feedback, User $actor, UploadedFile $attachment): string
    {
        $extension = $this->extensionForAttachmentMime((string) $attachment->getMimeType())
            ?? strtolower((string) $attachment->getClientOriginalExtension());
        $filename = Str::uuid()->toString().'.'.$extension;
        $path = 'research/'.$research->id.'/feedback-attachments/'.$filename;
        if (Storage::disk('researchnav_private')->putFileAs('research/'.$research->id.'/feedback-attachments', $attachment, $filename) === false) {
            throw new \RuntimeException('Unable to store the feedback attachment.');
        }
        FeedbackAttachment::query()->create([
            'feedback_comment_id' => $feedback->getKey(),
            'research_document_id' => $research->id,
            'uploaded_by' => $actor->id,
            'original_filename' => mb_substr($attachment->getClientOriginalName() ?: $filename, 0, 255),
            'stored_filename' => $filename,
            'file_path' => $path,
            'file_extension' => $extension,
            'mime_type' => $attachment->getMimeType() ?: ($extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
            'file_size' => $attachment->getSize() ?? 0,
        ]);

        return $path;
    }

    private function extensionForAttachmentMime(string $mime): ?string
    {
        return match (strtolower($mime)) {
            'application/pdf' => 'pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            default => null,
        };
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

    private function notifyReviewersOfResearcherReply(ResearchDocument $research, User $actor, string $actionUrl): void
    {
        $userColumn = FeedbackComment::column('user_id');
        $previousAuthorIds = FeedbackComment::query()
            ->where('research_document_id', $research->id)
            ->where($userColumn, '!=', $actor->id)
            ->distinct()
            ->pluck($userColumn)
            ->filter()
            ->values();
        $assignedReviewerIds = $research->reviewAssignments()
            ->whereNotNull(ReviewAssignment::column('reviewer_id'))
            ->pluck(ReviewAssignment::column('reviewer_id'));
        $reviewerIds = $previousAuthorIds
            ->merge($assignedReviewerIds)
            ->filter(fn (mixed $id): bool => (string) $id !== (string) $actor->id)
            ->unique()
            ->values();
        if ($reviewerIds->isEmpty()) {
            return;
        }
        $reviewers = User::query()->whereIn('id', $reviewerIds->all())->get();
        $notification = new ResearchActivityNotification($research, 'FEEDBACK_CREATED', 'Researcher replied to feedback', 'A researcher replied to feedback on your assigned study.', $actionUrl);
        foreach ($reviewers as $reviewer) {
            if (DocumentReviewAuthorization::canAuthor($reviewer, $research)) {
                $reviewer->notify($notification);
            }
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
