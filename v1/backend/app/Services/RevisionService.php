<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\Revision;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RevisionService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring) {}

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
            $number = ((int) Revision::query()->where('research_document_id', $locked->id)->lockForUpdate()->max('revision_number')) + 1;
            $revision = Revision::query()->create(array_merge($data, [
                'research_document_id' => $locked->id, 'requested_by' => $actor->id, 'revision_number' => $number,
                'revision_status' => 'requested', 'requested_at' => now(),
            ]));
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
            $research = ResearchDocument::query()->whereKey($revision->research_document_id)->lockForUpdate()->firstOrFail();
            $revision = Revision::query()->whereKey($revision->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if ($research->submitted_by !== $actor->id) {
                throw $this->notAuthorized();
            }
            $latest = Revision::query()->where('research_document_id', $research->id)->lockForUpdate()->orderByDesc('revision_number')->first();
            if ($latest?->id !== $revision->id || ! in_array($revision->revision_status, ['requested', 'in_progress'], true) || $research->submission_status !== 'revision_required') {
                throw ValidationException::withMessages(['revision_status' => ['Only the latest unresolved revision can be resubmitted while revision is required.']]);
            }
            $revision->update(['revision_status' => 'resubmitted', 'submitted_at' => now()]);
            $previous = $research->submission_status;
            $research->update(['submission_status' => 'under_review', 'submitted_at' => now()]);
            $this->monitoring->log($research, 'REVISION_RESUBMITTED', $actor, "Revision {$revision->revision_number} resubmitted.", $previous, 'under_review', 'open');
            $this->audit->log($actor, 'REVISION_RESUBMITTED', $revision, "Resubmitted revision {$revision->revision_number}.", $request);

            return $revision->fresh(['requester', 'documentFile']);
        });
    }

    private function currentActor(User $actor): User
    {
        $current = User::query()->find($actor->id);
        if ($current === null) {
            throw $this->notAuthorized();
        }

        return $current;
    }

    private function notAuthorized(): ValidationException
    {
        return ValidationException::withMessages(['authorization' => ['The actor is not authorized for this research.']]);
    }
}
