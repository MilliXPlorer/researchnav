<?php

namespace App\Services;

use App\Models\MonitoringLog;
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
        private readonly ReportingService $reports,
    ) {}

    public function get(User $actor): array
    {
        $institute = $this->scope->institute($actor);
        $documents = $this->scope->documents($actor);
        $users = $this->scope->users($actor);
        $ongoing = (clone $documents)->where('submission_status', '!=', 'archived')->count();
        $archived = (clone $documents)->where('submission_status', 'archived')->count();

        return [
            'schema_version' => 1,
            'institute' => ['name' => $institute],
            'counts' => [
                'total_users' => (clone $users)->whereIn('role', ['instructor', 'adviser'])->where('access_status', 'active')->count(),
                'total_instructors' => (clone $users)->where('role', 'instructor')->where('access_status', 'active')->count(),
                'total_advisers' => (clone $users)->where('role', 'adviser')->where('access_status', 'active')->count(),
                'total_studies' => $ongoing + $archived,
            ],
            'adviser_workload' => $this->reports->adviserLoad($actor, clone $documents),
            'repository_status' => [
                'total' => $ongoing + $archived,
                'ongoing' => $ongoing,
                'archived' => $archived,
            ],
            'recent_activity' => $this->recentActivity($documents),
        ];
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
