<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Models\Evaluation;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Services\DefenseScheduleService;
use App\Services\EvaluationService;
use App\Services\MonitoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class PanelController extends DomainController
{
    public function schedule(Request $request, DefenseScheduleService $schedules): JsonResponse
    {
        return response()
            ->json(['data' => $schedules->list($this->actor($request), mineOnly: true), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function assignments(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $documents = ResearchDocument::query()
            ->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'panel')
                ->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true))
            ->with(['authors' => fn ($authors) => $authors->orderBy('author_order')->limit(3)])
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'research_stage', 'submission_status', 'updated_at'])
            ->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'research_stage' => $document->research_stage,
                'submission_status' => $document->submission_status,
                'authors' => $document->authors->pluck('author_name')->values()->all(),
                'designation' => $document->reviewAssignments()->where(ReviewAssignment::column('reviewer_id'), $actor->id)->where(ReviewAssignment::column('review_role'), 'panel')->value('designation'),
                'next_defense' => ($defense = DB::table('defenses')->where('research_document_id', $document->id)->orderByDesc('scheduled_date')->first()) ? ['id' => $defense->id, 'scheduled_at' => $defense->scheduled_date, 'room' => $defense->venue, 'status' => $defense->status, 'defense_type' => $defense->defense_type] : null,
                'updated_at' => $document->updated_at?->toISOString(),
            ])
            ->values()
            ->all();

        return response()
            ->json(['data' => $documents, 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function submitEvaluation(Request $request, EvaluationService $evaluations): JsonResponse
    {
        $input = $this->validated($request, [
            'research_document_id' => ['required', 'integer', 'exists:research_documents,id'],
            'originality' => ['nullable', 'integer', 'between:1,5'], 'methodology' => ['nullable', 'integer', 'between:1,5'], 'clarity' => ['nullable', 'integer', 'between:1,5'],
            'comments' => ['nullable', 'string', 'max:5000'],
            'recommendations' => ['nullable', 'string', 'max:5000'], 'required_revisions' => ['nullable', 'string', 'max:5000'], 'decision' => ['nullable', 'string', 'max:100'],
        ]);
        if (! Schema::hasTable('defenses')) {
            $evaluation = $evaluations->submit($this->actor($request), $input, $request);

            return response()->json(['data' => $this->payload($evaluation)], 201);
        }
        $actor = $this->actor($request);
        $research = ResearchDocument::query()->findOrFail($input['research_document_id']);
        $assigned = $research->reviewAssignments()->where(ReviewAssignment::column('reviewer_id'), $actor->id)->where(ReviewAssignment::column('review_role'), 'panel')->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true)->exists();
        if (! $assigned) {
            abort(403);
        }
        $defense = DB::table('defenses')->where('research_document_id', $research->id)->orderByDesc('scheduled_date')->first();
        if (! $defense) {
            abort(422, 'No defense is scheduled for this research.');
        }
        if (DB::table('defense_evaluations')->where('defense_id', $defense->id)->where('evaluator_id', $actor->id)->where('is_final', true)->exists()) {
            abort(422, 'Your final evaluation has already been submitted.');
        }
        $scoreFields = array_filter([$input['originality'] ?? null, $input['methodology'] ?? null, $input['clarity'] ?? null], fn ($value) => $value !== null);
        $id = DB::table('defense_evaluations')->insertGetId(['defense_id' => $defense->id, 'evaluator_id' => $actor->id, 'score' => $scoreFields ? array_sum($scoreFields) / count($scoreFields) : null, 'comments' => $input['comments'] ?? null, 'recommendations' => $input['recommendations'] ?? null, 'required_revisions' => $input['required_revisions'] ?? null, 'decision' => $input['decision'] ?? null, 'submitted_at' => now(), 'is_final' => true, 'created_at' => now(), 'updated_at' => now()]);
        app(MonitoringService::class)->log($research, 'DEFENSE_EVALUATION_SUBMITTED', $actor, 'Panelist submitted a defense evaluation.', null, $input['decision'] ?? 'submitted', 'completed');

        return response()->json(['data' => DB::table('defense_evaluations')->find($id)], 201);
    }

    public function monitoring(Request $request): JsonResponse
    {
        $ids = collect($this->assignments($request)->getData(true)['data'])->pluck('research_document_id');

        return response()->json(['data' => DB::table('monitoring_entries')->join('research_documents', 'research_documents.id', '=', 'monitoring_entries.research_document_id')->whereIn('research_document_id', $ids)->where('monitoring_stage', 'after_proposal_defense')->get(['monitoring_entries.*', 'research_documents.title'])]);
    }

    public function saveMonitoring(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $assigned = $researchDocument->reviewAssignments()->where(ReviewAssignment::column('reviewer_id'), $actor->id)->where(ReviewAssignment::column('review_role'), 'panel')->where(ReviewAssignment::column('is_active'), ReviewAssignment::column('is_active') === 'status' ? 'active' : true)->exists();
        if (! $assigned) {
            abort(403);
        }
        $input = $this->validated($request, ['activity_date' => ['required', 'date'], 'activity' => ['required', 'string', 'max:10000'], 'remarks' => ['nullable', 'string', 'max:10000'], 'status' => ['required', 'in:pending,completed'], 'signature_status' => ['required', 'in:unsigned,signed']]);
        $designation = $researchDocument->reviewAssignments()->where(ReviewAssignment::column('reviewer_id'), $actor->id)->where(ReviewAssignment::column('review_role'), 'panel')->value('designation') === 'panel_chair' ? 'Chair' : 'Panel Member';
        DB::table('monitoring_entries')->updateOrInsert(['research_document_id' => $researchDocument->id, 'reviewer_id' => $actor->id, 'monitoring_stage' => 'after_proposal_defense', 'designation' => $designation], ['reviewer_role' => 'panel', 'activity_date' => $input['activity_date'], 'activity' => $input['activity'], 'remarks' => $input['remarks'] ?? null, 'status' => $input['status'], 'signature_status' => $input['signature_status'], 'created_at' => now(), 'updated_at' => now()]);
        $activity->log($researchDocument, 'PANELIST_MONITORING_UPDATED', $actor, 'Panelist post-defense monitoring updated.', null, $input['status'], $input['status']);

        return response()->json(['data' => DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('reviewer_id', $actor->id)->first()]);
    }

    public function history(Request $request, EvaluationService $evaluations): JsonResponse
    {
        if (Schema::hasTable('defenses')) {
            return response()->json(['data' => DB::table('defense_evaluations')->join('defenses', 'defenses.id', '=', 'defense_evaluations.defense_id')->join('research_documents', 'research_documents.id', '=', 'defenses.research_document_id')->where('evaluator_id', $this->actor($request)->id)->orderByDesc('submitted_at')->get(['defense_evaluations.*', 'defenses.defense_type', 'defenses.scheduled_date', 'research_documents.id as research_document_id', 'research_documents.title']), 'schema_version' => 1]);
        }

        return response()
            ->json(['data' => $evaluations->listByPanelist($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    private function payload(Evaluation $evaluation): array
    {
        return [
            'id' => $evaluation->id,
            'research_document_id' => $evaluation->research_document_id,
            'title' => $evaluation->researchDocument?->title,
            'originality' => $evaluation->originality,
            'methodology' => $evaluation->methodology,
            'clarity' => $evaluation->clarity,
            'comments' => $evaluation->comments,
            'submitted_at' => $evaluation->submitted_at?->toISOString(),
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
