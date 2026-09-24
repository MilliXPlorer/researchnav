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
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReportingService
{
    public function __construct(private readonly CoordinatorInstituteScope $coordinatorScope) {}

    public function coordinatorProgram(User $actor, ?string $program = null): array
    {
        $institute = $this->coordinatorScope->institute($actor);
        $documents = $this->coordinatorScope->documents($actor)
            ->when($program !== null && trim($program) !== '', fn ($query) => $query->where('degree_program', trim($program)));
        $users = $this->coordinatorScope->users($actor);

        return [
            'schema_version' => 1,
            'filters' => [
                'institute' => $institute,
                'program' => $program !== null && trim($program) !== '' ? trim($program) : null,
            ],
            'counts' => [
                'active_instructors' => (clone $users)->where('role', 'instructor')->where('access_status', 'active')->count(),
                'active_advisers' => (clone $users)->where('role', 'adviser')->where('access_status', 'active')->count(),
                'active_researchers' => DB::table('research_authors')
                    ->whereIn('research_document_id', (clone $documents)->select('id'))
                    ->whereNotNull('user_id')
                    ->whereIn('user_id', (clone $users)->select('id'))
                    ->distinct()
                    ->count('user_id'),
                'draft' => (clone $documents)->where('submission_status', 'draft')->count(),
                'submitted' => (clone $documents)->where('submission_status', 'submitted')->count(),
                'under_review' => (clone $documents)->where('submission_status', 'under_review')->count(),
                'revision_required' => (clone $documents)->where('submission_status', 'revision_required')->count(),
                'approved' => (clone $documents)->where('submission_status', 'approved')->count(),
                'archived' => (clone $documents)->where('submission_status', 'archived')->count(),
                'flagged_similarity' => $this->similarityQuery($documents)->count(),
                'defenses_scheduled' => DefenseSchedule::query()->where('status', 'scheduled')->whereIn('research_document_id', (clone $documents)->select('id'))->count(),
                'defenses_completed' => DefenseSchedule::query()->where('status', 'completed')->whereIn('research_document_id', (clone $documents)->select('id'))->count(),
                'evaluations_submitted' => Evaluation::query()->whereIn(Evaluation::column('research_document_id'), (clone $documents)->select('id'))->count(),
                'methodology_signed_off' => MethodologyReview::query()->whereIn(MethodologyReview::column('research_document_id'), (clone $documents)->select('id'))->where(MethodologyReview::column('review_status'), 'signed_off')->count(),
            ],
            'by_section' => ClassSection::query()
                ->whereIn('id', (clone $documents)->whereNotNull('section_id')->select('section_id'))
                ->withCount(['researchDocuments' => function ($query) use ($institute, $program): void {
                    if ($institute !== null && trim($institute) !== '') {
                        $query->where('institute', trim($institute));
                    }
                    if ($program !== null && trim($program) !== '') {
                        $query->where('degree_program', trim($program));
                    }
                }])
                ->orderBy('name')
                ->get()
                ->map(fn (ClassSection $section) => [
                    'id' => $section->id,
                    'name' => $section->name,
                    'documents_count' => $section->research_documents_count,
                ])
                ->all(),
            'instructors' => $this->scopedInstructors($documents),
            'adviser_load' => $this->adviserLoad($actor, $documents),
            'studies' => $this->scopedStudies($documents),
            'researchers' => $this->scopedResearchers($documents, $users),
            'defense_schedules' => $this->recentDefenseSchedules($documents),
            'evaluations' => $this->recentEvaluations($documents),
            'methodology_reviews' => $this->recentMethodologySignoffs($documents),
            'active_instructors_list' => $this->activePeople('instructor', $users),
            'active_advisers_list' => $this->activePeople('adviser', $users),
        ];
    }

    private function activePeople(string $role, $users): array
    {
        return (clone $users)
            ->where('role', $role)
            ->where('access_status', 'active')
            ->orderBy('first_name')
            ->limit(300)
            ->get(['id', 'first_name', 'middle_name', 'last_name', 'email'])
            ->map(fn (User $user) => [
                'id' => (string) $user->id,
                'name' => $user->displayName(),
                'email' => $user->email,
            ])
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function scopedStudies($documents): array
    {
        return collect(ResearchDocument::SUBMISSION_STATUSES)
            ->flatMap(fn (string $status) => (clone $documents)
                ->where('submission_status', $status)
                ->with('section:id,name')
                ->latest('updated_at')
                ->limit(300)
                ->get(['id', 'title', 'research_stage', 'submission_status', 'institute', 'degree_program', 'section_id', 'updated_at'])
                ->map(fn (ResearchDocument $document) => [
                    'id' => $document->id,
                    'title' => $document->title,
                    'research_stage' => $document->research_stage,
                    'submission_status' => $document->submission_status,
                    'institute' => $document->institute,
                    'degree_program' => $document->degree_program,
                    'section' => $document->section?->name,
                    'updated_at' => $document->updated_at?->toISOString(),
                ]))
            ->values()
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function scopedResearchers($documents, $users): array
    {
        $authorCounts = DB::table('research_authors')
            ->whereIn('research_document_id', (clone $documents)->select('id'))
            ->whereNotNull('user_id')
            ->selectRaw('user_id, count(distinct research_document_id) as documents_count')
            ->groupBy('user_id')
            ->pluck('documents_count', 'user_id');
        if ($authorCounts->isEmpty()) {
            return [];
        }
        $researchers = (clone $users)
            ->whereIn('id', $authorCounts->keys()->all())
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->limit(300)
            ->get(['id', 'first_name', 'middle_name', 'last_name', 'email']);

        return $researchers
            ->map(fn (User $user) => [
                'user_id' => (string) $user->id,
                'name' => $user->displayName(),
                'email' => $user->email,
                'documents_count' => (int) ($authorCounts[(string) $user->id] ?? $authorCounts[$user->id] ?? 0),
            ])
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function recentDefenseSchedules($documents): array
    {
        return DefenseSchedule::query()
            ->whereIn('research_document_id', (clone $documents)->select('id'))
            ->with('researchDocument:id,title,research_stage,submission_status')
            ->latest('scheduled_at')
            ->limit(200)
            ->get()
            ->map(fn (DefenseSchedule $schedule) => [
                'id' => $schedule->id,
                'title' => $schedule->researchDocument?->title,
                'research_stage' => $schedule->researchDocument?->research_stage,
                'submission_status' => $schedule->researchDocument?->submission_status,
                'status' => $schedule->status,
                'scheduled_at' => $schedule->scheduled_at?->toISOString(),
                'room' => $schedule->room,
            ])
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function recentEvaluations($documents): array
    {
        // In finalized installations evaluations live in research_reviews,
        // which uses reviewed_at instead of the legacy submitted_at column.
        $finalStorage = (new Evaluation)->usesFinalStorage();

        return Evaluation::query()
            ->whereIn(Evaluation::column('research_document_id'), (clone $documents)->select('id'))
            ->with('researchDocument:id,title')
            ->when(! $finalStorage, fn ($query) => $query->with('panelist:id,first_name,middle_name,last_name'))
            ->latest($finalStorage ? 'reviewed_at' : 'submitted_at')
            ->limit(200)
            ->get()
            ->map(fn (Evaluation $evaluation) => [
                'id' => $evaluation->id,
                'title' => $evaluation->researchDocument?->title,
                'panelist' => $finalStorage ? null : $evaluation->panelist?->displayName(),
                'originality' => $finalStorage ? null : $evaluation->originality,
                'methodology' => $finalStorage ? null : $evaluation->methodology,
                'clarity' => $finalStorage ? null : $evaluation->clarity,
                'submitted_at' => $finalStorage
                    ? ($evaluation->reviewed_at ? Carbon::parse($evaluation->reviewed_at)->toISOString() : null)
                    : $evaluation->submitted_at?->toISOString(),
            ])
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function recentMethodologySignoffs($documents): array
    {
        $statusColumn = MethodologyReview::column('review_status');

        return MethodologyReview::query()
            ->whereIn(MethodologyReview::column('research_document_id'), (clone $documents)->select('id'))
            ->where($statusColumn, 'signed_off')
            ->with(['researchDocument:id,title', 'statistician:id,first_name,middle_name,last_name'])
            ->latest(MethodologyReview::column('signed_off_at'))
            ->limit(200)
            ->get()
            ->map(fn (MethodologyReview $review) => [
                'id' => $review->id,
                'title' => $review->researchDocument?->title,
                'statistician' => $review->statistician?->displayName(),
                'signed_off_at' => $review->signed_off_at?->toISOString(),
            ])
            ->all();
    }

    private function scopedInstructors($documents): array
    {
        $scopedDocuments = (clone $documents)
            ->whereNotNull('section_id')
            ->get(['id', 'title', 'section_id'])
            ->groupBy('section_id');

        return ClassSection::query()
            ->whereIn('id', $scopedDocuments->keys()->all())
            ->with('instructor:id,first_name,middle_name,last_name,email')
            ->get()
            ->filter(fn (ClassSection $section) => $section->instructor !== null)
            ->groupBy(fn (ClassSection $section) => $section->instructor->id)
            ->map(fn (Collection $sections, $instructorId) => [
                'user_id' => (string) $instructorId,
                'name' => $sections->first()->instructor->displayName(),
                'email' => $sections->first()->instructor->email,
                'sections' => $sections->pluck('name')->unique()->values()->all(),
                'studies' => $sections
                    ->flatMap(fn (ClassSection $section) => $scopedDocuments->get($section->id, collect()))
                    ->unique('id')
                    ->sortBy('title')
                    ->map(fn (ResearchDocument $document) => [
                        'id' => $document->id,
                        'title' => $document->title,
                    ])
                    ->values()
                    ->all(),
            ])
            ->sortBy('name')
            ->values()
            ->all();
    }

    public function adviserLoad(User $actor, $documents = null): array
    {
        $active = ReviewAssignment::column('is_active');
        $documents ??= $this->coordinatorScope->documents($actor);
        $users = $this->coordinatorScope->users($actor);

        return ReviewAssignment::query()
            ->where(ReviewAssignment::column('review_role'), 'adviser')
            ->whereIn(ReviewAssignment::column('research_document_id'), (clone $documents)->select('id'))
            ->whereIn(ReviewAssignment::column('reviewer_id'), (clone $users)->select('id'))
            ->when(
                $active === 'status',
                fn ($query) => $query->where($active, 'active')
            )
            ->when(
                $active === 'is_active',
                fn ($query) => $query->where($active, true)
            )
            ->with('reviewer:id,first_name,middle_name,last_name,email')
            ->with('researchDocument:id,title,submission_status,research_stage')
            ->get()
            ->groupBy('reviewer_id')
            ->map(fn ($assignments, $reviewerId) => [
                'user_id' => $reviewerId,
                'name' => $assignments->first()->reviewer ? trim(implode(' ', array_filter([
                    $assignments->first()->reviewer->first_name, $assignments->first()->reviewer->middle_name, $assignments->first()->reviewer->last_name,
                ]))) : null,
                'email' => $assignments->first()->reviewer?->email,
                'active_assignments' => $assignments->count(),
                'studies' => $assignments
                    ->map(fn ($assignment) => $assignment->researchDocument)
                    ->filter()
                    ->unique('id')
                    ->take(50)
                    ->map(fn ($document) => [
                        'id' => $document->id,
                        'title' => $document->title,
                        'submission_status' => $document->submission_status,
                        'research_stage' => $document->research_stage,
                    ])
                    ->values()
                    ->all(),
            ])
            ->values()
            ->sortByDesc('active_assignments')
            ->values()
            ->all();
    }

    public function duplicateFlags(User $actor): array
    {
        $documents = $this->coordinatorScope->documents($actor);

        return $this->similarityQuery($documents)
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

    private function similarityQuery($documents)
    {
        return SimilarityResult::query()
            ->latestPerPair()
            ->where('adviser_review_required', true)
            ->whereIn('source_research_id', (clone $documents)->select('id'))
            ->whereIn('matched_research_id', (clone $documents)->select('id'));
    }

    public function officeInstitutional(): array
    {
        $documents = ResearchDocument::query();
        $repositoryDocuments = ResearchDocument::query()->inRepository();
        $instituteColumn = Schema::hasColumn('research_documents', 'institute')
            ? 'institute'
            : 'academic_unit';
        $instituteExpression = "COALESCE({$instituteColumn}, institution_name)";
        $repositoryTotal = (clone $repositoryDocuments)->count();
        $byInstitute = (clone $repositoryDocuments)
            ->whereIn(DB::raw($instituteExpression), ResearchDocument::INSTITUTES)
            ->selectRaw("{$instituteExpression} as institute, count(*) as total")
            ->groupByRaw($instituteExpression)
            ->get()
            ->mapWithKeys(fn ($row) => [$row->institute => (int) $row->total]);
        $assignedInstituteTotal = $byInstitute->sum();

        return [
            'schema_version' => 1,
            'counts' => [
                'total_users' => User::query()->count(),
                'active_users' => User::query()->where('access_status', 'active')->count(),
                'pending_archiving' => (clone $documents)->where('archive_status', 'pending_archiving')->count(),
                'archived' => $repositoryTotal,
                'flagged_similarity' => SimilarityResult::query()->latestPerPair()->where('adviser_review_required', true)->count(),
                'audit_events' => AuditLog::query()->count(),
                'evaluations_submitted' => Evaluation::query()->count(),
                'methodology_signed_off' => MethodologyReview::query()->where(MethodologyReview::column('review_status'), 'signed_off')->count(),
            ],
            'by_institute' => collect(ResearchDocument::INSTITUTES)
                ->map(fn (string $institute) => [
                    'institute' => $institute,
                    'total' => $byInstitute->get($institute, 0),
                ])
                ->when(
                    $assignedInstituteTotal < $repositoryTotal,
                    fn (Collection $rows) => $rows->push([
                        'institute' => 'Unassigned / Other',
                        'total' => $repositoryTotal - $assignedInstituteTotal,
                    ])
                )
                ->all(),
            'by_status' => collect(ResearchDocument::SUBMISSION_STATUSES)
                ->map(fn (string $status) => ['status' => $status, 'total' => (clone $documents)->where('submission_status', $status)->count()])
                ->all(),
            'by_sdg' => DB::table('sdgs')
                ->leftJoin('research_document_sdgs', 'research_document_sdgs.sdg_id', '=', 'sdgs.id')
                ->leftJoin('research_documents', function ($join): void {
                    $join->on('research_documents.id', '=', 'research_document_sdgs.research_document_id')
                        ->whereNull('research_documents.deleted_at');
                })
                ->select(['sdgs.id', 'sdgs.code', 'sdgs.title', 'sdgs.color_hex'])
                ->selectRaw('count(research_documents.id) as total')
                ->groupBy('sdgs.id', 'sdgs.code', 'sdgs.title', 'sdgs.color_hex')
                ->orderBy('sdgs.id')
                ->get()
                ->map(fn ($row) => ['id' => (int) $row->id, 'code' => $row->code, 'title' => $row->title, 'color_hex' => $row->color_hex, 'total' => (int) $row->total])
                ->all(),
        ];
    }
}
