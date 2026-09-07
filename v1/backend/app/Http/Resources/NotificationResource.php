<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class NotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'type' => $this->type, 'event' => $this->data['event'] ?? null, 'title' => $this->data['title'] ?? null, 'message' => $this->data['message'] ?? null, 'details' => $this->data['details'] ?? $this->data['message'] ?? null, 'research_title' => $this->data['research_title'] ?? null, 'submission_reference' => $this->data['submission_reference'] ?? null, 'action_url' => $this->data['action_url'] ?? null, 'research_document_id' => $this->research_document_id, 'read_at' => $this->read_at?->toISOString(), 'created_at' => $this->created_at?->toISOString()];
    }
}
