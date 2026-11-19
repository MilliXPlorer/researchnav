<?php

namespace App\Services;

use App\Models\ClassSection;
use App\Models\MonitoringLog;
use App\Models\ReviewAssignment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class CoordinatorProgramOverviewService
{
    private const ACTIVITY_LABELS = [
        'RESEARCH_SUBMITTED' => 'Research study submitted',
        'RESEARCH_APPROVED' => 'Research study approved',
        'RESEARCH_ARCHIVED' => 'Research study archived',
        'REVIEW_ASSIGNMENTS_UPDATED' => 'Research assignments updated',
        'PROJECT_TEAM_UPDATED' => 'Research team updated',
    ];

    public function __construct(
        private readonly CoordinatorInstituteScope $scope,
        private readonly RepositoryReadService $repository,
        private readonly ReportingService $reports,
    ) {}

    public function get(User $actor): array
    {
        $institute = $this->scope->institute($actor);
        $documents = $this->scope->documents($actor);
        $directory = $this->assignmentDirectory($actor);
        $repository = $this->repository->summary($institute);

        return [
            'schema_version' => 1,
            'institute' => ['name' => $institute],
            'counts' => [
                'total_users' => (clone $directory)->distinct()->count('id'),
                'total_instructors' => (clone $directory)->where('role', 'instructor')->count(),
                'total_advisers' => (clone $directory)->where('role', 'adviser')->count(),
                'total_studies' => $repository['all'],
            ],
            'adviser_workload' => $this->reports->adviserLoad($actor, clone $documents),
            'repository_status' => [
                'total' => $repository['all'],
                'ongoing' => $repository['ongoing'],
                'archived' => $repository['archived'],
            ],
            'recent_activity' => $this->recentActivity($documents),
        ];
    }

    private function assignmentDirectory(User $actor): Builder
    {
        $institute = $this->scope->institute($actor);
        $documents = $this->scope->documents($actor);
        $relatedInstructorIds = ClassSection::query()
            ->whereIn('id', (clone $documents)->whereNotNull('section_id')->select('section_id'))
            ->whereNotNull('instructor_id')
            ->pluck('instructor_id');
        $relatedReviewerIds = ReviewAssignment::query()
            ->whereIn(ReviewAssignment::column('review_role'), ['instructor', 'adviser'])
            ->whereIn(ReviewAssignment::column('research_document_id'), (clone $documents)->select('id'))
            ->pluck(ReviewAssignment::column('reviewer_id'));

        return User::query()
            ->whereIn('role', ['instructor', 'adviser'])
            ->where(function ($query) use ($institute, $relatedInstructorIds, $relatedReviewerIds): void {
                if ($institute === null) {
                    return;
                }
                $query->where('institute', $institute)
                    ->orWhere(function ($related) use ($relatedInstructorIds, $relatedReviewerIds): void {
                        $related->whereNull('institute')
                            ->where(function ($membership) use ($relatedInstructorIds, $relatedReviewerIds): void {
                                $membership->whereIn('id', $relatedInstructorIds)
                                    ->orWhereIn('id', $relatedReviewerIds);
                            });
                    });
            });
    }

    private function recentActivity(Builder $documents): array
    {
        return MonitoringLog::query()
            ->whereIn('research_document_id', (clone $documents)->select('id'))
            ->whereIn(MonitoringLog::column('activity_type'), array_keys(self::ACTIVITY_LABELS))
            ->with('researchDocument:id,title')
            ->latest(MonitoringLog::column('activity_date'))
            ->latest('id')
            ->limit(5)
            ->get()
            ->map(fn (MonitoringLog $log): array => [
                'id' => (string) $log->getRouteKey(),
                'type' => strtolower((string) $log->activity_type),
                'label' => self::ACTIVITY_LABELS[$log->activity_type],
                'research_document_id' => $log->research_document_id,
                'title' => $log->researchDocument?->title ?? 'Untitled research',
                'occurred_at' => $log->activity_date?->toISOString(),
            ])
            ->all();
    }
}
