<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Models\MetadataReview;
use App\Models\ResearchDocument;
use App\Models\RetentionLog;
use App\Models\ReviewAssignment;
use App\Notifications\ResearchActivityNotification;
use App\Services\MetadataReviewService;
use App\Services\MonitoringService;
use App\Services\RetentionLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class LibrarianController extends DomainController
{
    public function assigned(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $documents = $this->assignedQuery($actor->id)->with(['authors', 'category', 'files' => fn ($query) => $query->orderByDesc('version_number')])->latest()->get();

        return response()->json(['data' => $documents->map(fn ($document) => ['research_document_id' => $document->id, 'title' => $document->title, 'researchers' => $document->authors->pluck('author_name')->all(), 'program' => $document->degree_program, 'category' => $document->category?->name, 'academic_year' => $document->publication_year, 'research_stage' => $document->research_stage, 'submission_status' => $document->submission_status, 'latest_manuscript' => $document->files->first()?->original_filename, 'updated_at' => $document->updated_at?->toISOString()])]);
    }

    public function saveReferenceReview(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->ensureAssigned($actor->id, $researchDocument);
        $input = $this->validated($request, ['document_file_id' => ['nullable', 'integer', 'exists:document_files,id'], 'review_type' => ['required', 'in:comment,revision_request,clearance'], 'remarks' => ['required', 'string', 'max:10000'], 'required_action' => ['nullable', 'string', 'max:10000']]);
        if (isset($input['document_file_id']) && ! $researchDocument->files()->whereKey($input['document_file_id'])->exists()) {
            abort(422, 'The file does not belong to this research.');
        }
        $status = $input['review_type'] === 'clearance' ? 'cleared' : ($input['review_type'] === 'revision_request' ? 'correction_required' : 'open');
        $review = DB::transaction(function () use ($actor, $researchDocument, $input, $status, $activity) {
            $id = DB::table('research_reviews')->insertGetId(['research_document_id' => $researchDocument->id, 'document_file_id' => $input['document_file_id'] ?? null, 'reviewer_id' => $actor->id, 'reviewer_role' => 'librarian', 'review_type' => $input['review_type'] === 'clearance' ? 'reference_clearance' : ($input['review_type'] === 'revision_request' ? 'reference_correction' : 'reference_comment'), 'remarks' => $input['remarks'], 'required_action' => $input['required_action'] ?? null, 'status' => $status, 'reviewed_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            $event = $input['review_type'] === 'clearance' ? 'REFERENCE_REVIEW_CLEARED' : ($input['review_type'] === 'revision_request' ? 'REFERENCE_CORRECTION_REQUESTED' : 'LIBRARIAN_COMMENT_ADDED');
            $activity->log($researchDocument, $event, $actor, $input['remarks'], null, $status, $status);
            $researchDocument->submitter?->notify(new ResearchActivityNotification($researchDocument, $event, 'Librarian reference review', $input['remarks'], '/research/'.$researchDocument->id));

            return DB::table('research_reviews')->find($id);
        });

        return response()->json(['data' => $review], 201);
    }

    public function reviewHistory(Request $request): JsonResponse
    {
        $actor = $this->actor($request);

        return response()->json(['data' => DB::table('research_reviews')->join('research_documents', 'research_documents.id', '=', 'research_reviews.research_document_id')->where('reviewer_id', $actor->id)->where('reviewer_role', 'librarian')->orderByDesc('reviewed_at')->get(['research_reviews.*', 'research_documents.title'])]);
    }

    public function monitoring(Request $request): JsonResponse
    {
        $ids = $this->assignedQuery($this->actor($request)->id)->pluck('id');

        return response()->json(['data' => DB::table('monitoring_entries')->join('research_documents', 'research_documents.id', '=', 'monitoring_entries.research_document_id')->whereIn('research_document_id', $ids)->orderByDesc('activity_date')->get(['monitoring_entries.*', 'research_documents.title'])]);
    }

    public function saveMonitoring(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->ensureAssigned($actor->id, $researchDocument);
        $input = $this->validated($request, ['monitoring_stage' => ['required', 'in:before_proposal_defense,after_proposal_defense'], 'activity_date' => ['required', 'date'], 'activity' => ['required', 'string', 'max:10000'], 'remarks' => ['nullable', 'string', 'max:10000'], 'status' => ['required', 'in:pending,completed'], 'signature_status' => ['required', 'in:unsigned,signed']]);
        DB::table('monitoring_entries')->updateOrInsert(['research_document_id' => $researchDocument->id, 'reviewer_id' => $actor->id, 'monitoring_stage' => $input['monitoring_stage'], 'designation' => 'Librarian'], ['reviewer_role' => 'librarian', 'activity_date' => $input['activity_date'], 'activity' => $input['activity'], 'remarks' => $input['remarks'] ?? null, 'status' => $input['status'], 'signature_status' => $input['signature_status'], 'created_at' => now(), 'updated_at' => now()]);
        $activity->log($researchDocument, 'LIBRARIAN_MONITORING_UPDATED', $actor, 'Librarian monitoring entry updated.', null, $input['status'], $input['status']);

        return response()->json(['data' => DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('reviewer_id', $actor->id)->where('monitoring_stage', $input['monitoring_stage'])->first()]);
    }

    private function assignedQuery(string $userId)
    {
        return ResearchDocument::query()->whereHas('reviewAssignments', fn ($query) => $query->where(ReviewAssignment::column('reviewer_id'), $userId)->where(ReviewAssignment::column('review_role'), 'librarian')->whereIn(ReviewAssignment::column('is_active'), ['accepted', 'confirmed', 'active']));
    }

    private function ensureAssigned(string $userId, ResearchDocument $research): void
    {
        if (! $this->assignedQuery($userId)->whereKey($research->id)->exists()) {
            abort(403, 'The Librarian is not assigned to this research.');
        }
    }

    public function archivingQueue(): JsonResponse
    {
        $documents = ResearchDocument::query()
            ->where('archive_status', '!=', 'archived')
            ->whereIn('submission_status', ['approved', 'archived'])
            ->with('category:id,name')
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'abstract', 'keywords', 'publication_year', 'category_id', 'submission_status', 'archive_status', 'visibility', 'updated_at'])
            ->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'submission_status' => $document->submission_status,
                'archive_status' => $document->archive_status,
                'visibility' => $document->visibility,
                'publication_year' => $document->publication_year,
                'category' => $document->category?->name,
                'metadata_completeness' => [
                    'title' => $document->title !== null && $document->title !== '',
                    'abstract' => $document->abstract !== null && $document->abstract !== '',
                    'keywords' => $document->keywords !== null && $document->keywords !== '',
                    'authors' => $document->authors()->exists(),
                    'category' => $document->category_id !== null,
                ],
                'updated_at' => $document->updated_at?->toISOString(),
            ])
            ->values()
            ->all();

        return response()
            ->json(['data' => $documents, 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function repositoryCatalog(Request $request): JsonResponse
    {
        $query = ResearchDocument::query()
            ->whereIn('submission_status', ['approved', 'archived'])
            ->with('category:id,name')
            ->orderByDesc('updated_at');

        if (($search = $request->query('search')) !== null && $search !== '') {
            $query->where('title', 'like', '%'.$this->escapedLike($search).'%');
        }
        if (($category = $request->query('category')) !== null && $category !== '') {
            $query->where('category_id', $category);
        }

        return response()
            ->json([
                'data' => $query->paginate(25)->appends($request->query()),
                'schema_version' => 1,
            ])
            ->header('Cache-Control', 'private, no-store');
    }

    public function metadataStandards(MetadataReviewService $reviews): JsonResponse
    {
        return response()
            ->json(['data' => $reviews->standardsOverview(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function saveMetadataReview(Request $request, ResearchDocument $researchDocument, MetadataReviewService $reviews): JsonResponse
    {
        $input = $this->validated($request, [
            'title_complete' => ['nullable', 'boolean'],
            'abstract_complete' => ['nullable', 'boolean'],
            'authors_complete' => ['nullable', 'boolean'],
            'keywords_complete' => ['nullable', 'boolean'],
            'category_complete' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'review_status' => ['sometimes', 'string'],
        ]);
        if (isset($input['review_status'])) {
            MetadataReviewService::guardStatus($input['review_status']);
        }
        $review = $reviews->save($this->actor($request), $researchDocument, $input, $request);

        return response()->json(['data' => $this->payload($review)]);
    }

    public function retentionLogs(RetentionLogService $logs): JsonResponse
    {
        return response()
            ->json(['data' => $logs->list(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function recordRetentionLog(Request $request, RetentionLogService $logs): JsonResponse
    {
        $input = $this->validated($request, [
            'research_document_id' => ['nullable', 'integer', 'exists:research_documents,id'],
            'action' => ['required', 'string', 'max:100'],
            'remarks' => ['nullable', 'string', 'max:5000'],
        ]);
        if (! in_array($input['action'], RetentionLog::ACTIONS, true)) {
            return response()->json(['error' => 'INVALID_ACTION'], 422);
        }
        $log = $logs->record($this->actor($request), $input, $request);

        return response()->json(['data' => $this->logPayload($log)], 201);
    }

    private function payload(MetadataReview $review): array
    {
        return [
            'id' => $review->id,
            'research_document_id' => $review->research_document_id,
            'title_complete' => $review->title_complete,
            'abstract_complete' => $review->abstract_complete,
            'authors_complete' => $review->authors_complete,
            'keywords_complete' => $review->keywords_complete,
            'category_complete' => $review->category_complete,
            'notes' => $review->notes,
            'review_status' => $review->review_status,
        ];
    }

    private function logPayload(RetentionLog $log): array
    {
        return [
            'id' => $log->id,
            'research_document_id' => $log->research_document_id,
            'title' => $log->researchDocument?->title,
            'action' => $log->action,
            'remarks' => $log->remarks,
            'activity_date' => $log->activity_date?->toISOString(),
        ];
    }

    private function escapedLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
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
