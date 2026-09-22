<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DocumentFileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'research_document_id' => $this->research_document_id,
            'uploaded_by' => $this->uploaded_by,
            'uploader_name' => $this->whenLoaded('uploader', fn () => $this->uploader?->profileName() ?? $this->uploader?->email),
            'document_type' => $this->document_type,
            'upload_purpose' => $this->upload_purpose,
            'version_number' => $this->version_number,
            'original_filename' => $this->original_filename,
            'relative_path' => $this->relative_path,
            'file_order' => $this->file_order,
            'file_extension' => $this->file_extension,
            'mime_type' => $this->mime_type,
            'file_size' => $this->file_size,
            'is_current' => $this->is_current,
            'uploaded_at' => $this->uploaded_at?->toISOString(),
        ];
    }
}
