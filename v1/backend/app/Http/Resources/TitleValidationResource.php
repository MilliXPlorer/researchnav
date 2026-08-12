<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TitleValidationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'research_document_id' => $this->research_document_id, 'similarity_result_id' => $this->similarity_result_id, 'validated_by' => $this->validated_by, 'validation_status' => $this->validation_status, 'adviser_remarks' => $this->adviser_remarks, 'validated_at' => $this->validated_at?->toISOString()];
    }
}
