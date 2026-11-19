<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Http\Resources\CoordinatorRepositoryDetailResource;
use App\Http\Resources\CoordinatorRepositoryItemResource;
use App\Models\ClassSection;
use App\Models\DefenseSchedule;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Services\AuditService;
use App\Services\CoordinatorInstituteScope;
use App\Services\CoordinatorProgramOverviewService;
use App\Services\DefenseScheduleService;
use App\Services\GroupedManuscriptArchiveBuilder;
use App\Services\GroupedManuscriptArchiveException;
use App\Services\InstitutionalPdfService;
use App\Services\PrivateDocumentFileResolver;
use App\Services\PublicManuscriptAvailability;
use App\Services\ReportingService;
use App\Services\RepositoryFileChooser;
use App\Services\RepositoryReadService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class CoordinatorWorkspaceController extends DomainController
{
    private const INSTITUTE_ACRONYMS = [
        'Institute of Computer Studies' => 'ICS',
        'Institute of Health Sciences' => 'IHS',
        'Institute of Business and Financial Management' => 'IBFS',
        'Institute of Arts and Sciences' => 'IAS',
        'Institute of Criminal Justice Education' => 'ICJE',
        'Institute of Teacher Education' => 'ITE',
    ];

    public function programOverview(Request $request, CoordinatorProgramOverviewService $overview): JsonResponse
    {
        return response()
            ->json(['data' => $overview->get($this->actor($request))])
            ->header('Cache-Control', 'private, no-store');
    }

    public function repository(Request $request, CoordinatorInstituteScope $scope, RepositoryReadService $repository): JsonResponse
    {
        $validator = Validator::make($request->query(), [
            'bucket' => ['nullable', Rule::in(['all', 'ongoing', 'archived', 'recycle'])],
            'search' => ['nullable', 'string', 'max:200'],
            'visibility' => ['nullable', Rule::in(ResearchDocument::VISIBILITIES)],
            'publication_year' => ['nullable', 'integer', 'between:1901,2155'],
            'sort' => ['nullable', Rule::in(['title', 'submission_status', 'visibility', 'publication_year', 'updated_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }
        $input = $validator->validated();
        $institute = $scope->institute($this->actor($request));
        $bucket = $input['bucket'] ?? 'all';
        $query = $bucket === 'recycle' ? ResearchDocument::onlyTrashed() : ResearchDocument::query();
        // An authoritative administrator receives a global view. Coordinators
        // always receive the fail-closed institute predicate from the scope.
        if ($institute !== null) {
            $query->where('institute', $institute);
        }
        $repository->query($query, $input, $bucket);
        $page = $query->paginate($input['per_page'] ?? 10)->appends($request->query());

        return CoordinatorRepositoryItemResource::collection($page)->additional([
            'schema_version' => 1,
            'summary' => $repository->summary($institute),
            'filters' => ['years' => $repository->years($institute)],
            'institute' => ['name' => $institute, 'acronym' => $this->instituteAcronym($institute)],
        ])->response()->header('Cache-Control', 'private, no-store');
    }

    public function repositoryDetail(string $researchDocument, Request $request, CoordinatorInstituteScope $scope): JsonResponse
    {
        $document = $scope->documents($this->actor($request))
            ->withTrashed()
            ->with([
                'sdgs:id,code,title,short_title,color_hex',
                'authors:id,research_document_id,user_id,author_name,author_order,is_corresponding_author',
                'authors.user:id,email,first_name,middle_name,last_name,role,institute,access_status,account_status,deleted_at',
                'files:id,research_document_id,document_type,upload_purpose,version_number,file_order,original_filename,file_extension,mime_type,file_size,is_current,uploaded_at',
            ])->findOrFail($researchDocument);

        return (new CoordinatorRepositoryDetailResource($document))
            ->additional(['schema_version' => 1])->response()->header('Cache-Control', 'private, no-store');
    }

    public function repositoryDownload(string $researchDocument, Request $request, CoordinatorInstituteScope $scope, PrivateDocumentFileResolver $files, PublicManuscriptAvailability $manuscripts, RepositoryFileChooser $chooser, GroupedManuscriptArchiveBuilder $archives)
    {
        $document = $scope->documents($this->actor($request))
            ->where('archive_status', 'archived')
            ->with('files')
            ->findOrFail($researchDocument);
        $availableFiles = $manuscripts->availableFiles($document)
            ->sortBy(fn ($file): string => sprintf('%010d:%s', $file->file_order ?? PHP_INT_MAX, $file->original_filename))
            ->values();
        abort_if($availableFiles->isEmpty(), 404);
        if (! $request->has('file') && ! $request->boolean('all')) {
            return $chooser->response($document, $availableFiles, fn (array $query): string => route('coordinator.repository.download', ['researchDocument' => $document->id, ...$query]));
        }
        $file = $availableFiles->first();
        if ($request->boolean('all')) {
            try {
                $archive = $archives->build($document, $availableFiles);
            } catch (GroupedManuscriptArchiveException) {
                return response()->json(['error' => 'MANUSCRIPT_ARCHIVE_UNAVAILABLE'], 503);
            }
            app(AuditService::class)->log($this->actor($request), 'DOCUMENT_DOWNLOADED', $file, 'Coordinator downloaded archived institute manuscripts.', $request);
            try {
                return response()->download($archive->path, $archive->downloadName, [
                    'Cache-Control' => 'private, no-store',
                    'Content-Type' => 'application/zip',
                    'X-Content-Type-Options' => 'nosniff',
                ])->deleteFileAfterSend(true);
            } catch (\Throwable $exception) {
                $archive->cleanup();

                throw $exception;
            }
        }
        $selectedId = filter_var($request->query('file'), FILTER_VALIDATE_INT);
        $file = $selectedId === false ? null : $availableFiles->firstWhere('id', $selectedId);
        abort_if($file === null, 404);
        app(AuditService::class)->log($this->actor($request), 'DOCUMENT_PREVIEWED', $file, 'Coordinator viewed an archived institute manuscript.', $request);
        $resolved = $files->resolve($document, $file);
        $disposition = strtolower((string) $file->file_extension) === 'pdf' ? 'inline' : 'attachment';
        $filename = str_replace(['"', "\r", "\n"], '_', $file->original_filename);

        return response()->stream(function () use ($files, $resolved): void {
            $handle = $files->open($resolved);
            try {
                fpassthru($handle);
            } finally {
                fclose($handle);
            }
        }, 200, ['Content-Type' => $file->mime_type, 'Content-Disposition' => $disposition.'; filename="'.$filename.'"', 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function researchAssignments(Request $request, CoordinatorInstituteScope $scope): JsonResponse
    {
        $validator = Validator::make($request->query(), [
            'search' => ['nullable', 'string', 'max:255'],
            'role' => ['nullable', 'in:instructor,adviser'],
            'access_status' => ['nullable', 'in:active,invited,blocked'],
            'sort' => ['nullable', 'in:name,last_name,email,role,access_status,created_at'],
            'direction' => ['nullable', 'in:asc,desc'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }
        $input = $validator->validated();
        $actor = $this->actor($request);
        $directory = $this->assignmentDirectory($actor, $scope);
        $summaryBase = clone $directory;

        if ($search = trim((string) ($input['search'] ?? ''))) {
            $directory->where(function ($query) use ($search): void {
                $query->where('email', 'like', "%{$search}%")
                    ->orWhere('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%");
            });
        }
        if (isset($input['role'])) {
            $directory->where('role', $input['role']);
        }
        if (isset($input['access_status'])) {
            $directory->where('access_status', $input['access_status']);
        }

        $sort = $input['sort'] ?? 'name';
        $direction = $input['direction'] ?? 'asc';
        if (in_array($sort, ['name', 'last_name'], true)) {
            $directory->orderBy('first_name', $direction)->orderBy('last_name', $direction);
        } else {
            $directory->orderBy($sort, $direction);
        }
        $directory->orderBy('id');
        $page = $directory->paginate((int) ($input['per_page'] ?? 10));

        return response()->json([
            'data' => collect($page->items())->map(fn (User $user): array => $this->assignmentUserPayload($user))->all(),
            'summary' => [
                'total_users' => (clone $summaryBase)->distinct()->count('id'),
                'total_instructors' => (clone $summaryBase)->where('role', 'instructor')->count(),
                'total_advisers' => (clone $summaryBase)->where('role', 'adviser')->count(),
                'inactive_users' => (clone $summaryBase)->where('access_status', '!=', 'active')->count(),
            ],
            'meta' => [
                'current_page' => $page->currentPage(),
                'from' => $page->firstItem(),
                'last_page' => $page->lastPage(),
                'path' => $page->path(),
                'per_page' => $page->perPage(),
                'to' => $page->lastItem(),
                'total' => $page->total(),
                'links' => $page->linkCollection()->all(),
            ],
            'schema_version' => 1,
        ])->header('Cache-Control', 'private, no-store');
    }

    public function researchAssignmentStudies(User $user, Request $request, CoordinatorInstituteScope $scope): JsonResponse
    {
        $actor = $this->actor($request);
        $this->assignmentDirectory($actor, $scope)->whereKey($user->getKey())->firstOrFail();

        return response()->json([
            'data' => [
                'user' => $this->assignmentUserPayload($user),
                'studies' => $this->assignedStudies($actor, $user, $scope)->map(fn (ResearchDocument $document): array => $this->studyPayload($document))->values()->all(),
            ],
            'schema_version' => 1,
        ])->header('Cache-Control', 'private, no-store');
    }

    public function researchDetails(ResearchDocument $researchDocument, Request $request, CoordinatorInstituteScope $scope): JsonResponse
    {
        $document = $scope->documents($this->actor($request))
            ->with(['authors', 'section.instructor', 'submitter', 'reviewAssignments.reviewer'])
            ->findOrFail($researchDocument->getKey());

        return response()->json([
            'data' => $this->studyPayload($document, true),
            'schema_version' => 1,
        ])->header('Cache-Control', 'private, no-store');
    }

    public function sections(Request $request, CoordinatorInstituteScope $scope): JsonResponse
    {
        $sections = $scope->sections($this->actor($request))
            ->withCount(['researchDocuments' => fn ($query) => $query->whereColumn('research_documents.institute', 'class_sections.institute')])
            ->orderBy('name')
            ->get()
            ->map(fn (ClassSection $section) => $this->sectionPayload($section));

        return response()
            ->json(['data' => $sections->all(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function section(Request $request, int $classSection, CoordinatorInstituteScope $scope): JsonResponse
    {
        $section = $scope->sections($this->actor($request))
            ->withCount(['researchDocuments' => fn ($query) => $query->whereColumn('research_documents.institute', 'class_sections.institute')])
            ->findOrFail($classSection);

        return response()
            ->json(['data' => $this->sectionPayload($section), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function schedules(Request $request, DefenseScheduleService $schedules): JsonResponse
    {
        return response()
            ->json(['data' => $schedules->list($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function storeSchedule(Request $request, DefenseScheduleService $schedules): JsonResponse
    {
        $input = $this->validated($request, [
            'research_document_id' => ['required', 'integer', 'exists:research_documents,id'],
            'scheduled_at' => ['required', 'date', 'after:now'],
            'room' => ['nullable', 'string', 'max:150'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $schedule = $schedules->create($this->actor($request), $input, $request);

        return response()->json(['data' => $this->payload($schedule)], 201);
    }

    public function updateSchedule(Request $request, DefenseSchedule $defenseSchedule, DefenseScheduleService $schedules): JsonResponse
    {
        $input = $this->validated($request, [
            'scheduled_at' => ['sometimes', 'date'],
            'room' => ['nullable', 'string', 'max:150'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', 'string'],
        ]);
        if (isset($input['status'])) {
            DefenseScheduleService::guardStatus($input['status']);
        }
        $schedule = $schedules->update($this->actor($request), $defenseSchedule, $input, $request);

        return response()->json(['data' => $this->payload($schedule)]);
    }

    public function duplicateFlags(Request $request, ReportingService $reports): JsonResponse
    {
        return response()
            ->json(['data' => $reports->duplicateFlags($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function adviserLoad(Request $request, ReportingService $reports): JsonResponse
    {
        return response()
            ->json(['data' => $reports->adviserLoad($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function reports(Request $request, ReportingService $reports): JsonResponse
    {
        $validator = Validator::make($request->query(), [
            'institute' => ['nullable', 'string', 'max:255'],
            'program' => ['nullable', 'string', 'max:255'],
        ]);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }
        $validated = $validator->validated();

        return response()
            ->json(['data' => $reports->coordinatorProgram(
                $this->actor($request),
                $validated['program'] ?? null,
            )])
            ->header('Cache-Control', 'private, no-store');
    }

    public function reportStudies(Request $request, ReportingService $reports): JsonResponse
    {
        $validator = Validator::make($request->query(), [
            'status' => ['required', 'string', 'in:draft,submitted,under_review,revision_required,approved'],
            'program' => ['nullable', 'string', 'max:255'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }
        $validated = $validator->validated();

        $page = $reports->coordinatorStudies(
            $this->actor($request),
            $validated['status'],
            $validated['program'] ?? null,
            (int) ($validated['per_page'] ?? 10),
        );

        return response()->json([
            'data' => $page->items(),
            'meta' => [
                'current_page' => $page->currentPage(), 'from' => $page->firstItem(), 'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(), 'to' => $page->lastItem(), 'total' => $page->total(),
            ],
        ])->header('Cache-Control', 'private, no-store');
    }

    public function reportPdf(string $section, Request $request, ReportingService $reports, InstitutionalPdfService $pdf)
    {
        $validator = Validator::make($request->query(), [
            'program' => ['nullable', 'string', 'max:255'],
        ]);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }
        $report = $reports->coordinatorProgram($this->actor($request), $validator->validated()['program'] ?? null);
        [$title, $columns, $rows] = match ($section) {
            'overview' => ['Program Report Overview', ['Metric', 'Total'], collect($report['counts'])->map(fn (int $count, string $key) => [str($key)->replace('_', ' ')->title()->toString(), $count])->values()->all()],
            'instructors' => ['List of Active Research Instructors', ['Name', 'Email', 'Research Title(s)'], collect($report['instructors'])->map(fn (array $row) => [$row['name'], $row['email'], collect($row['studies'])->pluck('title')->join('; ') ?: '—'])->all()],
            'sections' => ['List of Class Sections', ['Class Section', 'Research Studies'], collect($report['by_section'])->map(fn (array $row) => [$row['name'], $row['documents_count']])->all()],
            'advisers' => ['List of Active Research Advisers', ['Name', 'Email', 'Research Title(s)'], collect($report['adviser_load'])->map(fn (array $row) => [$row['name'] ?: '—', $row['email'] ?: '—', collect($row['studies'])->pluck('title')->join('; ') ?: '—'])->all()],
            default => abort(404),
        };
        $program = $report['filters']['program'];
        $subtitle = $report['filters']['institute'].($program ? ' · '.$program : '');

        return response($pdf->render($title, $columns, $rows, count($rows), $subtitle), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="researchnav-coordinator-'.$section.'-'.now()->format('Y-m-d').'.pdf"',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function payload(DefenseSchedule $schedule): array
    {
        return [
            'id' => $schedule->id,
            'research_document_id' => $schedule->research_document_id,
            'title' => $schedule->researchDocument?->title,
            'submission_status' => $schedule->researchDocument?->submission_status,
            'research_stage' => $schedule->researchDocument?->research_stage,
            'scheduled_at' => $schedule->scheduled_at?->toISOString(),
            'room' => $schedule->room,
            'notes' => $schedule->notes,
            'status' => $schedule->status,
        ];
    }

    private function sectionPayload(ClassSection $section): array
    {
        return [
            'id' => $section->id,
            'name' => $section->name,
            'section_code' => $section->section_code,
            'academic_year' => $section->academic_year,
            'institute' => $section->institute,
            'documents_count' => $section->research_documents_count,
        ];
    }

    private function assignmentUserPayload(User $user): array
    {
        $name = trim(collect([$user->first_name, $user->last_name])->filter()->join(' '));

        return [
            'id' => $user->id,
            'name' => $name !== '' ? $name : $user->email,
            'email' => $user->email,
            'role' => $user->role,
            'access_status' => $user->access_status,
            'created_at' => $user->created_at?->toISOString(),
        ];
    }

    private function assignmentDirectory(User $actor, CoordinatorInstituteScope $scope): Builder
    {
        $institute = $scope->institute($actor);
        $documents = $scope->documents($actor);
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

    private function assignedStudies(User $actor, User $user, CoordinatorInstituteScope $scope): Collection
    {
        $documentIds = collect();
        if ($user->role === 'instructor') {
            $documentIds = $scope->documents($actor)
                ->whereHas('section', fn ($query) => $query->where('instructor_id', $user->id))
                ->pluck('id');
        }
        if (in_array($user->role, ['instructor', 'adviser'], true) && ReviewAssignment::identityCompatible()) {
            $assignmentIds = ReviewAssignment::query()
                ->where(ReviewAssignment::column('reviewer_id'), $user->id)
                ->where(ReviewAssignment::column('review_role'), $user->role)
                ->where(function ($query): void {
                    $query->where(ReviewAssignment::column('is_active'), true);
                    if (ReviewAssignment::supportsStatus()) {
                        $query->orWhereIn('status', ['accepted', 'confirmed', 'active']);
                    }
                })
                ->pluck('research_document_id');
            $documentIds = $documentIds
                ->merge($scope->documents($actor)->whereKey($assignmentIds)->pluck('id'))
                ->unique()
                ->values();
        }

        return $scope->documents($actor)
            ->whereKey($documentIds->unique()->values())
            ->with(['authors', 'submitter', 'section.instructor', 'reviewAssignments.reviewer'])
            ->orderByDesc('updated_at')
            ->get();
    }

    private function studyPayload(ResearchDocument $document, bool $details = false): array
    {
        $adviser = $document->reviewAssignments
            ->first(fn (ReviewAssignment $assignment): bool => $assignment->review_role === 'adviser' && $this->assignmentIsActive($assignment))
            ?->reviewer;
        $researchers = $document->authors->pluck('author_name')->filter()->values();
        if ($researchers->isEmpty() && $document->submitter) {
            $researchers = collect([trim(collect([$document->submitter->first_name, $document->submitter->last_name])->filter()->join(' ')) ?: $document->submitter->email]);
        }

        $payload = [
            'id' => $document->id,
            'title' => $document->title,
            'researchers' => $researchers->all(),
            'instructor' => $this->scopedPersonPayload($document, $document->section?->instructor),
            'adviser' => $this->scopedPersonPayload($document, $adviser),
            'status' => $document->submission_status,
            'research_stage' => $document->research_stage,
            'academic_year' => $document->section?->academic_year,
            'updated_at' => $document->updated_at?->toISOString(),
            'detail_url' => '/api/coordinator/research-details/'.$document->id,
        ];

        return $details ? [...$payload, 'abstract' => $document->abstract, 'keywords' => $document->keywords, 'degree_program' => $document->degree_program, 'institute' => $document->institute] : $payload;
    }

    private function assignmentIsActive(ReviewAssignment $assignment): bool
    {
        if ($assignment->getTable() === 'research_assignments') {
            return in_array((string) $assignment->status, ['accepted', 'confirmed', 'active'], true);
        }

        return (bool) $assignment->is_active;
    }

    private function scopedPersonPayload(ResearchDocument $document, ?User $user): ?array
    {
        if (! $user || $user->institute !== $document->institute) {
            return null;
        }

        return [
            'id' => $user->id,
            'name' => $user->displayName(),
        ];
    }

    private function instituteAcronym(?string $institute): ?string
    {
        return $institute === null ? null : self::INSTITUTE_ACRONYMS[$institute] ?? $institute;
    }

    /** @param array<string, array<int, string>> $rules @return array<string, string> */
    private function validated(Request $request, array $rules): array
    {
        $validator = Validator::make($request->json()->all(), $rules);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }

        return $validator->validated();
    }
}
