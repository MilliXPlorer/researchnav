<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\SimilarityResult;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Services\ClassSectionService;
use App\Services\DomainAuthorization;
use App\Services\MonitoringService;
use App\Services\ReportingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class InstructorController extends DomainController
{
    public function submissions(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        if (! ReviewAssignment::identityCompatible()) {
            return response()->json(['data' => [], 'schema_version' => 1])->header('Cache-Control', 'private, no-store');
        }
        $documents = ResearchDocument::query()
            ->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'instructor')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
            ->with('submitter:id,first_name,middle_name,last_name,email')
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'submitted_by', 'research_stage', 'submission_status', 'updated_at'])
            ->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'research_stage' => $document->research_stage,
                'submission_status' => $document->submission_status,
                'submitter' => $document->submitter === null ? null : (trim(implode(' ', array_filter([
                    $document->submitter->first_name,
                    $document->submitter->middle_name,
                    $document->submitter->last_name,
                ]))) ?: $document->submitter->email),
                'updated_at' => $document->updated_at?->toISOString(),
            ]);

        return response()
            ->json(['data' => $documents->values()->all(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function sections(Request $request, ClassSectionService $sections): JsonResponse
    {
        return response()
            ->json(['data' => $sections->listOwned($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function storeSection(Request $request, ClassSectionService $sections): JsonResponse
    {
        $input = $this->validated($request, [
            'name' => ['required', 'string', 'max:150'],
            'academic_year' => ['nullable', 'string', 'max:50'],
        ]);
        $section = $sections->create($this->actor($request), $input, $request);

        return response()->json(['data' => $this->sectionPayload($section->fresh())], 201);
    }

    public function updateSection(Request $request, ClassSection $classSection, ClassSectionService $sections): JsonResponse
    {
        $input = $this->validated($request, [
            'name' => ['sometimes', 'string', 'max:150'],
            'academic_year' => ['nullable', 'string', 'max:50'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        return response()->json(['data' => $this->sectionPayload($sections->update($this->actor($request), $classSection, $input, $request))]);
    }

    public function sectionDocuments(Request $request, ClassSection $classSection, ClassSectionService $sections): JsonResponse
    {
        if ($denied = $this->authorizeSectionAccess($request, $classSection)) {
            return $denied;
        }
        $documents = $classSection->researchDocuments()
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'research_stage', 'submission_status', 'updated_at'])
            ->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'research_stage' => $document->research_stage,
                'submission_status' => $document->submission_status,
                'updated_at' => $document->updated_at?->toISOString(),
            ]);

        return response()
            ->json(['data' => $documents->values()->all(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function availableSectionDocuments(Request $request, ClassSection $classSection, ClassSectionService $sections): JsonResponse
    {
        if ($denied = $this->authorizeSectionAccess($request, $classSection)) {
            return $denied;
        }

        return response()->json([
            'data' => $sections->listAssignableDocuments($this->actor($request), $classSection),
            'schema_version' => 1,
        ]);
    }

    public function sectionMembers(Request $request, ClassSection $classSection, ClassSectionService $sections): JsonResponse
    {
        if ($denied = $this->authorizeSectionAccess($request, $classSection)) {
            return $denied;
        }

        return response()
            ->json(['data' => $sections->listMembers($this->actor($request), $classSection), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function addSectionMembers(Request $request, ClassSection $classSection, ClassSectionService $sections): JsonResponse
    {
        if ($denied = $this->authorizeSectionAccess($request, $classSection)) {
            return $denied;
        }
        $input = $this->validated($request, [
            'user_ids' => ['required', 'array', 'min:1', 'max:50'],
            'user_ids.*' => ['string', 'exists:users,id'],
        ]);
        $section = $sections->addMembers($this->actor($request), $classSection, $input['user_ids'], $request);

        return response()->json(['data' => $this->sectionPayload($section->fresh())]);
    }

    public function removeSectionMember(Request $request, ClassSection $classSection, User $user, ClassSectionService $sections): JsonResponse
    {
        if ($denied = $this->authorizeSectionAccess($request, $classSection)) {
            return $denied;
        }
        $section = $sections->removeMember($this->actor($request), $classSection, $user, $request);

        return response()->json(['data' => $this->sectionPayload($section->fresh())]);
    }

    public function documentMembers(Request $request, ClassSection $classSection, ResearchDocument $researchDocument, ClassSectionService $sections): JsonResponse
    {
        if ($denied = $this->authorizeSectionAccess($request, $classSection)) {
            return $denied;
        }

        return response()->json(['data' => $sections->listDocumentMembers($this->actor($request), $classSection, $researchDocument), 'schema_version' => 1]);
    }

    public function addDocumentMember(Request $request, ClassSection $classSection, ResearchDocument $researchDocument, User $user, ClassSectionService $sections): JsonResponse
    {
        if ($denied = $this->authorizeSectionAccess($request, $classSection)) {
            return $denied;
        }
        $sections->addDocumentMember($this->actor($request), $classSection, $researchDocument, $user, $request);

        return response()->json(['data' => $sections->listDocumentMembers($this->actor($request), $classSection, $researchDocument), 'schema_version' => 1]);
    }

    public function removeDocumentMember(Request $request, ClassSection $classSection, ResearchDocument $researchDocument, User $user, ClassSectionService $sections): JsonResponse
    {
        if ($denied = $this->authorizeSectionAccess($request, $classSection)) {
            return $denied;
        }
        $sections->removeDocumentMember($this->actor($request), $classSection, $researchDocument, $user, $request);

        return response()->json(['data' => $sections->listDocumentMembers($this->actor($request), $classSection, $researchDocument), 'schema_version' => 1]);
    }

    private function authorizeSectionAccess(Request $request, ClassSection $classSection): ?JsonResponse
    {
        $actor = $this->actor($request);
        if ($classSection->instructor_id !== $actor->id && ! DomainAuthorization::isActiveAdministrator($actor)) {
            return response()->json(['error' => 'ROLE_NOT_AUTHORIZED'], 403);
        }

        return null;
    }

    public function students(Request $request, ClassSectionService $sections): JsonResponse
    {
        $input = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
        ]);

        return response()
            ->json(['data' => $sections->listStudentCandidates($this->actor($request), $input['search'] ?? null), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function assignDocuments(Request $request, ClassSection $classSection, ClassSectionService $sections): JsonResponse
    {
        $input = $this->validated($request, [
            'research_document_ids' => ['required', 'array', 'min:1', 'max:50'],
            'research_document_ids.*' => ['integer', 'exists:research_documents,id'],
        ]);
        $sections->assignDocuments($this->actor($request), $classSection, $input['research_document_ids'], $request);

        return response()->json(['data' => $this->sectionPayload($classSection->fresh('researchDocuments'))]);
    }

    public function titleProposals(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        if (! ReviewAssignment::identityCompatible()) {
            return response()->json(['data' => [], 'schema_version' => 1])->header('Cache-Control', 'private, no-store');
        }
        $documents = ResearchDocument::query()
            ->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'instructor')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
            ->where('research_stage', 'title_proposal')
            ->with('submitter:id,first_name,middle_name,last_name,email')
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'submitted_by', 'submission_status', 'updated_at'])
            ->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'submission_status' => $document->submission_status,
                'submitter' => $document->submitter === null ? null : trim(implode(' ', array_filter([
                    $document->submitter->first_name, $document->submitter->middle_name, $document->submitter->last_name,
                ]))),
                'updated_at' => $document->updated_at?->toISOString(),
            ]);

        return response()
            ->json(['data' => $documents->values()->all(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function similarityOverview(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        if (! ReviewAssignment::identityCompatible()) {
            return response()->json(['data' => [], 'schema_version' => 1])->header('Cache-Control', 'private, no-store');
        }
        $documentIds = ResearchDocument::query()
            ->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'instructor')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
            ->pluck('id');
        $best = SimilarityResult::query()
            ->latestPerPair()
            ->whereIn('source_research_id', $documentIds)
            ->with('sourceResearch:id,title,submission_status')
            ->orderByRaw('CASE WHEN overall_similarity_score IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('overall_similarity_score')
            ->orderByDesc('title_similarity_score')
            ->orderBy('matched_research_id')
            ->get()
            ->groupBy('source_research_id')
            ->map(fn ($results, $documentId) => [
                'research_document_id' => (int) $documentId,
                'title' => $results->first()->sourceResearch?->title,
                'submission_status' => $results->first()->sourceResearch?->submission_status,
                'best_similarity' => $results->first()->overall_similarity_score,
                'classification' => $results->first()->classification,
                'adviser_review_required' => $results->first()->adviser_review_required,
                'matched_title' => $results->first()->matched_title,
            ])
            ->values()
            ->sortByDesc('best_similarity')
            ->values()
            ->all();

        return response()
            ->json(['data' => $best, 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function classReports(Request $request, ReportingService $reports): JsonResponse
    {
        $actor = $this->actor($request);
        $sections = ClassSection::query()
            ->where('instructor_id', $actor->id)
            ->with('researchDocuments:id,section_id,title,submission_status,research_stage')
            ->orderBy('name')
            ->get();

        return response()
            ->json([
                'data' => $sections->map(function (ClassSection $section): array {
                    $statuses = [];
                    $similarityBuckets = ['low' => 0, 'moderate' => 0, 'high' => 0];
                    foreach ($section->researchDocuments as $document) {
                        $statuses[$document->submission_status] = ($statuses[$document->submission_status] ?? 0) + 1;
                        $best = SimilarityResult::query()
                            ->latestPerPair()
                            ->where('source_research_id', $document->id)
                            ->orderByRaw('CASE WHEN overall_similarity_score IS NULL THEN 1 ELSE 0 END')
                            ->orderByDesc('overall_similarity_score')
                            ->orderByDesc('title_similarity_score')
                            ->orderBy('matched_research_id')
                            ->first(['classification']);
                        if ($best === null || $best->classification === null) {
                            continue;
                        }
                        $similarityBuckets[$best->classification]++;
                    }

                    return [
                        'id' => $section->id,
                        'name' => $section->name,
                        'academic_year' => $section->academic_year,
                        'documents_count' => $section->researchDocuments->count(),
                        'statuses' => $statuses,
                        'similarity_buckets' => $similarityBuckets,
                    ];
                })->values()->all(),
                'schema_version' => 1,
            ])
            ->header('Cache-Control', 'private, no-store');
    }

    public function reviewHistory(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $reviews = DB::table('research_reviews')
            ->join('research_documents', 'research_documents.id', '=', 'research_reviews.research_document_id')
            ->where('research_reviews.reviewer_id', $actor->id)
            ->where('research_reviews.reviewer_role', 'instructor')
            ->orderByDesc('research_reviews.reviewed_at')
            ->orderByDesc('research_reviews.created_at')
            ->get([
                'research_reviews.id', 'research_reviews.research_document_id', 'research_documents.title',
                'research_reviews.document_file_id', 'research_reviews.review_type', 'research_reviews.remarks',
                'research_reviews.required_action', 'research_reviews.status', 'research_reviews.reviewed_at',
                'research_reviews.created_at',
            ]);

        return response()->json(['data' => $reviews, 'schema_version' => 1])->header('Cache-Control', 'private, no-store');
    }

    public function panelists(Request $request): JsonResponse
    {
        $this->actor($request);

        return response()->json(['data' => User::query()->where('role', 'panel')->where('account_status', 'active')->get()->map(fn (User $user) => ['id' => $user->id, 'name' => $user->profileName(), 'email' => $user->email, 'unavailable_dates' => [], 'availability_persistence_supported' => false])]);
    }

    public function assignPanelist(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isAssignedReviewer($actor, $researchDocument));
        $input = $this->validated($request, ['panelist_id' => ['required', 'string', 'exists:users,id'], 'designation' => ['required', 'in:panel_member,panel_chair']]);
        $panelist = User::query()->whereKey($input['panelist_id'])->where('role', 'panel')->where('account_status', 'active')->firstOrFail();
        $assignment = ReviewAssignment::query()->create(['research_document_id' => $researchDocument->id, 'reviewer_id' => $panelist->id, 'review_role' => 'panel', 'assigned_by' => $actor->id, 'is_active' => true, 'designation' => $input['designation']]);
        $activity->log($researchDocument, 'PANELIST_ASSIGNED', $actor, 'Assigned '.$panelist->profileName().' as '.$input['designation'].'.', null, 'active', 'open');
        $panelist->notify(new ResearchActivityNotification($researchDocument, 'PANELIST_ASSIGNED', 'Defense panel assignment', 'You were assigned as '.str_replace('_', ' ', $input['designation']).'.', '/research/'.$researchDocument->id));

        return response()->json(['data' => ['id' => $assignment->id, 'panelist_id' => $panelist->id, 'name' => $panelist->profileName(), 'designation' => $input['designation'], 'status' => 'active']], 201);
    }

    public function monitoring(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $documentIds = $this->assignedResearch($actor)->pluck('id');
        $entries = DB::table('monitoring_entries')
            ->join('research_documents', 'research_documents.id', '=', 'monitoring_entries.research_document_id')
            ->leftJoin('users as reviewers', 'reviewers.id', '=', 'monitoring_entries.reviewer_id')
            ->leftJoin('users as verifiers', 'verifiers.id', '=', 'monitoring_entries.verified_by')
            ->whereIn('monitoring_entries.research_document_id', $documentIds)
            ->orderByDesc('monitoring_entries.activity_date')
            ->orderByDesc('monitoring_entries.created_at')
            ->get([
                'monitoring_entries.*', 'research_documents.title', 'reviewers.email as reviewer_email',
                'verifiers.email as verifier_email',
            ]);

        return response()->json(['data' => $entries, 'schema_version' => 1])->header('Cache-Control', 'private, no-store');
    }

    public function saveMonitoring(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isAssignedReviewer($actor, $researchDocument));
        $input = $this->validated($request, [
            'monitoring_stage' => ['required', 'in:before_proposal_defense,after_proposal_defense'],
            'activity_date' => ['required', 'date'],
            'activity' => ['required', 'string', 'max:10000'],
            'remarks' => ['nullable', 'string', 'max:10000'],
            'status' => ['required', 'in:pending,completed'],
            'signature_status' => ['required', 'in:unsigned,signed'],
        ]);

        $entry = DB::transaction(function () use ($actor, $researchDocument, $input, $activity) {
            DB::table('monitoring_entries')->updateOrInsert([
                'research_document_id' => $researchDocument->id,
                'reviewer_id' => $actor->id,
                'monitoring_stage' => $input['monitoring_stage'],
                'designation' => 'Instructor',
            ], [
                'reviewer_role' => 'instructor',
                'activity_date' => $input['activity_date'],
                'activity' => $input['activity'],
                'remarks' => $input['remarks'] ?? null,
                'status' => $input['status'],
                'signature_status' => $input['signature_status'],
                'updated_at' => now(),
                'created_at' => now(),
            ]);
            $activity->log($researchDocument, 'MONITORING_UPDATED', $actor, 'Instructor monitoring entry updated.', null, $input['status'], $input['status']);

            return DB::table('monitoring_entries')->where([
                'research_document_id' => $researchDocument->id,
                'reviewer_id' => $actor->id,
                'monitoring_stage' => $input['monitoring_stage'],
                'designation' => 'Instructor',
            ])->first();
        });

        return response()->json(['data' => $entry]);
    }

    public function verifyMonitoring(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isAssignedReviewer($actor, $researchDocument));
        $input = $this->validated($request, [
            'monitoring_stage' => ['required', 'in:before_proposal_defense,after_proposal_defense'],
        ]);
        $entries = DB::table('monitoring_entries')
            ->where('research_document_id', $researchDocument->id)
            ->where('monitoring_stage', $input['monitoring_stage'])
            ->get();
        $requiredDesignations = $input['monitoring_stage'] === 'before_proposal_defense'
            ? ['adviser', 'instructor', 'editor', 'statistician', 'librarian']
            : ['adviser', 'instructor', 'editor', 'librarian', 'panel 1', 'panel 2', 'panel 3', 'research rep', 'chair'];
        $completedDesignations = $entries
            ->filter(fn ($entry) => $entry->status === 'completed' && $entry->signature_status === 'signed')
            ->map(fn ($entry) => strtolower(trim((string) ($entry->designation ?: $entry->reviewer_role))))
            ->unique();
        $missing = collect($requiredDesignations)->diff($completedDesignations)->values();
        if ($missing->isNotEmpty()) {
            throw ValidationException::withMessages(['monitoring_stage' => ['Complete and sign the required monitoring entries: '.$missing->implode(', ').'.']]);
        }

        DB::transaction(function () use ($entries, $actor, $researchDocument, $input, $activity): void {
            DB::table('monitoring_entries')->whereIn('id', $entries->pluck('id'))->update([
                'verified_by' => $actor->id,
                'verified_at' => now(),
                'status' => 'verified',
                'updated_at' => now(),
            ]);
            $activity->log($researchDocument, 'MONITORING_VERIFIED', $actor, 'Instructor verified '.$input['monitoring_stage'].' monitoring.', null, 'verified', 'completed');
            $researchDocument->submitter?->notify(new ResearchActivityNotification($researchDocument, 'MONITORING_VERIFIED', 'Monitoring verified', 'Your '.$input['monitoring_stage'].' monitoring was verified by the Research Instructor.'));
        });

        return response()->json(['data' => ['verified' => true, 'verified_by' => $actor->id, 'verified_at' => now()->toISOString()]]);
    }

    private function assignedResearch(User $actor)
    {
        return ResearchDocument::query()->whereHas('reviewAssignments', fn ($assignments) => $assignments
            ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
            ->where(ReviewAssignment::column('review_role'), 'instructor')
            ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true));
    }

    private function sectionPayload(ClassSection $section): array
    {
        return [
            'id' => $section->id,
            'name' => $section->name,
            'academic_year' => $section->academic_year,
            'is_active' => $section->is_active,
            'documents_count' => $section->researchDocuments()->count(),
            'members_count' => $section->members()->count(),
            'created_at' => $section->created_at?->toISOString(),
        ];
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
