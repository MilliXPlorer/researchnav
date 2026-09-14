<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Models\MethodologyReview;
use App\Models\ResearchDocument;
use App\Services\DomainAuthorization;
use App\Services\MethodologyReviewService;
use App\Services\MonitoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class StatisticianController extends DomainController
{
    public function queue(Request $request, MethodologyReviewService $reviews): JsonResponse
    {
        return response()
            ->json(['data' => $reviews->queueFor($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function saveChecklist(Request $request, ResearchDocument $researchDocument, MethodologyReviewService $reviews): JsonResponse
    {
        $input = $this->validated($request, [
            'design_fit' => ['nullable', 'boolean'],
            'sample_size' => ['nullable', 'boolean'],
            'instrument_validity' => ['nullable', 'boolean'],
            'analysis_plan' => ['nullable', 'boolean'],
            'remarks' => ['nullable', 'string', 'max:5000'],
        ]);
        $review = $reviews->saveChecklist($this->actor($request), $researchDocument, $input, $request);

        return response()->json(['data' => $this->payload($review)]);
    }

    public function signOff(Request $request, ResearchDocument $researchDocument, MethodologyReviewService $reviews): JsonResponse
    {
        $review = $reviews->signOff($this->actor($request), $researchDocument, $request);

        return response()->json(['data' => $this->payload($review)]);
    }

    public function returnForClarification(Request $request, ResearchDocument $researchDocument, MethodologyReviewService $reviews): JsonResponse
    {
        $input = $this->validated($request, [
            'remarks' => ['required', 'string', 'max:5000'],
        ]);
        $review = $reviews->returnForClarification($this->actor($request), $researchDocument, $input, $request);

        return response()->json(['data' => $this->payload($review)]);
    }

    public function signoffs(Request $request, MethodologyReviewService $reviews): JsonResponse
    {
        return response()
            ->json(['data' => $reviews->signOffsBy($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function notApplicable(Request $request, ResearchDocument $researchDocument, MethodologyReviewService $reviews): JsonResponse
    {
        return response()->json(['data' => $this->payload($reviews->markNotApplicable($this->actor($request), $researchDocument, $request))]);
    }

    public function monitoring(Request $request, MethodologyReviewService $reviews): JsonResponse
    {
        $ids = collect($reviews->queueFor($this->actor($request)))->pluck('research_document_id');
        $entries = DB::table('monitoring_entries')->join('research_documents', 'research_documents.id', '=', 'monitoring_entries.research_document_id')->whereIn('monitoring_entries.research_document_id', $ids)->where('monitoring_stage', 'before_proposal_defense')->orderByDesc('activity_date')->get(['monitoring_entries.*', 'research_documents.title']);

        return response()->json(['data' => $entries, 'schema_version' => 1]);
    }

    public function saveMonitoring(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->allowed(DomainAuthorization::isAssignedRecordReader($actor, $researchDocument));
        $input = $this->validated($request, ['activity_date' => ['required', 'date'], 'activity' => ['required', 'string', 'max:10000'], 'remarks' => ['nullable', 'string', 'max:10000'], 'status' => ['required', 'in:pending,completed'], 'signature_status' => ['required', 'in:unsigned,signed']]);
        DB::table('monitoring_entries')->updateOrInsert(['research_document_id' => $researchDocument->id, 'reviewer_id' => $actor->id, 'monitoring_stage' => 'before_proposal_defense', 'designation' => 'Statistician'], ['reviewer_role' => 'statistician', 'activity_date' => $input['activity_date'], 'activity' => $input['activity'], 'remarks' => $input['remarks'] ?? null, 'status' => $input['status'], 'signature_status' => $input['signature_status'], 'updated_at' => now(), 'created_at' => now()]);
        $activity->log($researchDocument, 'STATISTICIAN_MONITORING_UPDATED', $actor, 'Statistician monitoring entry updated.', null, $input['status'], $input['status']);

        return response()->json(['data' => DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('reviewer_id', $actor->id)->first()]);
    }

    private function payload(MethodologyReview $review): array
    {
        return [
            'id' => $review->id,
            'research_document_id' => $review->research_document_id,
            'title' => $review->researchDocument?->title,
            'design_fit' => $review->design_fit,
            'sample_size' => $review->sample_size,
            'instrument_validity' => $review->instrument_validity,
            'analysis_plan' => $review->analysis_plan,
            'remarks' => $review->remarks,
            'review_status' => $review->review_status,
            'signed_off_at' => $review->signed_off_at?->toISOString(),
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
