<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccessRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user_id' => $this->user_id,
            'email' => $this->user?->email,
            'requested_role' => $this->requested_role,
            'status' => $this->status,
            'full_name' => $this->full_name,
            'program' => $this->program,
            'justification' => $this->justification,
            'decided_by_email' => $this->decidedBy?->email,
            'decision_remarks' => $this->decision_remarks,
            'requested_at' => $this->requested_at?->toISOString(),
            'decided_at' => $this->decided_at?->toISOString(),
        ];
    }
}
