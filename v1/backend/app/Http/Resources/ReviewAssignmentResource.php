<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ReviewAssignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reviewer_id' => $this->reviewer_id,
            'reviewer_name' => $this->whenLoaded('reviewer', fn () => $this->reviewer?->profileName() ?? 'Assigned reviewer'),
            'review_role' => $this->review_role,
            'is_active' => $this->is_active,
            'assigned_by' => $this->assigned_by,
        ];
    }
}
