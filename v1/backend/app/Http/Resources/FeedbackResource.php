<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\DomainAuthorization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FeedbackResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $actor = $request->attributes->get('current_user');

        return ['id' => $this->getRouteKey(), 'research_document_id' => $this->research_document_id, 'user_id' => $actor instanceof User && DomainAuthorization::isResearcher($actor) ? null : $this->user_id, 'reviewer_name' => $this->whenLoaded('user', fn () => $this->user?->profileName() ?? 'Assigned reviewer'), 'document_file_id' => $this->document_file_id, 'comment' => $this->comment, 'feedback_type' => $this->feedback_type, 'feedback_status' => $this->feedback_status, 'researcher_acknowledged_at' => $this->researcher_acknowledged_at?->toISOString(), 'researcher_addressed_at' => $this->researcher_addressed_at?->toISOString(), 'researcher_action_remarks' => $this->researcher_action_remarks, 'created_at' => $this->created_at?->toISOString()];
    }
}
