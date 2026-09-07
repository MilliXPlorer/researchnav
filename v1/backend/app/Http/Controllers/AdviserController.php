<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\Revision;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Services\DomainAuthorization;
use App\Services\MonitoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class AdviserController extends DomainController
{
    public function advisees(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $documents = ResearchDocument::query()
            ->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'adviser')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
            ->with('submitter:id,first_name,middle_name,last_name,email')
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'submitted_by', 'research_stage', 'submission_status', 'updated_at']);

        $advisees = $documents->groupBy('submitted_by')
            ->map(fn ($group) => [
                'user_id' => $group->first()->submitter?->id,
                'name' => $group->first()->submitter ? trim(implode(' ', array_filter([
                    $group->first()->submitter->first_name, $group->first()->submitter->middle_name, $group->first()->submitter->last_name,
                ]))) : null,
                'email' => $group->first()->submitter?->email,
                'documents_count' => $group->count(),
                'documents' => $group->map(fn (ResearchDocument $document) => [
                    'research_document_id' => $document->id,
                    'title' => $document->title,
                    'research_stage' => $document->research_stage,
                    'submission_status' => $document->submission_status,
                    'updated_at' => $document->updated_at?->toISOString(),
                ])->values()->all(),
            ])
            ->values()
            ->all();

        return response()
            ->json(['data' => $advisees, 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function pendingReviews(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $documents = ResearchDocument::query()
            ->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'adviser')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
            ->whereIn('submission_status', ['submitted', 'under_review'])
            ->withCount(['revisions' => fn ($revisions) => $revisions->whereIn(Revision::column('revision_status'), ['requested', 'in_progress']), 'titleValidations' => fn ($validations) => $validations->where(TitleValidation::column('validation_status'), 'pending')])
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'research_stage', 'submission_status', 'updated_at']);

        return response()
            ->json([
                'data' => $documents->map(fn (ResearchDocument $document) => [
                    'research_document_id' => $document->id,
                    'title' => $document->title,
                    'research_stage' => $document->research_stage,
                    'submission_status' => $document->submission_status,
                    'open_revisions' => $document->revisions_count,
                    'pending_title_validations' => $document->title_validations_count,
                    'updated_at' => $document->updated_at?->toISOString(),
                ])->values()->all(),
                'schema_version' => 1,
            ])
            ->header('Cache-Control', 'private, no-store');
    }

    public function similarityAlerts(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $alerts = SimilarityResult::query()
            ->latestPerPair()
            ->where('adviser_review_required', true)
            ->whereHas('sourceResearch', fn ($documents) => $documents->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'adviser')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true)))
            ->with('sourceResearch:id,title,submission_status,research_stage')
            ->orderByRaw('CASE WHEN overall_similarity_score IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('overall_similarity_score')
            ->orderByDesc('title_similarity_score')
            ->orderBy('matched_research_id')
            ->get()
            ->map(fn (SimilarityResult $result) => [
                'id' => $result->id,
                'research_document_id' => $result->source_research_id,
                'matched_research_id' => $result->matched_research_id,
                'title' => $result->sourceResearch?->title,
                'submission_status' => $result->sourceResearch?->submission_status,
                'matched_title' => $result->matched_title,
                'overall_similarity_score' => $result->overall_similarity_score,
                'classification' => $result->classification,
                'adviser_review_required' => $result->adviser_review_required,
                'analyzed_at' => $result->analyzed_at?->toISOString(),
            ])
            ->all();

        return response()
            ->json(['data' => $alerts, 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function feedbackHistory(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $feedback = FeedbackComment::query()
            ->where(FeedbackComment::column('user_id'), $actor->id)
            ->whereHas('researchDocument.reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'adviser')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
            ->with('researchDocument:id,title')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (FeedbackComment $comment) => [
                'id' => $comment->id,
                'research_document_id' => $comment->research_document_id,
                'title' => $comment->researchDocument?->title,
                'comment' => $comment->comment,
                'feedback_type' => $comment->feedback_type,
                'feedback_status' => $comment->feedback_status,
                'created_at' => $comment->created_at?->toISOString(),
            ])
            ->all();

        return response()
            ->json(['data' => $feedback, 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function reviewHistory(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $reviews = DB::table('research_reviews')
            ->join('research_documents', 'research_documents.id', '=', 'research_reviews.research_document_id')
            ->where('research_reviews.reviewer_id', $actor->id)
            ->where('research_reviews.reviewer_role', 'adviser')
            ->orderByDesc('research_reviews.reviewed_at')
            ->orderByDesc('research_reviews.created_at')
            ->get(['research_reviews.*', 'research_documents.title', 'research_documents.research_stage']);

        return response()->json(['data' => $reviews, 'schema_version' => 1])->header('Cache-Control', 'private, no-store');
    }

    public function monitoring(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $documentIds = $this->assignedResearch($actor)->pluck('id');
        $entries = DB::table('monitoring_entries')
            ->join('research_documents', 'research_documents.id', '=', 'monitoring_entries.research_document_id')
            ->whereIn('monitoring_entries.research_document_id', $documentIds)
            ->orderByDesc('monitoring_entries.activity_date')
            ->get(['monitoring_entries.*', 'research_documents.title']);

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
        DB::transaction(function () use ($actor, $researchDocument, $input, $activity): void {
            DB::table('monitoring_entries')->updateOrInsert([
                'research_document_id' => $researchDocument->id,
                'reviewer_id' => $actor->id,
                'monitoring_stage' => $input['monitoring_stage'],
                'designation' => 'Adviser',
            ], [
                'reviewer_role' => 'adviser', 'activity_date' => $input['activity_date'],
                'activity' => $input['activity'], 'remarks' => $input['remarks'] ?? null,
                'status' => $input['status'], 'signature_status' => $input['signature_status'],
                'updated_at' => now(), 'created_at' => now(),
            ]);
            $activity->log($researchDocument, 'ADVISER_MONITORING_UPDATED', $actor, 'Adviser monitoring entry updated.', null, $input['status'], $input['status']);
        });

        return response()->json(['data' => DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('reviewer_id', $actor->id)->where('monitoring_stage', $input['monitoring_stage'])->first()]);
    }

    private function assignedResearch(User $actor)
    {
        return ResearchDocument::query()->whereHas('reviewAssignments', fn ($assignments) => $assignments
            ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
            ->where(ReviewAssignment::column('review_role'), 'adviser')
            ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true));
    }

    private function validated(Request $request, array $rules): array
    {
        $validator = Validator::make($request->json()->all(), $rules);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }

        return $validator->validated();
    }
}
