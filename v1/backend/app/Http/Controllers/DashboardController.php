<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\DefenseSchedule;
use App\Models\MetadataReview;
use App\Models\MethodologyReview;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\SavedLibraryItem;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use App\Services\DomainAuthorization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends DomainController
{
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

    public function index(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $effectiveRole = $actor->roleDefinition?->slug === 'research_editor' ? 'research_editor' : $actor->role;
        $sections = DomainAuthorization::isActiveAdministrator($actor) ? $this->adminSections() : match ($effectiveRole) {
            'researcher' => $this->researcherSections($actor),
            'adviser' => $this->adviserSections($actor),
            'instructor' => $this->instructorSections($actor),
            'panel' => $this->panelSections($actor),
            'statistician' => $this->statisticianSections($actor),
            'coordinator' => $this->coordinatorSections(),
            'librarian' => $this->librarianSections(),
            'research-office' => $this->researchOfficeSections(),
            'academics' => $this->academicsSections($actor),
            'research_editor' => [],
            default => null,
        };

        if ($sections === null) {
            return response()->json(['error' => 'ROLE_NOT_AUTHORIZED'], 403);
        }

        return response()
            ->json(['data' => [
                'schema_version' => 1,
                'role' => $effectiveRole,
                'sections' => $sections,
                'analytics' => $this->analytics($actor),
            ]])
            ->header('Cache-Control', 'private, no-store');
    }

    private function analytics(User $actor): array
    {
        $query = $this->analyticsDocuments($actor);
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

    private function analyticsDocuments(User $actor): Builder
    {
        if (DomainAuthorization::isActiveAdministrator($actor)) {
            return ResearchDocument::query();
        }

        return match ($actor->role) {
            'researcher' => $this->researcherDocuments($actor),
            'adviser' => $this->assignedDocuments($actor, 'adviser'),
            'instructor' => $this->assignedDocuments($actor, 'instructor'),
            'panel' => $this->assignedDocuments($actor, 'panel'),
            'statistician' => $this->assignedDocuments($actor, 'statistician'),
            'academics' => $this->repositoryDocuments(),
            default => ResearchDocument::query(),
        };
    }

    private function adminSections(): array
    {
        return [
            $this->countSection('active_accounts', User::query()->where('access_status', 'active')),
            $this->countSection('pending_accounts', User::query()->whereIn('access_status', ['invited', 'blocked'])),
            $this->countSection('audit_events', AuditLog::query()),
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

    /**
     * A researcher only ever sees the records they submitted, plus the archived
     * catalog everyone may reference. Every query is scoped by `submitted_by`.
     */
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
        return ResearchDocument::query()->where(function (Builder $query) use ($actor): void {
            $query->where('submitted_by', $actor->id)
                ->orWhereHas('authors', fn (Builder $authors) => $authors->where('user_id', $actor->id));
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
            $this->countSection('defense_schedule', DefenseSchedule::query()->where('status', 'scheduled')->whereHas('researchDocument', fn (Builder $documents) => $documents->whereHas('reviewAssignments', fn (Builder $assignments) => $assignments->where('reviewer_id', $actor->id)->where('review_role', 'panel')->where('is_active', true)))),
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

    private function coordinatorSections(): array
    {
        return [
            $this->countSection('active_instructors', User::query()->where('role', 'instructor')->where('access_status', 'active')),
            $this->countSection('invited_instructors', User::query()->where('role', 'instructor')->where('access_status', 'invited')),
            $this->countSection('blocked_instructors', User::query()->where('role', 'instructor')->where('access_status', 'blocked')),
            $this->countSection('schedules', DefenseSchedule::query()->where('status', 'scheduled')),
            $this->countSection('duplicate_flags', SimilarityResult::query()->latestPerPair()->where('adviser_review_required', true)),
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

    private function researchOfficeSections(): array
    {
        return [
            $this->researchSection('submission_queue', ResearchDocument::query()->whereIn('submission_status', ['submitted', 'under_review'])),
            $this->researchSection('revision_requests', ResearchDocument::query()->where('submission_status', 'revision_required')),
            $this->researchSection('pending_archiving', ResearchDocument::query()->where('archive_status', 'pending_archiving')),
            $this->researchSection('archived_repository', $this->repositoryDocuments()),
        ];
    }

    private function academicsSections(User $actor): array
    {
        return [
            $this->researchSection('repository_references', $this->repositoryDocuments()),
            $this->countSection('saved_library', SavedLibraryItem::query()->where('user_id', $actor->id)),
            $this->countSection('recommendations', SimilarityResult::query()->latestPerPair()
                ->whereIn('source_research_id', SavedLibraryItem::query()->where('user_id', $actor->id)->select('research_document_id'))
                ->whereNotIn('matched_research_id', SavedLibraryItem::query()->where('user_id', $actor->id)->select('research_document_id'))),
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
            ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true));
    }

    private function repositoryDocuments(): Builder
    {
        return ResearchDocument::query()
            ->whereIn('submission_status', ['approved', 'archived'])
            ->where('archive_status', 'archived')
            ->whereIn('visibility', ['registered_only', 'public']);
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
