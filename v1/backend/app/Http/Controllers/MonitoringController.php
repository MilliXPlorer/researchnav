<?php

namespace App\Http\Controllers;

use App\Http\Resources\MonitoringLogResource;
use App\Models\ResearchDocument;
use App\Policies\ResearchDocumentPolicy;
use Illuminate\Http\Request;

class MonitoringController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed((new ResearchDocumentPolicy)->viewInternal($this->actor($request), $researchDocument));

        return MonitoringLogResource::collection($researchDocument->monitoringLogs()->latest('activity_date')->get());
    }
}
