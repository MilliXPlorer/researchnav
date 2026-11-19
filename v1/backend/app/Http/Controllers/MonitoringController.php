<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreMonitoringLogRequest;
use App\Http\Resources\MonitoringLogResource;
use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Policies\ResearchDocumentPolicy;
use App\Services\ConsolidatedReadAdapter;
use App\Services\DomainAuthorization;
use App\Services\MonitoringService;
use Illuminate\Http\Request;

class MonitoringController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument, ConsolidatedReadAdapter $shadow)
    {
        $actor = $this->actor($request);
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($actor, $researchDocument));

        $logs = $shadow->enabled()
            ? $shadow->monitoringLogsForDocument($researchDocument->id)
            : $researchDocument->monitoringLogs()->with('performedBy')->latest(MonitoringLog::column('activity_date'))->get();
        if (! DomainAuthorization::isResearcherParticipant($actor, $researchDocument)) {
            $logs = $logs->filter(fn (MonitoringLog $log): bool => ! str_starts_with($log->activity_type, 'FEEDBACK_') || $log->performed_by === $actor->id)->values();
        }

        return MonitoringLogResource::collection($logs)->response()->header('Cache-Control', 'private, no-store');
    }

    public function store(StoreMonitoringLogRequest $request, ResearchDocument $researchDocument, MonitoringService $service)
    {
        $this->allowed((new ResearchDocumentPolicy)->reportProgress($this->actor($request), $researchDocument));

        return (new MonitoringLogResource($service->reportProgress($this->actor($request), $researchDocument, $request->validated(), $request)->load('performedBy')))
            ->response()->setStatusCode(201);
    }
}
