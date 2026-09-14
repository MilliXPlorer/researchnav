<?php

namespace App\Services;

use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Policies\ResearchDocumentPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MonitoringService
{
    public function __construct(private readonly ConsolidationShadowService $shadow) {}

    public function log(ResearchDocument $research, string $activityType, ?User $user = null, ?string $remarks = null, ?string $previousStatus = null, ?string $newStatus = null, ?string $monitoringStatus = null): MonitoringLog
    {
        $log = MonitoringLog::query()->create([
            'research_document_id' => $research->id,
            'performed_by' => $user?->id,
            'activity_type' => $activityType,
            'remarks' => $remarks,
            'previous_status' => $previousStatus,
            'new_status' => $newStatus,
            'monitoring_status' => $monitoringStatus,
            'activity_date' => now(),
        ]);

        $this->shadow->mirrorMonitoring($log);

        return $log;
    }

    /** @param array{progress_status:string,remarks:string} $data */
    public function reportProgress(User $actor, ResearchDocument $research, array $data, ?Request $request = null): MonitoringLog
    {
        return DB::transaction(function () use ($actor, $research, $data, $request): MonitoringLog {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = User::query()->lockForUpdate()->find($actor->id);
            if ($actor === null || ! (new ResearchDocumentPolicy)->reportProgress($actor, $locked)) {
                throw ValidationException::withMessages(['authorization' => ['Only the owner of an active ongoing research record can report progress.']]);
            }
            $log = MonitoringLog::query()->create([
                'research_document_id' => $locked->id,
                'performed_by' => $actor->id,
                'activity_type' => 'RESEARCHER_PROGRESS_REPORTED',
                'remarks' => $data['remarks'],
                'monitoring_status' => $data['progress_status'],
                'activity_date' => now(),
            ]);
            $this->shadow->mirrorMonitoring($log);
            app(AuditService::class)->log($actor, 'RESEARCHER_PROGRESS_REPORTED', $log, 'Reported researcher progress.', $request);

            return $log;
        });
    }
}
