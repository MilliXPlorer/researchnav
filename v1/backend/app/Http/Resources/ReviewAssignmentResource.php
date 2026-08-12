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
            'review_role' => $this->review_role,
            'is_active' => $this->is_active,
            'assigned_by' => $this->assigned_by,
        ];
    }
}
