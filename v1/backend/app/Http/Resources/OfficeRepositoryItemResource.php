<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OfficeRepositoryItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $trashed = $this->resource->trashed();

        return [
            'id' => $this->id,
            'submission_reference' => $this->submission_reference,
            'title' => $this->title,
            'publication_year' => $this->publication_year,
            'institute' => $this->institute,
            'research_stage' => $this->research_stage,
            'submission_status' => $this->submission_status,
            'archive_status' => $this->archive_status,
            'visibility' => $this->visibility,
            'author_names' => $this->whenLoaded('authors', fn () => $this->authors->pluck('author_name')->values()),
            'updated_at' => $this->updated_at?->toISOString(),
            'deleted_at' => $this->deleted_at?->toISOString(),
            'can_edit' => ! $trashed,
            'can_delete' => ! $trashed,
            'can_restore' => $trashed,
        ];
    }
}
