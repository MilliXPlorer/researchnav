<?php

namespace App\Services;

use App\Models\Evaluation;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class EvaluationService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring, private readonly ConsolidationShadowService $shadow, private readonly ConsolidatedReadAdapter $consolidated) {}

    public function listByPanelist(User $panelist): array
    {
        $evaluations = $this->consolidated->enabled()
            ? $this->consolidated->evaluationsForPanelist($panelist->id)
            : Evaluation::query()
                ->where(Evaluation::column('panelist_id'), $panelist->id)
                ->with('researchDocument:id,title,submission_status,research_stage')
                ->orderByDesc('submitted_at')
                ->get();

        if ($this->consolidated->enabled()) {
            $evaluations->load('researchDocument:id,title,submission_status,research_stage');
        }

        return $evaluations
            ->map(fn (Evaluation $evaluation) => [
                'id' => $evaluation->id,
                'research_document_id' => $evaluation->research_document_id,
                'title' => $evaluation->researchDocument?->title,
                'originality' => $evaluation->originality,
                'methodology' => $evaluation->methodology,
                'clarity' => $evaluation->clarity,
                'comments' => $evaluation->comments,
                'submitted_at' => $evaluation->submitted_at?->toISOString(),
            ])
            ->all();
    }

    public function submit(User $panelist, array $data, ?Request $request = null): Evaluation
    {
        return DB::transaction(function () use ($panelist, $data, $request): Evaluation {
            $document = ResearchDocument::query()->whereKey($data['research_document_id'])->lockForUpdate()->firstOrFail();
            $panelist = $this->currentPanelist($panelist);
            $this->ensureAssigned($panelist, $document);
            $existing = Evaluation::query()
                ->where('research_document_id', $document->id)
                ->where(Evaluation::column('panelist_id'), $panelist->id)
                ->lockForUpdate()
                ->first();
            if ($existing !== null) {
                throw ValidationException::withMessages(['evaluation' => ['An evaluation has already been submitted for this document.']]);
            }

            $evaluation = Evaluation::query()->create([
                'research_document_id' => $document->id,
                'panelist_id' => $panelist->id,
                'originality' => $data['originality'],
                'methodology' => $data['methodology'],
                'clarity' => $data['clarity'],
                'comments' => $data['comments'] ?? null,
                'submitted_at' => now(),
            ]);
            $this->shadow->mirrorEvaluation($evaluation);
            $this->monitoring->log($document, 'EVALUATION_SUBMITTED', $panelist, 'Panel evaluation submitted.', null, null, 'open');
            $this->audit->log($panelist, 'EVALUATION_SUBMITTED', $evaluation, 'Submitted a panel evaluation.', $request);

            return $evaluation->load('researchDocument');
        });
    }

    private function currentPanelist(User $panelist): User
    {
        $current = User::query()->whereKey($panelist->id)->lockForUpdate()->firstOrFail();
        if (! DomainAuthorization::isActiveAccount($current)) {
            throw ValidationException::withMessages(['authorization' => ['The panelist account is not active.']]);
        }

        return $current;
    }

    private function ensureAssigned(User $panelist, ResearchDocument $document): void
    {
        $assigned = $document->reviewAssignments()
            ->where('reviewer_id', $panelist->id)
            ->where('review_role', 'panel')
            ->where('is_active', true)
            ->exists();
        if (! $assigned && ! DomainAuthorization::isActiveAdministrator($panelist)) {
            throw ValidationException::withMessages(['authorization' => ['The panelist is not assigned to this manuscript.']]);
        }
    }
}
