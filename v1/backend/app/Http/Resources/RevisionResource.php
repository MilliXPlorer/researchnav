<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RevisionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'research_document_id' => $this->research_document_id, 'requested_by' => $this->requested_by, 'document_file_id' => $this->document_file_id, 'revision_number' => $this->revision_number, 'revision_remarks' => $this->revision_remarks, 'revision_status' => $this->revision_status, 'requested_at' => $this->requested_at?->toISOString(), 'submitted_at' => $this->submitted_at?->toISOString(), 'resolved_at' => $this->resolved_at?->toISOString()];
    }
}
