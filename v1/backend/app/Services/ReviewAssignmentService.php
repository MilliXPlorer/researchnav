<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReviewAssignmentService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring) {}

    /** @param list<array{reviewer_id:string,review_role:string}> $assignments */
    public function replace(User $actor, ResearchDocument $research, array $assignments, ?Request $request = null): ResearchDocument
    {
        return DB::transaction(function () use ($actor, $research, $assignments, $request): ResearchDocument {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $reviewerIds = collect($assignments)->pluck('reviewer_id')->unique()->sort()->values();
            $lockedUsers = User::query()
                ->whereIn('id', $reviewerIds->merge([$actor->id])->unique()->sort()->values())
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');
            $actor = $this->currentActor($actor, $lockedUsers);
            if (! DomainAuthorization::isOffice($actor)) {
                throw $this->notAuthorized();
            }

            if ($reviewerIds->contains(fn (string $reviewerId): bool => $lockedUsers->get($reviewerId) === null)) {
                throw ValidationException::withMessages(['reviewers' => ['A selected reviewer does not exist.']]);
            }

            $keys = [];
            foreach ($assignments as $assignment) {
                $reviewer = $lockedUsers->get($assignment['reviewer_id']);
                if (! DomainAuthorization::isActiveAccount($reviewer)
                    || ! in_array($assignment['review_role'], ReviewAssignment::ROLES, true)
                    || $reviewer->role !== $assignment['review_role']) {
                    throw ValidationException::withMessages(['reviewers' => ['Reviewers must have the assigned adviser, instructor, panel, or statistician role.']]);
                }
                $keys[] = [$assignment['reviewer_id'], $assignment['review_role']];
            }

            $existing = ReviewAssignment::query()->where('research_document_id', $locked->id)->lockForUpdate()->get();
            $previousActiveReviewerIds = $existing->where('is_active', true)->pluck('reviewer_id')->unique();
            foreach ($existing as $assignment) {
                $assignment->update(['is_active' => in_array([$assignment->reviewer_id, $assignment->review_role], $keys, true)]);
            }
            foreach ($assignments as $assignment) {
                $record = ReviewAssignment::query()
                    ->where('research_document_id', $locked->id)
                    ->where(ReviewAssignment::column('reviewer_id'), $assignment['reviewer_id'])
                    ->where(ReviewAssignment::column('review_role'), $assignment['review_role'])
                    ->first();
                $values = ['assigned_by' => $actor->id, 'is_active' => true];
                if ($record === null) {
                    ReviewAssignment::query()->create([
                        'research_document_id' => $locked->id,
                        'reviewer_id' => $assignment['reviewer_id'],
                        'review_role' => $assignment['review_role'],
                    ] + $values);
                } else {
                    $record->update($values);
                }
            }

            $this->monitoring->log($locked, 'REVIEW_ASSIGNMENTS_UPDATED', $actor, 'Review assignments updated.', null, null, 'open');
            $this->audit->log($actor, 'REVIEW_ASSIGNMENTS_UPDATED', $locked, 'Updated research review assignments.', $request);
            $activeReviewerIds = collect($assignments)->pluck('reviewer_id')->unique();
            $newlyAssignedReviewerIds = $activeReviewerIds->diff($previousActiveReviewerIds);
            User::query()->whereIn('id', $newlyAssignedReviewerIds)->get()
                ->each(fn (User $reviewer) => $reviewer->notify(new ResearchActivityNotification($locked, 'REVIEW_ASSIGNMENT_UPDATED', 'Research review assigned', 'You were assigned to review this research record.', '/research/'.$locked->id)));
            if ($activeReviewerIds->sort()->values()->all() !== $previousActiveReviewerIds->sort()->values()->all()) {
                $locked->submitter?->notify(new ResearchActivityNotification($locked, 'REVIEW_ASSIGNMENTS_UPDATED', 'Reviewer assignments updated', 'The reviewer assignments for your research were updated.', '/research/'.$locked->id));
            }

            return $locked->load(['reviewAssignments.reviewer', 'reviewAssignments.assigner']);
        });
    }

    private function currentActor(User $actor, $lockedUsers): User
    {
        $current = $lockedUsers->get($actor->id);
        if ($current === null || ! DomainAuthorization::isActiveAccount($current)) {
            throw $this->notAuthorized();
        }

        return $current;
    }

    private function notAuthorized(): ValidationException
    {
        return ValidationException::withMessages(['authorization' => ['The actor is not authorized to manage review assignments.']]);
    }
}
