<?php

namespace App\Http\Controllers;

use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Services\DomainAuthorization;
use App\Services\MonitoringService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SharedMonitoringController extends DomainController
{
    private const PRE = ['Adviser', 'Instructor', 'Editor', 'Statistician', 'Librarian'];

    private const POST = ['Adviser', 'Instructor', 'Editor', 'Librarian', 'Panel 1', 'Panel 2', 'Panel 3', 'Research Rep', 'Chair'];

    public function research(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $query = ResearchDocument::query()->with('authors');
        if (DomainAuthorization::isResearcher($actor)) {
            $query->where(fn ($q) => $q->where('submitted_by', $actor->id)->orWhereHas('authors', fn ($a) => $a->where('user_id', $actor->id)));
        } else {
            $query->whereHas('reviewAssignments', fn ($a) => $a->where(ReviewAssignment::column('reviewer_id'), $actor->id)->whereIn(ReviewAssignment::column('is_active'), ['accepted', 'confirmed', 'active']));
        }

        return response()->json(['data' => $query->latest()->get()->map(fn ($item) => ['id' => $item->id, 'title' => $item->title, 'research_stage' => $item->research_stage, 'researchers' => $item->authors->pluck('author_name')->all()])]);
    }

    public function show(Request $request, ResearchDocument $researchDocument): JsonResponse
    {
        $actor = $this->actor($request);
        $this->authorizeView($actor, $researchDocument);
        $entries = DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->orderBy('monitoring_stage')->orderBy('designation')->get();

        return response()->json(['data' => ['research_document_id' => $researchDocument->id, 'title' => $researchDocument->title, 'researchers' => $researchDocument->authors()->pluck('author_name'), 'stages' => ['before_proposal_defense' => $this->stage(self::PRE, $entries->where('monitoring_stage', 'before_proposal_defense')), 'after_proposal_defense' => $this->stage(self::POST, $entries->where('monitoring_stage', 'after_proposal_defense'))]]]);
    }

    public function update(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->authorizeView($actor, $researchDocument);
        $input = $request->validate(['monitoring_stage' => ['required', Rule::in(['before_proposal_defense', 'after_proposal_defense'])], 'activity_date' => ['required', 'date'], 'activity' => ['required', 'string', 'max:10000'], 'remarks' => ['nullable', 'string', 'max:10000'], 'status' => ['required', Rule::in(['pending', 'in_progress', 'completed', 'not_applicable'])], 'signature_status' => ['required', Rule::in(['unsigned', 'signed'])]]);
        [$role, $designation] = $this->editableSection($actor, $researchDocument, $input['monitoring_stage']);
        DB::transaction(function () use ($actor, $researchDocument, $input, $role, $designation, $activity): void {
            DB::table('monitoring_entries')->updateOrInsert(['research_document_id' => $researchDocument->id, 'reviewer_id' => $actor->id, 'monitoring_stage' => $input['monitoring_stage'], 'designation' => $designation], ['reviewer_role' => $role, 'activity_date' => $input['activity_date'], 'activity' => $input['activity'], 'remarks' => $input['remarks'] ?? null, 'status' => $input['status'], 'signature_status' => $input['signature_status'], 'created_at' => now(), 'updated_at' => now()]);
            $activity->log($researchDocument, 'SHARED_MONITORING_UPDATED', $actor, $designation.' monitoring section updated.', null, $input['status'], $input['status']);
        });

        return $this->show($request, $researchDocument);
    }

    public function verify(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        if (! DomainAuthorization::isAssignedReviewer($actor, $researchDocument) || $actor->role !== 'instructor') {
            abort(403);
        }
        $stage = $request->validate(['monitoring_stage' => ['required', Rule::in(['before_proposal_defense', 'after_proposal_defense'])]])['monitoring_stage'];
        $required = $stage === 'before_proposal_defense' ? self::PRE : self::POST;
        $entries = DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('monitoring_stage', $stage)->get();
        $complete = $entries->filter(fn ($row) => ($row->status === 'completed' && $row->signature_status === 'signed') || $row->status === 'not_applicable')->pluck('designation')->map(fn ($value) => strtolower($value));
        $missing = collect($required)->map(fn ($value) => strtolower($value))->diff($complete);
        if ($missing->isNotEmpty()) {
            throw ValidationException::withMessages(['monitoring_stage' => ['Incomplete sections: '.$missing->implode(', ')]]);
        }
        DB::table('monitoring_entries')->whereIn('id', $entries->pluck('id'))->update(['verified_by' => $actor->id, 'verified_at' => now(), 'updated_at' => now()]);
        $activity->log($researchDocument, 'SHARED_MONITORING_VERIFIED', $actor, $stage.' monitoring verified.', null, 'verified', 'completed');
        $researchDocument->submitter?->notify(new ResearchActivityNotification($researchDocument, 'SHARED_MONITORING_VERIFIED', 'Monitoring verified', 'The Research Instructor verified the monitoring form.', '/research/'.$researchDocument->id));

        return $this->show($request, $researchDocument);
    }

    private function authorizeView(User $actor, ResearchDocument $research): void
    {
        if (DomainAuthorization::isResearcherParticipant($actor, $research)) {
            return;
        }
        $assigned = $research->reviewAssignments()->where(ReviewAssignment::column('reviewer_id'), $actor->id)->whereIn(ReviewAssignment::column('is_active'), ['accepted', 'confirmed', 'active'])->exists();
        if (! $assigned) {
            abort(403);
        }
    }

    private function editableSection(User $actor, ResearchDocument $research, string $stage): array
    {
        $canonical = $actor->roleDefinition?->slug;
        $role = $canonical === 'research_editor' ? 'research_editor' : $actor->role;
        if ($stage === 'after_proposal_defense' && $role === 'statistician') {
            abort(403);
        }
        if ($stage === 'before_proposal_defense' && $role === 'panel') {
            abort(403);
        }
        $designation = match ($role) {
            'adviser' => 'Adviser', 'instructor' => 'Instructor', 'research_editor' => 'Editor', 'statistician' => 'Statistician', 'librarian' => 'Librarian',
            'panel' => $this->panelDesignation($actor, $research), 'research-office' => 'Research Rep', default => abort(403),
        };

        return [$role, $designation];
    }

    private function panelDesignation(User $actor, ResearchDocument $research): string
    {
        $assignment = $research->reviewAssignments()->where(ReviewAssignment::column('reviewer_id'), $actor->id)->where(ReviewAssignment::column('review_role'), 'panel')->first();
        if ($assignment?->designation === 'panel_chair') {
            return 'Chair';
        }
        $ids = $research->reviewAssignments()->where(ReviewAssignment::column('review_role'), 'panel')->where('designation', 'panel_member')->orderBy('id')->pluck(ReviewAssignment::column('reviewer_id'))->values();

        return 'Panel '.(($ids->search($actor->id) ?: 0) + 1);
    }

    private function stage(array $sections, $entries): array
    {
        return ['sections' => collect($sections)->map(fn ($name) => ['designation' => $name, 'entry' => $entries->first(fn ($row) => strtolower($row->designation) === strtolower($name))])->values(), 'verified_by' => $entries->pluck('verified_by')->filter()->first(), 'verified_at' => $entries->pluck('verified_at')->filter()->first()];
    }
}
