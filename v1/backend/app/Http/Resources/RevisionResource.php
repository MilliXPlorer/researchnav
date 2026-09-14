<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\DomainAuthorization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RevisionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $actor = $request->attributes->get('current_user');

        return ['id' => $this->getRouteKey(), 'research_document_id' => $this->research_document_id, 'requested_by' => $actor instanceof User && DomainAuthorization::isResearcher($actor) ? null : $this->requested_by, 'requester_name' => $this->whenLoaded('requester', fn () => $this->requester?->profileName() ?? 'Assigned reviewer'), 'document_file_id' => $this->document_file_id, 'revision_number' => $this->revision_number, 'revision_remarks' => $this->revision_remarks, 'required_action' => $this->required_action, 'revision_status' => $this->revision_status, 'lifecycle_status' => $this->lifecycleStatus(), 'requested_at' => $this->requested_at?->toISOString(), 'submitted_at' => $this->submitted_at?->toISOString(), 'resolved_at' => $this->resolved_at?->toISOString()];
    }

    private function lifecycleStatus(): string
    {
        return match ($this->revision_status) {
            'requested', 'in_progress' => 'researcher_action_required',
            'resubmitted', 'under_review' => 'awaiting_reviewer_review',
            'accepted' => 'completed',
            default => $this->revision_status,
        };
    }
}
