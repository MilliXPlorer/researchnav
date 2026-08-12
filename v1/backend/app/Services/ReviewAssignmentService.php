<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
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
            $keys = [];
            foreach ($assignments as $assignment) {
                $reviewer = User::query()->findOrFail($assignment['reviewer_id']);
                if (! DomainAuthorization::isReviewer($reviewer) || $reviewer->role !== $assignment['review_role']) {
                    throw ValidationException::withMessages(['reviewers' => ['Reviewers must have the assigned adviser or instructor role.']]);
                }
                $keys[] = [$assignment['reviewer_id'], $assignment['review_role']];
            }

            $existing = ReviewAssignment::query()->where('research_document_id', $locked->id)->lockForUpdate()->get();
            foreach ($existing as $assignment) {
                $assignment->update(['is_active' => in_array([$assignment->reviewer_id, $assignment->review_role], $keys, true)]);
            }
            foreach ($assignments as $assignment) {
                ReviewAssignment::query()->updateOrCreate([
                    'research_document_id' => $locked->id,
                    'reviewer_id' => $assignment['reviewer_id'],
                    'review_role' => $assignment['review_role'],
                ], ['assigned_by' => $actor->id, 'is_active' => true]);
            }

            $this->monitoring->log($locked, 'REVIEW_ASSIGNMENTS_UPDATED', $actor, 'Review assignments updated.', null, null, 'open');
            $this->audit->log($actor, 'REVIEW_ASSIGNMENTS_UPDATED', $locked, 'Updated research review assignments.', $request);

            return $locked->load(['reviewAssignments.reviewer', 'reviewAssignments.assigner']);
        });
    }
}
