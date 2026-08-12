<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FeedbackResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'research_document_id' => $this->research_document_id, 'user_id' => $this->user_id, 'document_file_id' => $this->document_file_id, 'comment' => $this->comment, 'feedback_type' => $this->feedback_type, 'feedback_status' => $this->feedback_status, 'created_at' => $this->created_at?->toISOString()];
    }
}
