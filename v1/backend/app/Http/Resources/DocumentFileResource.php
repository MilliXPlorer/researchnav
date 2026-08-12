<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DocumentFileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'research_document_id' => $this->research_document_id, 'document_type' => $this->document_type, 'version_number' => $this->version_number, 'original_filename' => $this->original_filename, 'file_extension' => $this->file_extension, 'mime_type' => $this->mime_type, 'file_size' => $this->file_size, 'is_current' => $this->is_current, 'uploaded_at' => $this->uploaded_at?->toISOString()];
    }
}
