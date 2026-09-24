<?php

namespace App\Http\Controllers;

use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Services\DomainAuthorization;
use App\Services\MonitoringService;
use App\Services\ResearchProjectTeamService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SharedMonitoringController extends DomainController
{
    private const PRE = ['Adviser', 'Instructor', 'Editor', 'Statistician', 'Librarian'];

    private const POST = ['Adviser', 'Instructor', 'Editor', 'Librarian', 'Panel 1', 'Panel 2', 'Panel 3', 'Research Rep', 'Chair'];

    private const STAGES = ['before_proposal_defense', 'after_proposal_defense', 'before_final_defense', 'after_final_defense'];

    public function research(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $query = ResearchDocument::query()->with('authors.user');
        if (DomainAuthorization::isResearcher($actor)) {
            $query->where(fn ($q) => $q->where('submitted_by', $actor->id)->orWhereHas('authors', fn ($a) => $a->where('user_id', $actor->id)));
        } elseif (DomainAuthorization::isOffice($actor)) {
            $query->where('research_stage', '!=', 'completed')
                ->where('submission_status', '!=', 'archived')
                ->where('archive_status', '!=', 'archived');
        } else {
            $query->where(function ($documents) use ($actor): void {
                $active = ReviewAssignment::column('is_active');
                $documents->whereHas('reviewAssignments', fn ($a) => $a->where(ReviewAssignment::column('reviewer_id'), $actor->id)->when($active === 'status', fn ($q) => $q->whereIn($active, ['accepted', 'confirmed', 'active']), fn ($q) => $q->where($active, true)));
                if (DomainAuthorization::hasAnyRole($actor, ['instructor', 'research_instructor'])) {
                    $documents->orWhereHas('section', fn ($section) => $section->where('instructor_id', $actor->id));
                }
            });
        }

        return response()->json(['data' => $query->latest()->get()->map(fn ($item) => ['id' => $item->id, 'title' => $item->title, 'research_stage' => $item->research_stage, 'institute' => $item->institute, 'researchers' => $this->researcherNames($item)])]);
    }

    public function progressUpdates(Request $request): JsonResponse
    {
        $actor = $this->actor($request);
        $documents = $this->assignedResearch($actor)
            ->with(['monitoringLogs' => function ($logs): void {
                $log = new MonitoringLog;
                $logs->where(MonitoringLog::column('activity_type'), 'RESEARCHER_PROGRESS_REPORTED')
                    ->with('performedBy:id,first_name,middle_name,last_name,email')
                    ->orderByDesc(MonitoringLog::column('activity_date'))
                    ->orderByDesc($log->getKeyName())
                    ->limit(10);
            }])
            ->latest()
            ->get(['id', 'title', 'research_stage']);

        return response()->json([
            'data' => $documents->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'research_stage' => $document->research_stage,
                'progress_updates' => $document->monitoringLogs->map(fn (MonitoringLog $log) => [
                    'id' => $log->getKey(),
                    'activity_type' => $log->activity_type,
                    'performer_name' => $log->performedBy?->displayName(),
                    'status' => $log->monitoring_status,
                    'remarks' => $log->remarks,
                    'activity_date' => $log->activity_date?->toISOString(),
                ])->values()->all(),
            ])->values()->all(),
            'schema_version' => 1,
        ])->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request, ResearchDocument $researchDocument): JsonResponse
    {
        $actor = $this->actor($request);
        $this->authorizeView($actor, $researchDocument);
        $entries = DB::table('monitoring_entries')->leftJoin('users', 'monitoring_entries.reviewer_id', '=', 'users.id')->where('monitoring_entries.research_document_id', $researchDocument->id)->orderBy('monitoring_entries.monitoring_stage')->orderBy('monitoring_entries.designation')->select('monitoring_entries.*', DB::raw("TRIM(CONCAT_WS(' ', users.first_name, users.middle_name, users.last_name)) as reviewer_name"))->get();
        $reviewAssignments = $researchDocument->reviewAssignments()->with('reviewer')->get()
            ->filter(fn ($assignment) => $assignment->is_active && $assignment->reviewer !== null);
        if ($researchDocument->section?->instructor !== null) {
            $instructorName = $researchDocument->section->instructor->displayName();
        } else {
            $instructorName = null;
        }
        $researchDocument->loadMissing('authors.user');
        $teamByStage = $this->teamMembersByStage($researchDocument);

        return response()->json(['data' => ['research_document_id' => $researchDocument->id, 'title' => $researchDocument->title, 'researchers' => $this->researcherNames($researchDocument), 'editable_stages' => collect(self::STAGES)->filter(fn (string $stage) => $this->canEditStage($actor, $researchDocument, $stage))->values()->all(), 'stages' => collect(self::STAGES)->mapWithKeys(function (string $stage) use ($entries, $actor, $teamByStage, $reviewAssignments, $instructorName) {
            $defenseType = str_contains($stage, '_final_defense') ? 'final' : 'proposal';
            $reviewActors = $reviewAssignments->filter(fn ($assignment) => ! Schema::hasColumn((new ReviewAssignment)->getTable(), 'defense_type') || $assignment->defense_type === $defenseType)
                ->mapWithKeys(fn ($assignment) => [$this->assignmentDesignation($assignment) => $assignment->reviewer->displayName()]);
            if ($instructorName !== null) $reviewActors->put('Instructor', $instructorName);

            return [$stage => $this->stage($this->isBeforeStage($stage) ? self::PRE : self::POST, $entries->where('monitoring_stage', $stage), $actor->id, $this->actorsForStage($stage, $reviewActors, $teamByStage))];
        })->all()]])->header('Cache-Control', 'private, no-store');
    }

    public function team(Request $request, ResearchDocument $researchDocument, ResearchProjectTeamService $teams): JsonResponse
    {
        $this->authorizeView($this->actor($request), $researchDocument);
        $input = $request->validate(['defense_type' => ['nullable', Rule::in(['proposal', 'final'])]]);
        $section = $researchDocument->section()->firstOrFail();

        return response()->json(['data' => $teams->get($section, $researchDocument, $input['defense_type'] ?? 'proposal')])
            ->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->authorizeView($actor, $researchDocument);
        $input = $request->validate(['entry_id' => ['nullable', 'integer'], 'signature_entry_id' => ['nullable', 'integer'], 'monitoring_stage' => ['required', Rule::in(self::STAGES)], 'activity' => ['required', 'string', 'max:10000'], 'remarks' => ['nullable', 'string', 'max:10000'], 'status' => ['required', Rule::in(['pending', 'in_progress', 'completed', 'not_applicable'])], 'signature_status' => ['required', Rule::in(['unsigned', 'signed'])]]);
        [$role, $designation] = $this->editableSection($actor, $researchDocument, $input['monitoring_stage']);
        DB::transaction(function () use ($actor, $researchDocument, $input, $role, $designation, $activity): int {
            $this->preserveLegacySignaturesForRows($researchDocument->id, $input['monitoring_stage'], $actor->id);
            $hasSignature = isset($input['signature_entry_id'])
                || $this->signaturePath($researchDocument->id, $input['monitoring_stage'], $actor->id, $input['entry_id'] ?? null, isset($input['entry_id'])) !== null;
            if ($input['signature_status'] === 'signed' && ! $hasSignature) {
                throw ValidationException::withMessages(['signature_status' => ['A stored signature is required before an entry can be marked signed.']]);
            }
            $savedAt = now();
            $values = ['reviewer_role' => $role, 'activity_date' => $savedAt->toDateString(), 'activity' => $input['activity'], 'remarks' => $input['remarks'] ?? null, 'status' => $input['status'], 'signature_status' => $hasSignature ? 'signed' : 'unsigned', 'updated_at' => $savedAt];
            if (isset($input['entry_id'])) {
                $entry = DB::table('monitoring_entries')->where('id', $input['entry_id'])->where('research_document_id', $researchDocument->id)->where('reviewer_id', $actor->id)->where('monitoring_stage', $input['monitoring_stage'])->where('designation', $designation);
                abort_unless($entry->exists(), 404);
                $entry->update($values);
                $entryId = (int) $input['entry_id'];
            } else {
                $capacity = $this->sectionCapacity($input['monitoring_stage'], $designation);
                $count = DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('monitoring_stage', $input['monitoring_stage'])->where('designation', $designation)->count();
                if ($count >= $capacity) {
                    throw ValidationException::withMessages(['monitoring_stage' => ['No blank rows remain in your monitoring section.']]);
                }
                $entryId = (int) DB::table('monitoring_entries')->insertGetId([...$values, 'research_document_id' => $researchDocument->id, 'reviewer_id' => $actor->id, 'monitoring_stage' => $input['monitoring_stage'], 'designation' => $designation, 'created_at' => now()]);
            }
            if (isset($input['signature_entry_id'])) {
                $source = DB::table('monitoring_entries')->where('id', $input['signature_entry_id'])->where('research_document_id', $researchDocument->id)->where('reviewer_id', $actor->id)->where('monitoring_stage', $input['monitoring_stage'])->where('signature_status', 'signed')->first();
                abort_if($source === null, 404);
                $this->copyEntrySignature($researchDocument->id, $input['monitoring_stage'], $actor->id, (int) $source->id, $entryId);
            } elseif (! isset($input['entry_id'])) {
                $this->preserveSignatureForEntry($researchDocument->id, $input['monitoring_stage'], $actor->id, $entryId);
            }
            DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('monitoring_stage', $input['monitoring_stage'])->update(['verified_by' => null, 'verified_at' => null]);
            $activity->log($researchDocument, 'SHARED_MONITORING_UPDATED', $actor, $designation.' monitoring section updated.', null, $input['status'], $input['status']);

            return $entryId;
        });

        return $this->show($request, $researchDocument);
    }

    public function storeSignature(Request $request, ResearchDocument $researchDocument): JsonResponse
    {
        $actor = $this->actor($request);
        $this->authorizeView($actor, $researchDocument);
        $input = $request->validate([
            'monitoring_stage' => ['required', Rule::in(self::STAGES)],
            'entry_id' => ['nullable', 'integer'],
            'signature' => ['required', 'file', 'mimes:png,jpg,jpeg', 'max:2048'],
        ]);
        $this->editableSection($actor, $researchDocument, $input['monitoring_stage']);
        if (isset($input['entry_id'])) {
            abort_unless(DB::table('monitoring_entries')->where('id', $input['entry_id'])->where('research_document_id', $researchDocument->id)->where('monitoring_stage', $input['monitoring_stage'])->where('reviewer_id', $actor->id)->exists(), 404);
        } else {
            $this->preserveLegacySignaturesForRows($researchDocument->id, $input['monitoring_stage'], $actor->id);
        }
        $directory = $this->signatureDirectory($researchDocument->id, $input['monitoring_stage']);
        $disk = Storage::disk('researchnav_private');
        $signatureName = isset($input['entry_id']) ? (string) $input['entry_id'] : $actor->id;
        foreach ($disk->files($directory) as $file) {
            if (pathinfo($file, PATHINFO_FILENAME) === $signatureName) {
                $disk->delete($file);
            }
        }
        $extension = $input['signature']->guessExtension() === 'jpeg' ? 'jpg' : $input['signature']->guessExtension();
        $disk->putFileAs($directory, $input['signature'], $signatureName.'.'.$extension);
        DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('monitoring_stage', $input['monitoring_stage'])->update(['verified_by' => null, 'verified_at' => null, 'updated_at' => now()]);

        return $this->show($request, $researchDocument);
    }

    public function destroy(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        $this->authorizeView($actor, $researchDocument);
        $entryId = $request->validate(['entry_id' => ['required', 'integer']])['entry_id'];
        $entry = DB::table('monitoring_entries')->where('id', $entryId)->where('research_document_id', $researchDocument->id)->where('reviewer_id', $actor->id)->first();
        abort_if($entry === null, 404);
        [, $designation] = $this->editableSection($actor, $researchDocument, $entry->monitoring_stage);
        abort_unless(strtolower((string) $entry->designation) === strtolower($designation), 403);

        DB::transaction(function () use ($actor, $researchDocument, $entry, $entryId, $activity): void {
            DB::table('monitoring_entries')->where('id', $entryId)->delete();
            DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('monitoring_stage', $entry->monitoring_stage)->update(['verified_by' => null, 'verified_at' => null, 'updated_at' => now()]);
            $activity->log($researchDocument, 'SHARED_MONITORING_ENTRY_REMOVED', $actor, $entry->designation.' monitoring entry removed.', $entry->status, null, 'removed');
        });

        $disk = Storage::disk('researchnav_private');
        foreach ($disk->files($this->signatureDirectory($researchDocument->id, $entry->monitoring_stage)) as $file) {
            if (pathinfo($file, PATHINFO_FILENAME) === (string) $entryId) {
                $disk->delete($file);
            }
        }

        return $this->show($request, $researchDocument);
    }

    public function signature(Request $request, ResearchDocument $researchDocument, string $stage, string $reviewer)
    {
        $actor = $this->actor($request);
        $this->authorizeView($actor, $researchDocument);
        abort_unless(in_array($stage, self::STAGES, true), 404);
        $entryId = $request->integer('entry');
        $entry = DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('monitoring_stage', $stage)->where('reviewer_id', $reviewer)->when($entryId > 0, fn ($query) => $query->where('id', $entryId))->first();
        abort_if($entry === null || $entry->signature_status !== 'signed', 404);
        $path = $this->signaturePath($researchDocument->id, $stage, $reviewer, $entryId > 0 ? $entryId : null, $request->boolean('legacy'));
        abort_if($path === null, 404);

        return Storage::disk('researchnav_private')->response($path, null, ['Cache-Control' => 'private, no-store']);
    }

    public function verify(Request $request, ResearchDocument $researchDocument, MonitoringService $activity): JsonResponse
    {
        $actor = $this->actor($request);
        if (! DomainAuthorization::isAssignedReviewer($actor, $researchDocument) || $actor->role !== 'instructor') {
            abort(403);
        }
        $stage = $request->validate(['monitoring_stage' => ['required', Rule::in(self::STAGES)]])['monitoring_stage'];
        $required = $this->isBeforeStage($stage) ? self::PRE : self::POST;
        $entries = DB::table('monitoring_entries')->where('research_document_id', $researchDocument->id)->where('monitoring_stage', $stage)->get();
        $complete = $entries->filter(fn ($row) => ($row->status === 'completed' && $row->signature_status === 'signed' && $this->signaturePath($researchDocument->id, $stage, (string) $row->reviewer_id, (int) $row->id, true) !== null) || $row->status === 'not_applicable')->pluck('designation')->map(fn ($value) => strtolower($value));
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
        if (DomainAuthorization::isResearcherParticipant($actor, $research)
            || DomainAuthorization::isAssignedRecordReader($actor, $research)
            || DomainAuthorization::isOffice($actor)) {
            return;
        }
        abort(403);
    }

    private function assignedResearch(User $actor)
    {
        return ResearchDocument::query()->where(function ($documents) use ($actor): void {
            $active = ReviewAssignment::column('is_active');
            $documents->whereHas('reviewAssignments', fn ($assignments) => $assignments
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->when($active === 'status', fn ($query) => $query->whereIn($active, ['accepted', 'confirmed', 'active']), fn ($query) => $query->where($active, true)));
            if (DomainAuthorization::hasAnyRole($actor, ['instructor', 'research_instructor'])) {
                $documents->orWhereHas('section', fn ($section) => $section->where('instructor_id', $actor->id));
            }
        });
    }

    private function editableSection(User $actor, ResearchDocument $research, string $stage): array
    {
        $canonical = $actor->roleDefinition?->slug;
        $role = $canonical === 'research_editor' ? 'research_editor' : $actor->role;
        if (! $this->canEditStage($actor, $research, $stage)) {
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
        if (preg_match('/^panel_([1-3])$/', (string) $assignment?->designation, $matches) === 1) {
            return 'Panel '.$matches[1];
        }
        // Backward compatibility for assignments saved before numbered panel
        // designations were introduced.
        $ids = $research->reviewAssignments()->where(ReviewAssignment::column('review_role'), 'panel')
            ->whereIn('designation', ['panel_member', null])->orderBy('id')
            ->pluck(ReviewAssignment::column('reviewer_id'))->values();
        $position = $ids->search($actor->id);

        return 'Panel '.(($position === false ? 0 : $position) + 1);
    }

    private function assignmentDesignation(ReviewAssignment $assignment): string
    {
        $role = $assignment->review_role;

        return match ($role) {
            'adviser' => 'Adviser',
            'instructor' => 'Instructor',
            'statistician' => 'Statistician',
            'librarian' => 'Librarian',
            'research_editor' => 'Editor',
            'research-office' => 'Research Rep',
            'panel' => match ($assignment->designation) {
                'panel_chair' => 'Chair',
                'panel_1' => 'Panel 1',
                'panel_2' => 'Panel 2',
                'panel_3' => 'Panel 3',
                default => (string) ($assignment->designation ?: 'Panel 1'),
            },
            default => ucfirst(str_replace('_', ' ', (string) $role)),
        };
    }

    /**
     * Team rows scoped per defense stage, or null on legacy schemas where the
     * team table has no defense_type column (proposal and final share one team).
     *
     * @return array<string, Collection>|null
     */
    private function teamMembersByStage(ResearchDocument $researchDocument): ?array
    {
        if (! Schema::hasColumn('research_project_team_members', 'defense_type')) {
            return null;
        }

        $grouped = ResearchProjectTeamMember::query()->with('user')
            ->where('research_document_id', $researchDocument->id)
            ->orderBy('position')->orderBy('id')->get()->groupBy('defense_type');

        return [
            'proposal' => $grouped->get('proposal', collect()),
            'final' => $grouped->get('final', collect()),
        ];
    }

    /**
     * Actor names for one monitoring stage. Support roles and the section
     * instructor always come from review assignments; managed roles (adviser,
     * panels, chair, research rep) come from the stage's team rows. The final
     * defense stays Unassigned until the instructor actually assigns it.
     */
    private function actorsForStage(string $stage, Collection $reviewActors, ?array $teamByStage): Collection
    {
        if ($teamByStage === null) {
            return $reviewActors;
        }

        $isFinal = str_contains($stage, '_final_defense');
        $members = $teamByStage[$isFinal ? 'final' : 'proposal'];
        $memberName = fn (string $role) => $members->firstWhere('team_role', $role)?->user?->displayName();
        // Proposal stages keep the review-assignment fallback so existing
        // contacts still show when a role was never managed through the team UI.
        $fallback = fn (string $key) => $isFinal ? null : $reviewActors->get($key);

        $actors = collect(['Instructor' => $reviewActors->get('Instructor')]);
        foreach (['Editor', 'Statistician', 'Librarian'] as $key) {
            $actors->put($key, $reviewActors->get($key));
        }
        $actors->put('Adviser', $memberName('adviser') ?? $fallback('Adviser'));
        $actors->put('Research Rep', $memberName('research_office_representative') ?? $fallback('Research Rep'));
        $actors->put('Chair', $memberName('chair') ?? $fallback('Chair'));
        $panels = $members->where('team_role', 'panel_member')->values();
        foreach (['Panel 1', 'Panel 2', 'Panel 3'] as $index => $key) {
            $actors->put($key, $panels->get($index)?->user?->displayName() ?? ($isFinal ? null : $reviewActors->get($key)));
        }

        return $actors;
    }

    private function stage(array $sections, $entries, string $actorId, $assignedActors): array
    {
        return ['sections' => collect($sections)->map(function ($name) use ($entries, $actorId, $assignedActors) {
            $matchingEntries = $entries->filter(fn ($row) => strtolower($row->designation) === strtolower($name))->sortBy('id')->values();
            $legacyFallback = $matchingEntries->count() === 1;
            $sectionEntries = $matchingEntries->map(function ($entry) use ($actorId, $legacyFallback) {
                $entry->signature_url = $entry->signature_status === 'signed' && $this->signaturePath($entry->research_document_id, $entry->monitoring_stage, $entry->reviewer_id, $entry->id, $legacyFallback)
                    ? '/api/research/'.$entry->research_document_id.'/shared-monitoring/signature/'.$entry->monitoring_stage.'/'.$entry->reviewer_id.'?entry='.$entry->id.($legacyFallback ? '&legacy=1' : '').'&v='.urlencode((string) $entry->updated_at)
                    : null;
                $entry->is_owned = $entry->reviewer_id === $actorId;
                $entry->saved_at = $entry->updated_at;

                return $entry;
            })->all();

            return ['designation' => $name, 'assigned_actor_name' => $assignedActors->get($name) ?? ($sectionEntries[0]->reviewer_name ?? null), 'entry' => $sectionEntries === [] ? null : end($sectionEntries), 'entries' => $sectionEntries];
        })->values(), 'verified_by' => $entries->pluck('verified_by')->filter()->first(), 'verified_at' => $entries->pluck('verified_at')->filter()->first()];
    }

    private function signatureDirectory(int $researchId, string $stage): string
    {
        return 'monitoring-signatures/'.$researchId.'/'.$stage;
    }

    private function signaturePath(int $researchId, string $stage, string $reviewer, ?int $entryId = null, bool $allowLegacyFallback = false): ?string
    {
        $disk = Storage::disk('researchnav_private');
        $names = $entryId === null ? [$reviewer] : [(string) $entryId];
        if ($entryId !== null && $allowLegacyFallback) {
            $names[] = $reviewer;
        }
        foreach ($disk->files($this->signatureDirectory($researchId, $stage)) as $file) {
            if (in_array(pathinfo($file, PATHINFO_FILENAME), $names, true)) {
                return $file;
            }
        }

        return null;
    }

    private function preserveSignatureForEntry(int $researchId, string $stage, string $reviewer, int $entryId): void
    {
        $disk = Storage::disk('researchnav_private');
        $source = $this->signaturePath($researchId, $stage, $reviewer);
        if ($source === null) {
            return;
        }
        foreach ($disk->files($this->signatureDirectory($researchId, $stage)) as $file) {
            if (pathinfo($file, PATHINFO_FILENAME) === (string) $entryId) {
                $disk->delete($file);
            }
        }
        $disk->copy($source, $this->signatureDirectory($researchId, $stage).'/'.$entryId.'.'.pathinfo($source, PATHINFO_EXTENSION));
    }

    private function preserveLegacySignaturesForRows(int $researchId, string $stage, string $reviewer): void
    {
        $source = $this->signaturePath($researchId, $stage, $reviewer);
        if ($source === null) {
            return;
        }
        $rows = DB::table('monitoring_entries')->where('research_document_id', $researchId)->where('monitoring_stage', $stage)->where('reviewer_id', $reviewer)->where('signature_status', 'signed')->get();
        foreach ($rows as $row) {
            if ($this->signaturePath($researchId, $stage, $reviewer, (int) $row->id) === null) {
                Storage::disk('researchnav_private')->copy($source, $this->signatureDirectory($researchId, $stage).'/'.$row->id.'.'.pathinfo($source, PATHINFO_EXTENSION));
            }
        }
    }

    private function copyEntrySignature(int $researchId, string $stage, string $reviewer, int $sourceEntryId, int $targetEntryId): void
    {
        $disk = Storage::disk('researchnav_private');
        $source = $this->signaturePath($researchId, $stage, $reviewer, $sourceEntryId);
        abort_if($source === null, 404);
        foreach ($disk->files($this->signatureDirectory($researchId, $stage)) as $file) {
            if (pathinfo($file, PATHINFO_FILENAME) === (string) $targetEntryId) {
                $disk->delete($file);
            }
        }
        $disk->copy($source, $this->signatureDirectory($researchId, $stage).'/'.$targetEntryId.'.'.pathinfo($source, PATHINFO_EXTENSION));
    }

    private function researcherNames(ResearchDocument $researchDocument): array
    {
        return $researchDocument->authors
            ->map(
                fn ($author) =>
                    $author->user?->profileName()
                    ?: $author->author_name
            )
            ->values()
            ->all();
    }

    private function sectionCapacity(string $stage, string $designation): int
    {
        $capacities = $this->isBeforeStage($stage)
            ? ['Adviser' => 7, 'Instructor' => 6, 'Editor' => 6, 'Statistician' => 5, 'Librarian' => 4]
            : ['Adviser' => 5, 'Instructor' => 3, 'Editor' => 3, 'Librarian' => 3, 'Panel 1' => 3, 'Panel 2' => 3, 'Panel 3' => 3, 'Research Rep' => 3, 'Chair' => 3];

        return $capacities[$designation] ?? 1;
    }

    private function isBeforeStage(string $stage): bool
    {
        return str_starts_with($stage, 'before_');
    }

    private function canEditStage(User $actor, ResearchDocument $research, string $stage): bool
    {
        $canonical = $actor->roleDefinition?->slug;
        $role = $canonical === 'research_editor' ? 'research_editor' : $actor->role;
        if ($role === 'panel' && $this->isBeforeStage($stage)) {
            return false;
        }
        if ($role === 'statistician' && ! $this->isBeforeStage($stage)) {
            return false;
        }
        if ($role === 'research-office') {
            if ($this->isBeforeStage($stage)) {
                return false;
            }
            $active = ReviewAssignment::column('is_active');

            return $research->reviewAssignments()
                ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
                ->where(ReviewAssignment::column('review_role'), 'research-office')
                ->when($active === 'status', fn ($query) => $query->whereIn($active, ['accepted', 'confirmed', 'active']), fn ($query) => $query->where($active, true))
                ->exists();
        }

        return in_array($role, ['adviser', 'instructor', 'research_editor', 'statistician', 'librarian', 'panel'], true);
    }
}
