<?php

namespace App\Http\Controllers;

use App\Models\DefenseSchedule;
use App\Models\Evaluation;
use App\Models\FeedbackComment;
use App\Models\MetadataReview;
use App\Models\MethodologyReview;
use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use App\Services\CoordinatorInstituteScope;
use App\Services\DomainAuthorization;
use App\Services\ReportingService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class DashboardController extends DomainController
{
    public function __construct(private readonly CoordinatorInstituteScope $coordinatorScope) {}

    private const PREVIEW_COLUMNS = [
        'id',
        'title',
        'research_stage',
        'submission_status',
        'archive_status',
        'visibility',
        'publication_year',
        'updated_at',
    ];

    public function index(Request $request, ReportingService $reports): JsonResponse
    {
        $actor = $this->actor($request);
        $effectiveRole = $actor->roleDefinition?->slug === 'research_editor' ? 'research_editor' : $actor->role;
        $sections = DomainAuthorization::isActiveAdministrator($actor) ? $this->adminSections() : match ($effectiveRole) {
            'researcher' => $this->researcherSections($actor),
            'adviser' => $this->adviserSections($actor),
            'instructor' => $this->instructorSections($actor),
            'panel' => $this->panelSections($actor),
            'statistician' => $this->statisticianSections($actor),
            'coordinator' => $this->coordinatorSections($actor),
            'librarian' => $this->librarianSections(),
            'research-office' => $this->researchOfficeSections($actor),
            'research_editor' => [],
            default => null,
        };

        if ($sections === null) {
            return response()->json(['error' => 'ROLE_NOT_AUTHORIZED'], 403);
        }

        $data = [
            'schema_version' => 1,
            'role' => $effectiveRole,
            'sections' => $sections,
            'analytics' => $this->analytics($actor),
            'institutional_overview' => $effectiveRole === 'research-office'
                ? $reports->officeInstitutional()['by_institute']
                : null,
            'statistician' => $effectiveRole === 'statistician'
                ? $this->statisticianDashboard($actor)
                : null,
            'librarian' => $effectiveRole === 'librarian'
                ? $this->librarianDashboard()
                : null,
        ];

        return response()
            ->json(['data' => $data])
            ->header('Cache-Control', 'private, no-store');
    }

    private function analytics(User $actor): ?array
    {
        $query = $this->analyticsDocuments($actor);
        if ($query === null) {
            return null;
        }

        $firstMonth = now()->startOfMonth()->subMonths(5);
        $months = collect(range(0, 5))->map(fn (int $offset) => $firstMonth->copy()->addMonths($offset));

        $series = [
            ['key' => 'created', 'label' => 'Created', 'column' => 'created_at'],
            ['key' => 'archived', 'label' => 'Archived', 'column' => 'archived_at'],
        ];

        return [
            'title' => 'Research activity',
            'period' => 'Last 6 months',
            'series' => array_map(function (array $definition) use ($query, $months): array {
                return [
                    'key' => $definition['key'],
                    'label' => $definition['label'],
                    'points' => $months->map(function ($month) use ($query, $definition): array {
                        return [
                            'key' => $month->format('Y-m'),
                            'label' => $month->format('M'),
                            'value' => (clone $query)
                                ->whereBetween($definition['column'], [
                                    $month->copy()->startOfMonth(),
                                    $month->copy()->endOfMonth(),
                                ])
                                ->count(),
                        ];
                    })->all(),
                ];
            }, $series),
        ];
    }

    private function analyticsDocuments(User $actor): ?Builder
    {
        $effectiveRole = $actor->roleDefinition?->slug === 'research_editor' ? 'research_editor' : $actor->role;
        if (DomainAuthorization::isActiveAdministrator($actor)) {
            return ResearchDocument::query();
        }

        return match ($effectiveRole) {
            'researcher' => $this->researcherDocuments($actor),
            'adviser' => $this->assignedDocuments($actor, 'adviser'),
            'instructor' => $this->assignedDocuments($actor, 'instructor'),
            'panel' => $this->assignedDocuments($actor, 'panel'),
            'statistician' => $this->assignedDocuments($actor, 'statistician'),
            'librarian' => ResearchDocument::query()->whereIn('submission_status', ['approved', 'archived']),
            'research-office' => ResearchDocument::query(),
            default => null,
        };
    }

    private function adminSections(): array
    {
        return [
            $this->countSection('pending_accounts', User::query()->whereIn('access_status', ['invited', 'blocked'])),
            $this->researchSection('draft_research', ResearchDocument::query()->where('submission_status', 'draft')),
            $this->researchSection('submission_queue', ResearchDocument::query()->whereIn('submission_status', ['submitted', 'under_review'])),
            $this->researchSection('revision_required', ResearchDocument::query()->where('submission_status', 'revision_required')),
            $this->researchSection('pending_title_validations', ResearchDocument::query()->whereHas('titleValidations', fn (Builder $validations) => $validations->where(TitleValidation::column('validation_status'), 'pending'))),
            $this->researchSection('flagged_similarity', ResearchDocument::query()->whereHas('sourceSimilarityResults', fn (Builder $results) => $results->latestPerPair()->where('adviser_review_required', true))),
            $this->researchSection('approved_for_archiving', ResearchDocument::query()->where('submission_status', 'approved')->where('archive_status', '!=', 'archived')),
            $this->researchSection('archived_repository', ResearchDocument::query()
                ->where('archive_status', 'archived')
                ->whereIn('submission_status', ['approved', 'archived'])),
            $this->researchSection('recent_research', ResearchDocument::query()),
        ];
    }

    /** A researcher sees projects explicitly assigned by their instructor. */
    private function researcherSections(User $actor): array
    {
        $own = fn (): Builder => $this->researcherDocuments($actor);

        return [
            $this->researchSection('my_drafts', $own()->where('submission_status', 'draft')),
            $this->researchSection('my_under_review', $own()->whereIn('submission_status', ['submitted', 'under_review'])),
            $this->researchSection('my_revision_required', $own()->where('submission_status', 'revision_required')),
            $this->researchSection('my_flagged_similarity', $own()->whereHas('sourceSimilarityResults', fn (Builder $results) => $results->latestPerPair()->where('adviser_review_required', true))),
            $this->researchSection('my_approved', $own()->where('submission_status', 'approved')),
            $this->researchSection('my_archived', $own()->where('archive_status', 'archived')),
            $this->researchSection('repository_references', $this->repositoryDocuments()),
        ];
    }

    private function researcherDocuments(User $actor): Builder
    {
        return ResearchDocument::query()->whereIn('id', function ($memberships) use ($actor): void {
            $memberships->select('research_document_id')
                ->from('class_section_members')
                ->whereNotNull('research_document_id')
                ->where('user_id', $actor->id);
        });
    }

    private function adviserSections(User $actor): array
    {
        return [
            $this->researchSection('assigned_reviews', $this->assignedDocuments($actor, 'adviser')->whereIn('submission_status', ['submitted', 'under_review'])),
            $this->researchSection('revision_requests', $this->assignedDocuments($actor, 'adviser')->where('submission_status', 'revision_required')),
            $this->researchSection('repository_references', $this->repositoryDocuments()),
        ];
    }

    private function instructorSections(User $actor): array
    {
        return [
            $this->researchSection('title_proposals', $this->assignedDocuments($actor, 'instructor')->where('research_stage', 'title_proposal')),
            $this->researchSection('pending_reviews', $this->assignedDocuments($actor, 'instructor')->whereIn('submission_status', ['submitted', 'under_review', 'revision_required'])),
            $this->researchSection('repository_references', $this->repositoryDocuments()),
        ];
    }

    private function panelSections(User $actor): array
    {
        return [
            $this->researchSection('assigned_manuscripts', $this->assignedDocuments($actor, 'panel')),
            $this->researchSection('repository_references', $this->repositoryDocuments()),
        ];
    }

    private function statisticianSections(User $actor): array
    {
        return [
            $this->researchSection('methodology_reviews', $this->assignedDocuments($actor, 'statistician')),
            $this->countSection('signoffs', MethodologyReview::query()->where(MethodologyReview::column('statistician_id'), $actor->id)->where(MethodologyReview::column('review_status'), 'signed_off')),
            $this->researchSection('completed_references', $this->repositoryDocuments()->where('research_stage', 'completed')),
        ];
    }

    private function statisticianDashboard(User $actor): array
    {
        $documents = $this->assignedDocuments($actor, 'statistician')
            ->with(['methodologyReviews' => fn ($reviews) => $reviews
                ->where(MethodologyReview::column('statistician_id'), $actor->id)
                ->latest('updated_at')])
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'research_stage', 'submission_status', 'updated_at']);

        $items = $documents->map(function (ResearchDocument $document): array {
            $review = $document->methodologyReviews->first();
            $status = $review?->review_status ?? 'pending';
            $startedAt = $review?->created_at;
            $completedAt = in_array($status, ['signed_off', 'not_applicable'], true)
                ? ($status === 'signed_off' ? $review?->signed_off_at : $review?->updated_at)
                : null;

            return [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'research_stage' => $document->research_stage,
                'submission_status' => $document->submission_status,
                'review_status' => $status,
                'due_at' => null,
                'started_at' => $startedAt?->toISOString(),
                'completed_at' => $completedAt?->toISOString(),
                'updated_at' => ($review?->updated_at ?? $document->updated_at)?->toISOString(),
            ];
        })->values();

        $firstMonth = now()->startOfMonth()->subMonths(5);
        $months = collect(range(0, 5))->map(function (int $offset) use ($firstMonth, $items): array {
            $month = $firstMonth->copy()->addMonths($offset);
            $inMonth = fn (?string $value): bool => $value !== null
                && $month->isSameMonth($value);

            return [
                'key' => $month->format('Y-m'),
                'label' => $month->format('M'),
                'started' => $items->filter(fn (array $item): bool => $inMonth($item['started_at']))->count(),
                'completed' => $items->filter(fn (array $item): bool => $inMonth($item['completed_at']))->count(),
            ];
        })->values();

        $recentActivity = $items
            ->flatMap(function (array $item): array {
                $events = [[
                    'id' => 'assigned-'.$item['research_document_id'],
                    'research_document_id' => $item['research_document_id'],
                    'title' => $item['title'],
                    'type' => 'study_assigned',
                    'occurred_at' => $item['started_at'] ?? $item['updated_at'],
                ]];
                if ($item['started_at'] !== null) {
                    $events[] = [
                        'id' => 'started-'.$item['research_document_id'],
                        'research_document_id' => $item['research_document_id'],
                        'title' => $item['title'],
                        'type' => 'review_started',
                        'occurred_at' => $item['started_at'],
                    ];
                }
                if ($item['completed_at'] !== null) {
                    $events[] = [
                        'id' => 'completed-'.$item['research_document_id'],
                        'research_document_id' => $item['research_document_id'],
                        'title' => $item['title'],
                        'type' => $item['review_status'] === 'signed_off' ? 'sign_off_completed' : 'review_completed',
                        'occurred_at' => $item['completed_at'],
                    ];
                }

                return $events;
            })
            ->filter(fn (array $event): bool => $event['occurred_at'] !== null)
            ->sortByDesc('occurred_at')
            ->take(6)
            ->values();

        return [
            'schema_version' => 1,
            'counts' => [
                'assigned' => $items->count(),
                'pending' => $items->where('review_status', 'pending')->count(),
                'in_review' => $items->whereIn('review_status', ['in_progress', 'returned_for_clarification'])->count(),
                'for_sign_off' => $items->where('review_status', 'in_progress')->count(),
                'completed' => $items->whereIn('review_status', ['signed_off', 'not_applicable'])->count(),
            ],
            'workload' => $items->whereNotIn('review_status', ['signed_off', 'not_applicable'])->values(),
            'workload_status' => [
                'pending' => $items->where('review_status', 'pending')->count(),
                'in_review' => $items->whereIn('review_status', ['in_progress', 'returned_for_clarification'])->count(),
                'completed' => $items->whereIn('review_status', ['signed_off', 'not_applicable'])->count(),
            ],
            'activity' => ['months' => $months],
            'recent_activity' => $recentActivity,
        ];
    }

    private function coordinatorSections(User $actor): array
    {
        $institute = $this->coordinatorScope->institute($actor);
        $documents = $this->coordinatorScope->documents($actor);

        return [
            $this->countSection('active_instructors', User::query()->where('institute', $institute)->where('role', 'instructor')->where('access_status', 'active')),
            $this->countSection('invited_instructors', User::query()->where('institute', $institute)->where('role', 'instructor')->where('access_status', 'invited')),
            $this->countSection('blocked_instructors', User::query()->where('institute', $institute)->where('role', 'instructor')->where('access_status', 'blocked')),
            $this->countSection('schedules', DefenseSchedule::query()->where('status', 'scheduled')->whereIn('research_document_id', (clone $documents)->select('id'))),
            $this->countSection('duplicate_flags', SimilarityResult::query()->latestPerPair()->where('adviser_review_required', true)
                ->whereIn('source_research_id', (clone $documents)->select('id'))
                ->whereIn('matched_research_id', (clone $documents)->select('id'))),
        ];
    }

    private function librarianSections(): array
    {
        return [
            $this->researchSection('archiving_queue', ResearchDocument::query()->whereIn('submission_status', ['approved', 'archived'])->where('archive_status', '!=', 'archived')),
            $this->countSection('metadata_validation', MetadataReview::query()->where(MetadataReview::column('review_status'), 'pending')),
            $this->researchSection('repository_records', $this->repositoryDocuments()),
        ];
    }

    private function librarianDashboard(): array
    {
        $queueDocuments = ResearchDocument::query()
            ->where('submission_status', 'approved')
            ->where('archive_status', '!=', 'archived')
            ->with([
                'submitter:id,email,first_name,middle_name,last_name',
                'metadataReview',
            ])
            ->orderByDesc('updated_at')
            ->get(['id', 'submitted_by', 'title', 'research_stage', 'archive_status', 'updated_at']);

        $queue = $queueDocuments->map(function (ResearchDocument $document): array {
            $reviewStatus = $document->metadataReview?->review_status;
            $status = match ($reviewStatus) {
                'complete' => 'ready',
                'pending' => 'validating',
                default => 'pending',
            };

            return [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'submitted_by' => $document->submitter?->displayName() ?? 'Unknown submitter',
                'research_stage' => $document->research_stage,
                'status' => $status,
                'updated_at' => $document->updated_at?->toISOString(),
            ];
        })->values();

        $metadataValidation = MetadataReview::query()
            ->whereIn(MetadataReview::column('review_status'), ['pending', 'needs_correction'])
            ->count();
        $repository = $this->repositoryDocuments();
        $archivedThisMonth = (clone $repository)
            ->whereBetween('archived_at', [now()->startOfMonth(), now()->endOfMonth()])
            ->count();

        $activityFor = function (int $monthCount): array {
            $firstMonth = now()->startOfMonth()->subMonths($monthCount - 1);
            $months = collect(range(0, $monthCount - 1))->map(function (int $offset) use ($firstMonth): array {
                $month = $firstMonth->copy()->addMonths($offset);

                return [
                    'key' => $month->format('Y-m'),
                    'label' => $month->format('M'),
                    'archived' => $this->repositoryDocuments()
                        ->whereBetween('archived_at', [$month->copy()->startOfMonth(), $month->copy()->endOfMonth()])
                        ->count(),
                    'returned' => MetadataReview::query()
                        ->where(MetadataReview::column('review_status'), 'needs_correction')
                        ->whereBetween('updated_at', [$month->copy()->startOfMonth(), $month->copy()->endOfMonth()])
                        ->count(),
                ];
            })->values()->all();

            return ['months' => $months];
        };

        $archivedEvents = $this->repositoryDocuments()
            ->whereNotNull('archived_at')
            ->latest('archived_at')
            ->limit(5)
            ->get(['id', 'title', 'archived_at'])
            ->map(fn (ResearchDocument $document): array => [
                'id' => 'archived-'.$document->id,
                'research_document_id' => $document->id,
                'title' => $document->title,
                'type' => 'record_archived',
                'occurred_at' => $document->archived_at?->toISOString(),
            ]);
        $reviewEvents = MetadataReview::query()
            ->with('researchDocument:id,title')
            ->latest('updated_at')
            ->limit(5)
            ->get()
            ->map(function (MetadataReview $review): array {
                $type = match ($review->review_status) {
                    'complete' => 'archiving_review_completed',
                    'needs_correction' => 'record_returned',
                    default => 'metadata_updated',
                };

                return [
                    'id' => 'metadata-'.$review->id,
                    'research_document_id' => $review->research_document_id,
                    'title' => $review->researchDocument?->title ?? 'Research record',
                    'type' => $type,
                    'occurred_at' => $review->updated_at?->toISOString(),
                ];
            });

        return [
            'schema_version' => 1,
            'counts' => [
                'archiving_queue' => $queue->count(),
                'metadata_validation' => $metadataValidation,
                'repository_records' => (clone $repository)->count(),
                'archived_this_month' => $archivedThisMonth,
            ],
            'queue' => $queue->take(10)->values(),
            'queue_status' => [
                'pending' => $queue->where('status', 'pending')->count(),
                'validating' => $queue->where('status', 'validating')->count(),
                'ready' => $queue->where('status', 'ready')->count(),
            ],
            'activity' => [
                'six_months' => $activityFor(6),
                'twelve_months' => $activityFor(12),
            ],
            'recent_activity' => $archivedEvents
                ->concat($reviewEvents)
                ->filter(fn (array $event): bool => $event['occurred_at'] !== null)
                ->sortByDesc('occurred_at')
                ->take(5)
                ->values(),
        ];
    }

    private function researchOfficeSections(User $actor): array
    {
        return [
            $this->researchSection('assigned_research', $this->assignedDocuments($actor, 'research-office')),
            $this->researchSection('submission_queue', ResearchDocument::query()->whereIn('submission_status', ['submitted', 'under_review'])),
            $this->researchSection('revision_requests', ResearchDocument::query()->where('submission_status', 'revision_required')),
            $this->researchSection('pending_archiving', ResearchDocument::query()->where('archive_status', 'pending_archiving')),
            $this->researchSection('archived_repository', $this->repositoryDocuments()),
        ];
    }

    private function assignedDocuments(User $actor, string $reviewRole): Builder
    {
        if (! ReviewAssignment::identityCompatible()) {
            return ResearchDocument::query()->whereRaw('1 = 0');
        }

        return ResearchDocument::query()->whereHas('reviewAssignments', fn (Builder $assignments) => $assignments
            ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
            ->where(ReviewAssignment::column('review_role'), $reviewRole)
            ->whereIn(
                ReviewAssignment::column('is_active'),
                ReviewAssignment::column('is_active') === 'status'
                    ? ['accepted', 'confirmed', 'active']
                    : [true],
            ));
    }

    private function repositoryDocuments(): Builder
    {
        return ResearchDocument::query()->inRepository();
    }

    private function countSection(string $key, Builder $query): array
    {
        return [
            'key' => $key,
            'state' => 'ready',
            'total' => (clone $query)->count(),
            'reason' => null,
            'items' => [],
        ];
    }

    private function researchSection(string $key, Builder $query): array
    {
        $items = (clone $query)
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(10)
            ->get(self::PREVIEW_COLUMNS)
            ->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'research_stage' => $document->research_stage,
                'submission_status' => $document->submission_status,
                'archive_status' => $document->archive_status,
                'visibility' => $document->visibility,
                'publication_year' => $document->publication_year,
                'updated_at' => $document->updated_at?->toISOString(),
            ])
            ->values()
            ->all();

        return [
            'key' => $key,
            'state' => 'ready',
            'total' => (clone $query)->count(),
            'reason' => null,
            'items' => $items,
        ];
    }

    private function unavailableSection(string $key, string $reason): array
    {
        return [
            'key' => $key,
            'state' => 'unavailable',
            'total' => null,
            'reason' => $reason,
            'items' => [],
        ];
    }
}
