<?php

namespace App\Services;

use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\User;

class MonitoringService
{
    public function log(ResearchDocument $research, string $activityType, ?User $user = null, ?string $remarks = null, ?string $previousStatus = null, ?string $newStatus = null, ?string $monitoringStatus = null): MonitoringLog
    {
        return MonitoringLog::query()->create([
            'research_document_id' => $research->id,
            'performed_by' => $user?->id,
            'activity_type' => $activityType,
            'remarks' => $remarks,
            'previous_status' => $previousStatus,
            'new_status' => $newStatus,
            'monitoring_status' => $monitoringStatus,
            'activity_date' => now(),
        ]);
    }
}
