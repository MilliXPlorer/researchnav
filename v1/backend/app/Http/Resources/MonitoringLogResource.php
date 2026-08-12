<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MonitoringLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'research_document_id' => $this->research_document_id, 'performed_by' => $this->performed_by, 'activity_type' => $this->activity_type, 'remarks' => $this->remarks, 'previous_status' => $this->previous_status, 'new_status' => $this->new_status, 'monitoring_status' => $this->monitoring_status, 'activity_date' => $this->activity_date?->toISOString()];
    }
}
