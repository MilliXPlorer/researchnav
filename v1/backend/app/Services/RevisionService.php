<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\Revision;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RevisionService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring, private readonly ConsolidationShadowService $shadow) {}

    /** @param array<string, mixed> $data */
    public function request(User $actor, ResearchDocument $research, array $data, ?Request $request = null): Revision
    {
        return DB::transaction(function () use ($actor, $research, $data, $request): Revision {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::canReview($actor, $locked)) {
                throw $this->notAuthorized();
            }
            if ($locked->submission_status !== 'under_review') {
                throw ValidationException::withMessages(['submission_status' => ['Revisions can only be requested while research is under review.']]);
            }
            if (isset($data['document_file_id'])) {
                $file = DocumentFile::query()->whereKey($data['document_file_id'])->lockForUpdate()->firstOrFail();
                if ($file->research_document_id !== $locked->id) {
                    throw ValidationException::withMessages(['document_file_id' => ['The file does not belong to this research.']]);
                }
            }
            $number = ((int) Revision::query()->where('research_document_id', $locked->id)->lockForUpdate()->max(Revision::column('revision_number'))) + 1;
            $revisionData = array_merge($data, [
                'research_document_id' => $locked->id, 'requested_by' => $actor->id,
                'revision_status' => 'requested', 'requested_at' => now(),
            ]);
            if (! (new Revision)->usesFinalStorage()) {
                $revisionData['revision_number'] = $number;
            } else {
                $revisionData['reviewer_role'] = $actor->role;
                $revisionData['review_type'] = 'revision_request';
                $revisionData['required_action'] = $data['revision_remarks'];
                $revisionData['reviewed_at'] = now();
            }
            $revision = Revision::query()->create($revisionData);
            $this->shadow->mirrorRevision($revision);
            $previous = $locked->submission_status;
            $locked->update(['submission_status' => 'revision_required']);
            $this->monitoring->log($locked, 'REVISION_REQUESTED', $actor, "Revision {$number} requested.", $previous, 'revision_required', 'open');
            $this->audit->log($actor, 'REVISION_REQUESTED', $revision, "Requested revision {$number}.", $request);
            $locked->submitter?->notify(new ResearchActivityNotification($locked, 'REVISION_REQUESTED', 'Revision requested', 'A revision was requested for your research.'));

            return $revision->load(['requester', 'documentFile']);
        });
    }

    public function resubmit(User $actor, Revision $revision, ?Request $request = null): Revision
    {
        return DB::transaction(function () use ($actor, $revision, $request): Revision {
            $researchId = Revision::query()->whereKey($revision->id)->firstOrFail(['research_document_id'])->research_document_id;
            // Keep revision writes parent-first, matching request().
            $research = ResearchDocument::query()->whereKey($researchId)->lockForUpdate()->firstOrFail();
            $revision = Revision::query()->whereKey($revision->id)->lockForUpdate()->firstOrFail();
            if ((string) $revision->research_document_id !== (string) $research->id) {
                throw ValidationException::withMessages(['revision_status' => ['The revision no longer belongs to this research.']]);
            }
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::isResearcherParticipant($actor, $research) && ! DomainAuthorization::isActiveAdministrator($actor)) {
                throw $this->notAuthorized();
            }
            $latest = Revision::query()->where('research_document_id', $research->id)->lockForUpdate()->orderByDesc(Revision::column('revision_number'))->first();
            if ($latest?->id !== $revision->id || ! in_array($revision->revision_status, ['requested', 'in_progress'], true) || $research->submission_status !== 'revision_required') {
                throw ValidationException::withMessages(['revision_status' => ['Only the latest unresolved revision can be resubmitted while revision is required.']]);
            }
            $hasCurrentRevisionManuscript = DocumentFile::query()
                ->where('research_document_id', $research->id)
                ->where('document_type', 'revised_manuscript')
                ->where('is_current', true)
                ->where('uploaded_at', '>', $revision->requested_at)
                ->lockForUpdate()
                ->exists();
            if (! $hasCurrentRevisionManuscript) {
                throw ValidationException::withMessages(['revised_manuscript' => ['Upload a current revised manuscript after this revision was requested before resubmitting.']]);
            }
            $revision->update(['revision_status' => 'resubmitted', 'submitted_at' => now()]);
            $this->shadow->mirrorRevision($revision->fresh());
            $previous = $research->submission_status;
            $research->update(['submission_status' => 'under_review', 'submitted_at' => now()]);
            $this->monitoring->log($research, 'REVISION_RESUBMITTED', $actor, "Revision {$revision->revision_number} resubmitted.", $previous, 'under_review', 'open');
            $this->audit->log($actor, 'REVISION_RESUBMITTED', $revision, "Resubmitted revision {$revision->revision_number}.", $request);
            $this->notifyActiveReviewers($research, 'REVISION_RESUBMITTED', 'Revision resubmitted', "Revision {$revision->revision_number} was resubmitted and is ready for review.");

            return $revision->fresh(['requester', 'documentFile']);
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

    private function notAuthorized(): ValidationException
    {
        return ValidationException::withMessages(['authorization' => ['The actor is not authorized for this research.']]);
    }

    private function notifyActiveReviewers(ResearchDocument $research, string $event, string $title, string $message): void
    {
        $research->reviewAssignments()->where('is_active', true)->with('reviewer')->get()
            ->pluck('reviewer')->filter()->unique('id')
            ->each(fn (User $reviewer) => $reviewer->notify(new ResearchActivityNotification($research, $event, $title, $message, '/research/'.$research->id)));
    }
}
