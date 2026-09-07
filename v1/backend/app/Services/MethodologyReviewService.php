<?php

namespace App\Services;

use App\Models\MethodologyReview;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MethodologyReviewService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring, private readonly ConsolidationShadowService $shadow, private readonly ConsolidatedReadAdapter $consolidated) {}

    public function queueFor(User $statistician): array
    {
        if ($this->consolidated->enabled()) {
            $reviews = $this->consolidated->methodologyReviewsForStatistician($statistician->id);
            $documents = ResearchDocument::query()
                ->whereIn('id', $reviews->pluck('research_document_id'))
                ->get(['id', 'title', 'submission_status', 'research_stage'])
                ->keyBy('id');

            return $reviews->groupBy('research_document_id')
                ->map(fn ($items, $documentId) => $this->mapQueueItem($documents->get($documentId), $statistician, $items->first()))
                ->filter()
                ->values()
                ->all();
        }

        return ResearchDocument::query()
            ->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $statistician->id)
                ->where(ReviewAssignment::column('review_role'), 'statistician')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
            ->with(['methodologyReviews' => fn ($reviews) => $reviews->where(MethodologyReview::column('statistician_id'), $statistician->id)])
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'submission_status', 'research_stage'])
            ->map(fn (ResearchDocument $document) => $this->mapQueueItem($document, $statistician))
            ->all();
    }

    public function saveChecklist(User $statistician, ResearchDocument $document, array $data, ?Request $request = null): MethodologyReview
    {
        return DB::transaction(function () use ($statistician, $document, $data, $request): MethodologyReview {
            $locked = ResearchDocument::query()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            $this->ensureAssigned($statistician, $locked);
            $review = $this->saveFinalOrLegacy($locked, $statistician, $data, 'in_progress');
            $this->shadow->mirrorMethodologyReview($review);
            $this->monitoring->log($locked, 'METHODOLOGY_CHECKLIST_UPDATED', $statistician, 'Statistician updated the methodology checklist.', null, null, 'open');
            $this->audit->log($statistician, 'METHODOLOGY_CHECKLIST_UPDATED', $review, 'Updated the methodology checklist.', $request);

            return $review->load('researchDocument');
        });
    }

    public function signOff(User $statistician, ResearchDocument $document, ?Request $request = null): MethodologyReview
    {
        return DB::transaction(function () use ($statistician, $document, $request): MethodologyReview {
            $locked = ResearchDocument::query()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            $this->ensureAssigned($statistician, $locked);
            $review = $this->saveFinalOrLegacy($locked, $statistician, [], 'signed_off');
            $this->shadow->mirrorMethodologyReview($review);
            $this->monitoring->log($locked, 'METHODOLOGY_SIGNED_OFF', $statistician, 'Statistician signed off the methodology.', null, null, 'resolved');
            $this->audit->log($statistician, 'METHODOLOGY_SIGNED_OFF', $review, 'Signed off the methodology review.', $request);

            return $review->load('researchDocument');
        });
    }

    public function returnForClarification(User $statistician, ResearchDocument $document, array $data, ?Request $request = null): MethodologyReview
    {
        return DB::transaction(function () use ($statistician, $document, $data, $request): MethodologyReview {
            $locked = ResearchDocument::query()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            $this->ensureAssigned($statistician, $locked);
            $review = $this->saveFinalOrLegacy($locked, $statistician, $data, 'returned_for_clarification');
            $this->shadow->mirrorMethodologyReview($review);
            $this->monitoring->log($locked, 'METHODOLOGY_CLARIFICATION_REQUESTED', $statistician, 'Statistician requested methodology clarification.', null, null, 'open');
            $this->audit->log($statistician, 'METHODOLOGY_CLARIFICATION_REQUESTED', $review, 'Requested clarification on the methodology.', $request);

            return $review->load('researchDocument');
        });
    }

    public function markNotApplicable(User $statistician, ResearchDocument $document, ?Request $request = null): MethodologyReview
    {
        return DB::transaction(function () use ($statistician, $document, $request): MethodologyReview {
            $locked = ResearchDocument::query()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            $this->ensureAssigned($statistician, $locked);
            $review = $this->saveFinalOrLegacy($locked, $statistician, ['remarks' => 'Not Applicable – Statistical review not required.'], 'not_applicable');
            if ($review->usesFinalStorage()) {
                $review->update(['review_type' => 'statistical_not_applicable']);
            }
            $this->monitoring->log($locked, 'STATISTICAL_REVIEW_NOT_APPLICABLE', $statistician, 'Not Applicable – Statistical review not required.', null, 'not_applicable', 'resolved');
            $this->audit->log($statistician, 'STATISTICAL_REVIEW_NOT_APPLICABLE', $review, 'Marked statistical review not applicable.', $request);

            return $review->fresh('researchDocument');
        });
    }

    public function signOffsBy(User $statistician): array
    {
        $reviews = $this->consolidated->enabled()
            ? $this->consolidated->methodologyReviewsForStatistician($statistician->id)
            : MethodologyReview::query()
                ->where(MethodologyReview::column('statistician_id'), $statistician->id)
                ->where(MethodologyReview::column('review_status'), 'signed_off')
                ->with('researchDocument:id,title,submission_status,research_stage')
                ->orderByDesc('signed_off_at')
                ->get();
        if ($this->consolidated->enabled()) {
            $reviews = $reviews->where('review_status', 'signed_off');
            $documents = ResearchDocument::query()
                ->whereIn('id', $reviews->pluck('research_document_id'))
                ->get(['id', 'title', 'submission_status', 'research_stage'])
                ->keyBy('id');
            $reviews->each(fn (MethodologyReview $review) => $review->setRelation('researchDocument', $documents->get($review->research_document_id)));
        }

        return $reviews
            ->map(fn (MethodologyReview $review) => [
                'id' => $review->id,
                'research_document_id' => $review->research_document_id,
                'title' => $review->researchDocument?->title,
                'submission_status' => $review->researchDocument?->submission_status,
                'research_stage' => $review->researchDocument?->research_stage,
                'signed_off_at' => $review->signed_off_at?->toISOString(),
            ])
            ->all();
    }

    private function mapQueueItem(ResearchDocument $document, User $statistician, ?MethodologyReview $reviewOverride = null): array
    {
        $review = $reviewOverride ?? $document->methodologyReviews->first();

        return [
            'research_document_id' => $document->id,
            'title' => $document->title,
            'submission_status' => $document->submission_status,
            'research_stage' => $document->research_stage,
            'methodology_review' => $review === null ? null : [
                'id' => $review->id,
                'design_fit' => $review->design_fit,
                'sample_size' => $review->sample_size,
                'instrument_validity' => $review->instrument_validity,
                'analysis_plan' => $review->analysis_plan,
                'remarks' => $review->remarks,
                'review_status' => $review->review_status,
                'signed_off_at' => $review->signed_off_at?->toISOString(),
            ],
        ];
    }

    private function ensureAssigned(User $statistician, ResearchDocument $document): void
    {
        $assigned = $document->reviewAssignments()
            ->where(ReviewAssignment::column('reviewer_id'), $statistician->id)
            ->where(ReviewAssignment::column('review_role'), 'statistician')
            ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true)
            ->exists();
        if (! $assigned && ! DomainAuthorization::isActiveAdministrator($statistician)) {
            throw ValidationException::withMessages(['authorization' => ['The statistician is not assigned to this document.']]);
        }
    }

    private function saveFinalOrLegacy(ResearchDocument $document, User $statistician, array $data, string $status): MethodologyReview
    {
        $model = new MethodologyReview;
        if (! $model->usesFinalStorage()) {
            return MethodologyReview::query()->updateOrCreate(
                ['research_document_id' => $document->id, 'statistician_id' => $statistician->id],
                array_merge($data, ['review_status' => $status, 'signed_off_at' => $status === 'signed_off' ? now() : null]),
            );
        }
        $existing = MethodologyReview::query()->where('research_document_id', $document->id)
            ->where(MethodologyReview::column('statistician_id'), $statistician->id)->latest()->first();
        $details = json_decode((string) $existing?->remarks, true) ?: [];
        $details['checklist'] = array_merge($details['checklist'] ?? [], array_intersect_key($data, array_flip(['design_fit', 'sample_size', 'instrument_validity', 'analysis_plan'])));
        $details['remarks'] = $data['remarks'] ?? ($details['remarks'] ?? null);
        $values = [
            'reviewer_role' => 'statistician', 'review_type' => $status === 'signed_off' ? 'statistical_clearance' : 'statistical_review',
            'remarks' => json_encode($details, JSON_UNESCAPED_UNICODE), 'required_action' => $status === 'returned_for_clarification' ? ($data['remarks'] ?? null) : null,
            'review_status' => $status, 'reviewed_at' => now(),
        ];
        if ($existing) {
            $existing->update($values);

            return $existing->fresh();
        }

        return MethodologyReview::query()->create(['research_document_id' => $document->id, 'statistician_id' => $statistician->id] + $values);
    }
}
