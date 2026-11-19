<?php

namespace App\Http\Controllers;

use App\Models\DefenseSchedule;
use App\Models\Evaluation;
use App\Models\MetadataReview;
use App\Models\MethodologyReview;
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
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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
            'panel' => $effectiveRole === 'panel'
                ? $this->panelDashboard($actor)
                : null,
            'librarian' => $effectiveRole === 'librarian'
                ? $this->librarianDashboard()
                : null,
            'editor' => $effectiveRole === 'research_editor'
                ? $this->editorDashboard($actor)
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

    /**
     * Evaluation records do not identify a defense stage, so the dashboard
     * reports the stage authorized by the active panel assignment only.
     */
    private function panelDashboard(User $actor): array
    {
        $finalEvaluationStorage = (new Evaluation)->usesFinalStorage();
        $evaluationReviewerColumn = $finalEvaluationStorage ? 'reviewer_id' : Evaluation::column('panelist_id');
        $evaluationSubmittedColumn = $finalEvaluationStorage ? 'reviewed_at' : Evaluation::column('submitted_at');
        $evaluations = fn ($query) => $query
            ->where($evaluationReviewerColumn, $actor->id)
            ->whereNotNull($evaluationSubmittedColumn);
        $assignments = fn ($query) => $query
            ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
            ->where(ReviewAssignment::column('review_role'), 'panel')
            ->whereIn(
                ReviewAssignment::column('is_active'),
                ReviewAssignment::column('is_active') === 'status'
                    ? ['accepted', 'confirmed', 'active']
                    : [true],
            );
        $documents = $this->assignedDocuments($actor, 'panel')
            ->withExists(['evaluations as panel_evaluation_submitted' => $evaluations])
            ->with(['reviewAssignments' => fn ($query) => $assignments($query)
                ->latest('created_at')->latest('id')])
            ->orderBy('panel_evaluation_submitted')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get([
                'id',
                'title',
                'submission_reference',
                'research_stage',
                'submission_status',
                'updated_at',
            ]);
        $assignedIds = $documents->pluck('id');
        $assignmentEvents = $documents
            ->map(function (ResearchDocument $document): ?array {
                $assignment = $document->reviewAssignments->first();

                return $assignment?->created_at === null ? null : [
                    'id' => 'assignment-'.$assignment->id,
                    'research_document_id' => $document->id,
                    'title' => $document->title,
                    'type' => 'study_assigned',
                    'occurred_at' => $assignment->created_at->toISOString(),
                ];
            })
            ->filter();
        $evaluationEvents = Evaluation::query()
            ->whereIn(Evaluation::column('research_document_id'), $assignedIds)
            ->where($evaluationReviewerColumn, $actor->id)
            ->whereNotNull($evaluationSubmittedColumn)
            ->latest($evaluationSubmittedColumn)
            ->latest('id')
            ->limit(5)
            ->get(['id', 'research_document_id', $evaluationSubmittedColumn])
            ->map(function (Evaluation $evaluation) use ($documents, $evaluationSubmittedColumn): ?array {
                $document = $documents->firstWhere('id', $evaluation->research_document_id);
                $submittedAt = $evaluation->getAttribute($evaluationSubmittedColumn);

                return $document === null || $submittedAt === null ? null : [
                    'id' => 'evaluation-'.$evaluation->id,
                    'research_document_id' => $document->id,
                    'title' => $document->title,
                    'type' => 'evaluation_submitted',
                    'occurred_at' => $submittedAt->toISOString(),
                ];
            })
            ->filter();
        $recentActivity = $assignmentEvents
            ->concat($evaluationEvents)
            ->sort(function (array $left, array $right): int {
                $dateOrder = strcmp($right['occurred_at'], $left['occurred_at']);

                return $dateOrder !== 0 ? $dateOrder : strcmp($right['id'], $left['id']);
            })
            ->take(5)
            ->values()
            ->all();
        $items = $documents->map(function (ResearchDocument $document): array {
            $assignment = $document->reviewAssignments->first();

            return [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'submission_reference' => $document->submission_reference,
                'defense_stage' => $assignment?->defense_type,
                'review_status' => $document->panel_evaluation_submitted ? 'completed' : 'pending',
                'updated_at' => $document->updated_at?->toISOString(),
            ];
        })->values();

        return [
            'schema_version' => 1,
            'counts' => [
                'assigned' => $items->count(),
                'pending' => $items->where('review_status', 'pending')->count(),
                'completed' => $items->where('review_status', 'completed')->count(),
                'repository_references' => $this->repositoryDocuments()->count(),
            ],
            'assignments' => $items->take(5)->all(),
            'recent_activity' => $recentActivity,
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

    private function editorDashboard(User $actor): array
    {
        $activeStatuses = ['accepted', 'confirmed', 'active'];
        $assignmentTable = (new ReviewAssignment)->getTable();
        $reviewerColumn = ReviewAssignment::column('reviewer_id');
        $roleColumn = ReviewAssignment::column('review_role');
        $activeColumn = ReviewAssignment::column('is_active');
        $applyActiveAssignment = function ($query, string $alias) use ($activeColumn, $activeStatuses): void {
            if ($activeColumn === 'status') {
                $query->whereIn($alias.'.status', $activeStatuses);

                return;
            }

            $query->where($alias.'.'.$activeColumn, true)
                ->when(ReviewAssignment::supportsStatus(), fn ($statusQuery) => $statusQuery
                    ->where(fn ($status) => $status
                        ->whereIn($alias.'.status', $activeStatuses)
                        ->orWhereNull($alias.'.status')));
        };
        $currentAssignments = DB::table($assignmentTable.' as assignments')
            ->join('research_documents as documents', 'documents.id', '=', 'assignments.research_document_id')
            ->whereNull('documents.deleted_at')
            ->where('assignments.'.$reviewerColumn, $actor->id)
            ->where('assignments.'.$roleColumn, 'research_editor')
            ->tap(fn ($query) => $applyActiveAssignment($query, 'assignments'))
            ->whereNotExists(function ($query) use ($assignmentTable, $reviewerColumn, $roleColumn, $applyActiveAssignment): void {
                $query->selectRaw('1')
                    ->from($assignmentTable.' as newer')
                    ->whereColumn('newer.research_document_id', 'assignments.research_document_id')
                    ->whereColumn('newer.'.$reviewerColumn, 'assignments.'.$reviewerColumn)
                    ->whereColumn('newer.'.$roleColumn, 'assignments.'.$roleColumn)
                    ->tap(fn ($active) => $applyActiveAssignment($active, 'newer'))
                    ->where(function ($newer): void {
                        $newer->whereColumn('newer.created_at', '>', 'assignments.created_at')
                            ->orWhere(function ($sameTime): void {
                                $sameTime->whereColumn('newer.created_at', 'assignments.created_at')
                                    ->whereColumn('newer.id', '>', 'assignments.id');
                            });
                    });
            })
            ->select([
                'assignments.id as assignment_id',
                'assignments.created_at as assigned_at',
                'documents.id as research_document_id',
                'documents.title',
                'documents.submission_reference',
                'documents.research_stage',
                'documents.submission_status',
                'documents.updated_at',
            ]);

        $documents = (clone $currentAssignments)->get();
        $documentIds = $documents->pluck('research_document_id');
        $reviewTable = Schema::hasTable('research_reviews') ? 'research_reviews' : 'research_review_records';
        $reviewerReviewColumn = $reviewTable === 'research_reviews' ? 'reviewer_id' : 'actor_id';
        $reviewTime = $reviewTable === 'research_reviews'
            ? 'COALESCE(reviews.reviewed_at, reviews.updated_at, reviews.created_at)'
            : 'COALESCE(reviews.resolved_at, reviews.submitted_at, reviews.updated_at, reviews.created_at)';
        $newerReviewTime = $reviewTable === 'research_reviews'
            ? 'COALESCE(newer_reviews.reviewed_at, newer_reviews.updated_at, newer_reviews.created_at)'
            : 'COALESCE(newer_reviews.resolved_at, newer_reviews.submitted_at, newer_reviews.updated_at, newer_reviews.created_at)';
        $reviewTypes = ['editorial_comment', 'editorial_correction', 'editorial_clearance'];
        $reviewQuery = fn () => DB::table($reviewTable.' as reviews')
            ->joinSub($currentAssignments, 'current_assignments', fn ($join) => $join
                ->on('current_assignments.research_document_id', '=', 'reviews.research_document_id'))
            ->where('reviews.'.$reviewerReviewColumn, $actor->id)
            ->when($reviewTable === 'research_reviews', fn ($query) => $query->where('reviews.reviewer_role', 'research_editor'))
            ->whereIn('reviews.review_type', $reviewTypes)
            ->whereRaw($reviewTime.' >= current_assignments.assigned_at');
        $latestReviews = $documentIds->isEmpty()
            ? collect()
            : $reviewQuery()
                ->whereNotExists(function ($query) use ($reviewTable, $reviewerReviewColumn, $reviewTypes, $reviewTime, $newerReviewTime, $actor): void {
                    $query->selectRaw('1')
                        ->from($reviewTable.' as newer_reviews')
                        ->whereColumn('newer_reviews.research_document_id', 'reviews.research_document_id')
                        ->where('newer_reviews.'.$reviewerReviewColumn, $actor->id)
                        ->when($reviewTable === 'research_reviews', fn ($newer) => $newer->where('newer_reviews.reviewer_role', 'research_editor'))
                        ->whereIn('newer_reviews.review_type', $reviewTypes)
                        ->whereRaw($newerReviewTime.' >= current_assignments.assigned_at')
                        ->where(fn ($newer) => $newer
                            ->whereRaw($newerReviewTime.' > '.$reviewTime)
                            ->orWhere(fn ($sameTime) => $sameTime
                                ->whereRaw($newerReviewTime.' = '.$reviewTime)
                                ->whereColumn('newer_reviews.id', '>', 'reviews.id')));
                })
                ->get([
                    'reviews.id', 'reviews.research_document_id', 'reviews.review_type', 'reviews.status',
                    DB::raw($reviewTime.' as occurred_at'),
                ])
                ->keyBy('research_document_id');
        $reviews = $documentIds->isEmpty()
            ? collect()
            : $reviewQuery()
                ->orderByDesc(DB::raw($reviewTime))
                ->orderByDesc('reviews.id')
                ->limit(6)
                ->get([
                    'reviews.id', 'reviews.research_document_id', 'reviews.review_type', 'reviews.status',
                    DB::raw($reviewTime.' as occurred_at'),
                ]);
        $assignments = $documents->map(function (object $document) use ($latestReviews): array {
            $review = $latestReviews->get($document->research_document_id);
            $completed = $review !== null
                && $review->review_type === 'editorial_clearance'
                && $review->status === 'completed';

            return [
                'research_document_id' => $document->research_document_id,
                'title' => $document->title,
                'submission_reference' => $document->submission_reference,
                'research_stage' => $document->research_stage,
                'submission_status' => $document->submission_status,
                'review_status' => $completed ? 'completed' : 'for_review',
                'updated_at' => $document->updated_at === null
                    ? null
                    : Carbon::parse($document->updated_at)->toISOString(),
            ];
        });
        $forReview = $assignments->where('review_status', 'for_review')->count();
        $completed = $assignments->where('review_status', 'completed')->count();
        $orderedAssignments = $assignments
            ->sort(function (array $left, array $right): int {
                $statusOrder = ($left['review_status'] === 'for_review' ? 0 : 1)
                    <=> ($right['review_status'] === 'for_review' ? 0 : 1);
                if ($statusOrder !== 0) {
                    return $statusOrder;
                }
                $dateOrder = strcmp((string) $right['updated_at'], (string) $left['updated_at']);

                return $dateOrder !== 0
                    ? $dateOrder
                    : $right['research_document_id'] <=> $left['research_document_id'];
            })
            ->take(5)
            ->values();
        $titleByDocument = $documents->keyBy('research_document_id');
        $assignmentEvents = $documents->map(function (object $document): ?array {
            if ($document->assigned_at === null) {
                return null;
            }

            return [
                'id' => 'assignment-'.$document->assignment_id,
                'research_document_id' => $document->research_document_id,
                'title' => $document->title,
                'type' => 'study_assigned',
                'occurred_at' => Carbon::parse($document->assigned_at)->toISOString(),
            ];
        })->filter();
        $reviewEvents = $reviews->take(6)->map(function (object $review) use ($titleByDocument): ?array {
            $document = $titleByDocument->get($review->research_document_id);
            if ($document === null || $review->occurred_at === null) {
                return null;
            }

            return [
                'id' => 'review-'.$review->id,
                'research_document_id' => $review->research_document_id,
                'title' => $document->title,
                'type' => $review->review_type === 'editorial_clearance' && $review->status === 'completed'
                    ? 'review_completed'
                    : 'review_recorded',
                'occurred_at' => Carbon::parse($review->occurred_at)->toISOString(),
            ];
        })->filter();
        $pendingRequests = ReviewAssignment::identityCompatible()
            ? ReviewAssignment::query()
                ->where($reviewerColumn, $actor->id)
                ->where($roleColumn, 'research_editor')
                ->when(
                    ReviewAssignment::supportsStatus(),
                    fn ($query) => $query->whereIn('status', ['requested', 'pending']),
                    fn ($query) => $query->where($activeColumn, false),
                )
                ->whereHas('researchDocument')
                ->count()
            : 0;

        return [
            'schema_version' => 1,
            'counts' => [
                'pending_requests' => $pendingRequests,
                'assigned_research' => $assignments->count(),
                'for_review' => $forReview,
                'completed_reviews' => $completed,
            ],
            'workload' => [
                'for_review' => $forReview,
                'completed' => $completed,
            ],
            'assignments' => $orderedAssignments->all(),
            'recent_activity' => $assignmentEvents
                ->concat($reviewEvents)
                ->sort(function (array $left, array $right): int {
                    $dateOrder = strcmp($right['occurred_at'], $left['occurred_at']);

                    return $dateOrder !== 0 ? $dateOrder : strcmp($right['id'], $left['id']);
                })
                ->take(6)
                ->values()
                ->all(),
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
