<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PdfAnnotationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'research_document_id' => $this->research_document_id,
            'document_file_id' => $this->document_file_id,
            'document_file_version' => $this->whenLoaded('documentFile', fn () => $this->documentFile?->version_number),
            'author_name' => $this->whenLoaded('author', fn () => $this->author?->profileName() ?? $this->author?->email ?? 'Reviewer'),
            'author_role' => $this->roleLabel($this->author_role),
            'kind' => $this->kind,
            'body' => $this->body,
            'anchor' => [
                'schema_version' => $this->anchor_schema_version,
                'page_number' => $this->page_number,
                'exact' => $this->selected_text,
                'prefix' => $this->text_prefix,
                'suffix' => $this->text_suffix,
                'rects' => $this->rects,
            ],
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    private function roleLabel(string $role): string
    {
        return match ($role) {
            'adviser' => 'Research Adviser',
            'instructor' => 'Research Instructor',
            'research-office' => 'Research Office Representative',
            'admin' => 'Administrator',
            default => ucwords(str_replace(['_', '-'], ' ', $role)),
        };
    }
}
