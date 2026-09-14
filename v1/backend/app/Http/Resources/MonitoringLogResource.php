<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\DomainAuthorization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MonitoringLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $actor = $request->attributes->get('current_user');

        return ['id' => $this->getRouteKey(), 'research_document_id' => $this->research_document_id, 'performed_by' => $actor instanceof User && DomainAuthorization::isResearcher($actor) ? null : $this->performed_by, 'performed_by_name' => $this->whenLoaded('performedBy', fn () => $this->performedBy?->profileName() ?? 'Activity participant'), 'activity_type' => $this->activity_type, 'remarks' => $this->remarks, 'previous_status' => $this->previous_status, 'new_status' => $this->new_status, 'monitoring_status' => $this->monitoring_status, 'activity_date' => $this->activity_date?->toISOString()];
    }
}
