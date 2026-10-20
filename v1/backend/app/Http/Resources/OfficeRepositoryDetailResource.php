<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OfficeRepositoryDetailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $trashed = $this->resource->trashed();

        return [
            'id' => $this->id,
            'submission_reference' => $this->submission_reference,
            'category_id' => $this->category_id,
            'title' => $this->title,
            'normalized_title' => $this->normalized_title,
            'abstract' => $this->abstract,
            'keywords' => $this->keywords,
            'publication_year' => $this->publication_year,
            'institute' => $this->institute,
            'degree_program' => $this->degree_program,
            'manuscript_date_label' => $this->manuscript_date_label,
            'research_stage' => $this->research_stage,
            'submission_status' => $this->submission_status,
            'archive_status' => $this->archive_status,
            'visibility' => $this->visibility,
            'submitted_at' => $this->submitted_at?->toISOString(),
            'approved_at' => $this->approved_at?->toISOString(),
            'archived_at' => $this->archived_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
            'deleted_at' => $this->deleted_at?->toISOString(),
            'category' => $this->whenLoaded('category', fn () => $this->category === null ? null : [
                'id' => $this->category->id,
                'name' => $this->category->name,
                'slug' => $this->category->slug,
            ]),
            'sdgs' => $this->whenLoaded('sdgs', fn () => $this->sdgs->map(fn ($sdg) => [
                'id' => $sdg->id,
                'code' => $sdg->code,
                'title' => $sdg->title,
                'short_title' => $sdg->short_title,
                'color_hex' => $sdg->color_hex,
            ])->values()),
            'authors' => $this->whenLoaded('authors', fn () => $this->authors->map(fn ($author) => [
                'id' => $author->id,
                'author_name' => $author->author_name,
                'author_order' => $author->author_order,
                'is_corresponding_author' => $author->is_corresponding_author,
            ])->values()),
            'files' => $this->whenLoaded('files', fn () => $this->files->map(fn ($file) => [
                'id' => $file->id,
                'document_type' => $file->document_type,
                'upload_purpose' => $file->upload_purpose,
                'version_number' => $file->version_number,
                'file_order' => $file->file_order,
                'original_filename' => $file->original_filename,
                'file_extension' => $file->file_extension,
                'mime_type' => $file->mime_type,
                'file_size' => $file->file_size,
                'is_current' => $file->is_current,
                'uploaded_at' => $file->uploaded_at?->toISOString(),
            ])->values()),
            'can_edit' => ! $trashed,
            'can_delete' => ! $trashed,
            'can_restore' => $trashed,
        ];
    }
}
