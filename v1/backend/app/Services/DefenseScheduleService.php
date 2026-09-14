<?php

namespace App\Services;

use App\Models\DefenseSchedule;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class DefenseScheduleService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring) {}

    public function list(User $actor, bool $mineOnly = false): array
    {
        $query = DefenseSchedule::query()
            ->with(['researchDocument:id,title,submission_status,research_stage', 'createdBy:id,first_name,middle_name,last_name'])
            ->orderByDesc('scheduled_at');

        if ($mineOnly) {
            $query->whereHas('researchDocument', function ($documents) use ($actor): void {
                $documents->whereHas('reviewAssignments', fn ($assignments) => $assignments
                    ->where('reviewer_id', $actor->id)
                    ->where('review_role', $actor->role)
                    ->where('is_active', true));
            });
        }

        return $query->get()
            ->map(fn (DefenseSchedule $schedule) => [
                'id' => $schedule->id,
                'research_document_id' => $schedule->research_document_id,
                'title' => $schedule->researchDocument?->title,
                'submission_status' => $schedule->researchDocument?->submission_status,
                'research_stage' => $schedule->researchDocument?->research_stage,
                'scheduled_at' => $schedule->scheduled_at?->toISOString(),
                'room' => $schedule->room,
                'notes' => $schedule->notes,
                'status' => $schedule->status,
                'created_by' => [
                    'id' => $schedule->createdBy?->id,
                    'name' => $schedule->createdBy ? trim(implode(' ', array_filter([
                        $schedule->createdBy->first_name, $schedule->createdBy->middle_name, $schedule->createdBy->last_name,
                    ]))) : null,
                ],
            ])
            ->all();
    }

    public function create(User $actor, array $data, ?Request $request = null): DefenseSchedule
    {
        return DB::transaction(function () use ($actor, $data, $request): DefenseSchedule {
            $document = ResearchDocument::query()->whereKey($data['research_document_id'])->lockForUpdate()->firstOrFail();
            $schedule = DefenseSchedule::query()->create([
                'research_document_id' => $document->id,
                'created_by' => $actor->id,
                'scheduled_at' => $data['scheduled_at'],
                'room' => $data['room'] ?? null,
                'notes' => $data['notes'] ?? null,
                'status' => 'scheduled',
            ]);
            $this->monitoring->log($document, 'DEFENSE_SCHEDULED', $actor, "Defense scheduled for {$schedule->scheduled_at?->toDateTimeString()}.", null, null, 'open');
            $this->audit->log($actor, 'DEFENSE_SCHEDULED', $schedule, 'Scheduled a research defense.', $request);

            return $schedule->load(['researchDocument', 'createdBy']);
        });
    }

    public function update(User $actor, DefenseSchedule $schedule, array $data, ?Request $request = null): DefenseSchedule
    {
        return DB::transaction(function () use ($actor, $schedule, $data, $request): DefenseSchedule {
            $locked = DefenseSchedule::query()->whereKey($schedule->id)->lockForUpdate()->firstOrFail();
            $locked->update([
                'scheduled_at' => $data['scheduled_at'] ?? $locked->scheduled_at,
                'room' => array_key_exists('room', $data) ? $data['room'] : $locked->room,
                'notes' => array_key_exists('notes', $data) ? $data['notes'] : $locked->notes,
                'status' => $data['status'] ?? $locked->status,
            ]);
            $this->monitoring->log($locked->researchDocument, 'DEFENSE_SCHEDULE_UPDATED', $actor, "Defense schedule updated to [{$locked->status}].", null, null, $locked->status === 'completed' ? 'resolved' : 'open');
            $this->audit->log($actor, 'DEFENSE_SCHEDULE_UPDATED', $locked, "Updated defense schedule status to [{$locked->status}].", $request);

            return $locked->load(['researchDocument', 'createdBy']);
        });
    }

    public static function guardStatus(string $status): void
    {
        if (! in_array($status, DefenseSchedule::STATUSES, true)) {
            throw ValidationException::withMessages(['status' => ['The defense schedule status is invalid.']]);
        }
    }
}
