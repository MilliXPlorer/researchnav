<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ClassSection;
use App\Models\DefenseSchedule;
use App\Models\Evaluation;
use App\Models\MethodologyReview;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\SimilarityResult;
use App\Models\User;

class ReportingService
{
    public function coordinatorProgram(): array
    {
        $documents = ResearchDocument::query();

        return [
            'schema_version' => 1,
            'counts' => [
                'active_instructors' => User::query()->where('role', 'instructor')->where('access_status', 'active')->count(),
                'active_advisers' => User::query()->where('role', 'adviser')->where('access_status', 'active')->count(),
                'active_researchers' => User::query()->where('role', 'researcher')->where('access_status', 'active')->count(),
                'draft' => (clone $documents)->where('submission_status', 'draft')->count(),
                'submitted' => (clone $documents)->where('submission_status', 'submitted')->count(),
                'under_review' => (clone $documents)->where('submission_status', 'under_review')->count(),
                'revision_required' => (clone $documents)->where('submission_status', 'revision_required')->count(),
                'approved' => (clone $documents)->where('submission_status', 'approved')->count(),
                'archived' => (clone $documents)->where('submission_status', 'archived')->count(),
                'flagged_similarity' => SimilarityResult::query()->latestPerPair()->where('adviser_review_required', true)->count(),
                'defenses_scheduled' => DefenseSchedule::query()->where('status', 'scheduled')->count(),
                'defenses_completed' => DefenseSchedule::query()->where('status', 'completed')->count(),
                'evaluations_submitted' => Evaluation::query()->count(),
                'methodology_signed_off' => MethodologyReview::query()->where(MethodologyReview::column('review_status'), 'signed_off')->count(),
            ],
            'by_section' => ClassSection::query()
                ->withCount('researchDocuments')
                ->orderBy('name')
                ->get()
                ->map(fn (ClassSection $section) => [
                    'id' => $section->id,
                    'name' => $section->name,
                    'documents_count' => $section->research_documents_count,
                ])
                ->all(),
            'adviser_load' => $this->adviserLoad(),
        ];
    }

    public function adviserLoad(): array
    {
        return ReviewAssignment::query()
            ->where('review_role', 'adviser')
            ->where('is_active', true)
            ->with('reviewer:id,first_name,middle_name,last_name,email')
            ->get()
            ->groupBy('reviewer_id')
            ->map(fn ($assignments, $reviewerId) => [
                'user_id' => $reviewerId,
                'name' => $assignments->first()->reviewer ? trim(implode(' ', array_filter([
                    $assignments->first()->reviewer->first_name, $assignments->first()->reviewer->middle_name, $assignments->first()->reviewer->last_name,
                ]))) : null,
                'email' => $assignments->first()->reviewer?->email,
                'active_assignments' => $assignments->count(),
            ])
            ->values()
            ->sortByDesc('active_assignments')
            ->values()
            ->all();
    }

    public function duplicateFlags(): array
    {
        return SimilarityResult::query()
            ->latestPerPair()
            ->where('adviser_review_required', true)
            ->with(['sourceResearch:id,title,submission_status,research_stage,submitted_by', 'matchedResearch:id,title,submission_status,research_stage'])
            ->orderByRaw('CASE WHEN overall_similarity_score IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('overall_similarity_score')
            ->orderByDesc('title_similarity_score')
            ->orderBy('matched_research_id')
            ->get()
            ->map(fn (SimilarityResult $result) => [
                'id' => $result->id,
                'overall_similarity_score' => $result->overall_similarity_score,
                'classification' => $result->classification,
                'adviser_review_required' => $result->adviser_review_required,
                'analyzed_at' => $result->analyzed_at?->toISOString(),
                'source' => [
                    'research_document_id' => $result->source_research_id,
                    'title' => $result->sourceResearch?->title,
                    'submission_status' => $result->sourceResearch?->submission_status,
                    'research_stage' => $result->sourceResearch?->research_stage,
                ],
                'matched' => [
                    'research_document_id' => $result->matched_research_id,
                    'title' => $result->matchedResearch?->title,
                    'submission_status' => $result->matchedResearch?->submission_status,
                    'research_stage' => $result->matchedResearch?->research_stage,
                ],
            ])
            ->all();
    }

    public function officeInstitutional(): array
    {
        $documents = ResearchDocument::query();

        return [
            'schema_version' => 1,
            'counts' => [
                'total_users' => User::query()->count(),
                'active_users' => User::query()->where('access_status', 'active')->count(),
                'pending_archiving' => (clone $documents)->where('archive_status', 'pending_archiving')->count(),
                'archived' => (clone $documents)->where('archive_status', 'archived')->count(),
                'flagged_similarity' => SimilarityResult::query()->latestPerPair()->where('adviser_review_required', true)->count(),
                'audit_events' => AuditLog::query()->count(),
                'evaluations_submitted' => Evaluation::query()->count(),
                'methodology_signed_off' => MethodologyReview::query()->where(MethodologyReview::column('review_status'), 'signed_off')->count(),
            ],
            'by_academic_unit' => (clone $documents)
                ->whereNotNull('academic_unit')
                ->selectRaw('academic_unit, count(*) as total')
                ->groupBy('academic_unit')
                ->orderByDesc('total')
                ->get()
                ->map(fn ($row) => ['academic_unit' => $row->academic_unit, 'total' => (int) $row->total])
                ->all(),
            'by_status' => collect(ResearchDocument::SUBMISSION_STATUSES)
                ->map(fn (string $status) => ['status' => $status, 'total' => (clone $documents)->where('submission_status', $status)->count()])
                ->all(),
        ];
    }
}
