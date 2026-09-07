<?php

namespace App\Http\Controllers;

use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Notifications\ResearchActivityNotification;
use App\Services\MonitoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EditorController extends DomainController
{
    public function assigned(Request $request): JsonResponse
    {
        $documents = $this->assignedQuery($this->actor($request)->id)->with(['authors', 'files' => fn ($query) => $query->orderByDesc('version_number')])->latest()->get();

        return response()->json(['data' => $documents->map(fn ($document) => ['research_document_id' => $document->id, 'title' => $document->title, 'researchers' => $document->authors->pluck('author_name')->all(), 'research_stage' => $document->research_stage, 'submission_status' => $document->submission_status, 'latest_manuscript' => $document->files->first()?->original_filename, 'updated_at' => $document->updated_at?->toISOString()])]);
    }

    public function saveReview(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->ensureAssigned($actor->id, $researchDocument);
        $input = $request->validate(['document_file_id' => ['nullable', 'integer'], 'review_type' => ['required', 'in:comment,revision_request,clearance'], 'remarks' => ['required', 'string', 'max:10000'], 'required_action' => ['nullable', 'string', 'max:10000']]);
        if (isset($input['document_file_id']) && ! $researchDocument->files()->whereKey($input['document_file_id'])->exists()) {
            abort(422, 'The manuscript does not belong to this research.');
        }
        $type = ['comment' => 'editorial_comment', 'revision_request' => 'editorial_correction', 'clearance' => 'editorial_clearance'][$input['review_type']];
        $status = $input['review_type'] === 'clearance' ? 'completed' : ($input['review_type'] === 'revision_request' ? 'correction_required' : 'open');
        $id = DB::transaction(function () use ($actor, $researchDocument, $input, $type, $status, $activity) {
            $id = DB::table('research_reviews')->insertGetId(['research_document_id' => $researchDocument->id, 'document_file_id' => $input['document_file_id'] ?? null, 'reviewer_id' => $actor->id, 'reviewer_role' => 'research_editor', 'review_type' => $type, 'remarks' => $input['remarks'], 'required_action' => $input['required_action'] ?? null, 'status' => $status, 'reviewed_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            $event = $input['review_type'] === 'clearance' ? 'EDITORIAL_REVIEW_COMPLETED' : ($input['review_type'] === 'revision_request' ? 'EDITORIAL_CORRECTION_REQUESTED' : 'EDITOR_COMMENT_ADDED');
            $activity->log($researchDocument, $event, $actor, $input['remarks'], null, $status, $status);
            $researchDocument->submitter?->notify(new ResearchActivityNotification($researchDocument, $event, 'Editorial review update', $input['remarks'], '/research/'.$researchDocument->id));

            return $id;
        });

        return response()->json(['data' => DB::table('research_reviews')->find($id)], 201);
    }

    public function history(Request $request): JsonResponse
    {
        return response()->json(['data' => DB::table('research_reviews')->join('research_documents', 'research_documents.id', '=', 'research_reviews.research_document_id')->where('reviewer_id', $this->actor($request)->id)->where('reviewer_role', 'research_editor')->orderByDesc('reviewed_at')->get(['research_reviews.*', 'research_documents.title'])]);
    }

    public function monitoring(Request $request): JsonResponse
    {
        $ids = $this->assignedQuery($this->actor($request)->id)->pluck('id');

        return response()->json(['data' => DB::table('monitoring_entries')->join('research_documents', 'research_documents.id', '=', 'monitoring_entries.research_document_id')->whereIn('research_document_id', $ids)->get(['monitoring_entries.*', 'research_documents.title'])]);
    }

    public function saveMonitoring(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->ensureAssigned($actor->id, $researchDocument);
        $input = $request->validate(['monitoring_stage' => ['required', 'in:before_proposal_defense,after_proposal_defense'], 'activity_date' => ['required', 'date'], 'activity' => ['required', 'string', 'max:10000'], 'remarks' => ['nullable', 'string', 'max:10000'], 'status' => ['required', 'in:pending,completed'], 'signature_status' => ['required', 'in:unsigned,signed']]);
        DB::table('monitoring_entries')->updateOrInsert(['research_document_id' => $researchDocument->id, 'reviewer_id' => $actor->id, 'monitoring_stage' => $input['monitoring_stage'], 'designation' => 'Editor'], ['reviewer_role' => 'research_editor', 'activity_date' => $input['activity_date'], 'activity' => $input['activity'], 'remarks' => $input['remarks'] ?? null, 'status' => $input['status'], 'signature_status' => $input['signature_status'], 'created_at' => now(), 'updated_at' => now()]);
        $activity->log($researchDocument, 'EDITOR_MONITORING_UPDATED', $actor, 'Editor monitoring entry updated.', null, $input['status'], $input['status']);

        return response()->json(['data' => DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('reviewer_id', $actor->id)->where('monitoring_stage', $input['monitoring_stage'])->first()]);
    }

    private function assignedQuery(string $id)
    {
        return ResearchDocument::query()->whereHas('reviewAssignments', fn ($query) => $query->where(ReviewAssignment::column('reviewer_id'), $id)->where(ReviewAssignment::column('review_role'), 'research_editor')->whereIn(ReviewAssignment::column('is_active'), ['accepted', 'confirmed', 'active']));
    }

    private function ensureAssigned(string $id, ResearchDocument $research): void
    {
        if (! $this->assignedQuery($id)->whereKey($research->id)->exists()) {
            abort(403, 'The Editor is not assigned to this research.');
        }
    }
}
