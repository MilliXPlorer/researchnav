<?php

namespace App\Services;

use App\Models\ComplianceReview;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ComplianceService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring, private readonly ConsolidationShadowService $shadow, private readonly ConsolidatedReadAdapter $consolidated) {}

    public function pendingQueue(): array
    {
        if ($this->consolidated->enabled()) {
            $reviews = $this->consolidated->complianceReviews()->keyBy('research_document_id');

            return ResearchDocument::query()
                ->whereIn('submission_status', ['approved', 'archived'])
                ->where('archive_status', '!=', 'archived')
                ->get(['id', 'title', 'submission_status', 'archive_status', 'visibility', 'updated_at'])
                ->map(function (ResearchDocument $document) use ($reviews): array {
                    $document->setRelation('complianceReview', $reviews->get($document->id));

                    return $this->mapDocument($document);
                })
                ->values()->all();
        }

        return ResearchDocument::query()
            ->whereIn('submission_status', ['approved', 'archived'])
            ->where('archive_status', '!=', 'archived')
            ->with('complianceReview')
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'submission_status', 'archive_status', 'visibility', 'updated_at'])
            ->map(fn (ResearchDocument $document) => $this->mapDocument($document))
            ->all();
    }

    public function decide(User $actor, ResearchDocument $document, array $data, ?Request $request = null): ComplianceReview
    {
        return DB::transaction(function () use ($actor, $document, $data, $request): ComplianceReview {
            $locked = ResearchDocument::query()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            $review = ComplianceReview::query()
                ->updateOrCreate(
                    ['research_document_id' => $locked->id],
                    [
                        'reviewed_by' => $actor->id,
                        'format_compliant' => $data['format_compliant'] ?? null,
                        'attachments_compliant' => $data['attachments_compliant'] ?? null,
                        'consent_forms_compliant' => $data['consent_forms_compliant'] ?? null,
                        'remarks' => $data['remarks'] ?? null,
                        'review_status' => $data['review_status'],
                        'decided_at' => now(),
                    ],
                );
            $this->shadow->mirrorComplianceReview($review);
            $this->monitoring->log($locked, 'COMPLIANCE_REVIEWED', $actor, "Compliance marked [{$review->review_status}].", null, null, $review->review_status === 'endorsed' ? 'resolved' : 'open');
            $this->audit->log($actor, 'COMPLIANCE_REVIEWED', $review, "Compliance decision [{$review->review_status}].", $request);

            return $review->load('researchDocument');
        });
    }

    private function mapDocument(ResearchDocument $document): array
    {
        $review = $document->complianceReview;

        return [
            'research_document_id' => $document->id,
            'title' => $document->title,
            'submission_status' => $document->submission_status,
            'archive_status' => $document->archive_status,
            'visibility' => $document->visibility,
            'updated_at' => $document->updated_at?->toISOString(),
            'compliance_review' => $review === null ? null : [
                'id' => $review->id,
                'format_compliant' => $review->format_compliant,
                'attachments_compliant' => $review->attachments_compliant,
                'consent_forms_compliant' => $review->consent_forms_compliant,
                'remarks' => $review->remarks,
                'review_status' => $review->review_status,
                'decided_at' => $review->decided_at?->toISOString(),
            ],
        ];
    }

    public static function guardStatus(string $status): void
    {
        if (! in_array($status, ComplianceReview::STATUSES, true)) {
            throw ValidationException::withMessages(['review_status' => ['The compliance review status is invalid.']]);
        }
    }
}
