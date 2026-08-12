<?php

namespace App\Http\Resources;

use App\Services\DomainAuthorization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResearchDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $actor = $request->attributes->get('current_user');
        if ($actor !== null && $actor->id !== $this->submitted_by && ! DomainAuthorization::isOffice($actor) && ! $this->reviewAssignments()->where('reviewer_id', $actor->id)->where('is_active', true)->exists()) {
            return (new PublicResearchDocumentResource($this->resource))->toArray($request);
        }

        return ['id' => $this->id, 'submitted_by' => $this->submitted_by, 'category_id' => $this->category_id, 'title' => $this->title, 'normalized_title' => $this->normalized_title, 'abstract' => $this->abstract, 'keywords' => $this->keywords, 'publication_year' => $this->publication_year, 'institution_name' => $this->institution_name, 'institution_location' => $this->institution_location, 'academic_unit' => $this->academic_unit, 'degree_program' => $this->degree_program, 'manuscript_date_label' => $this->manuscript_date_label, 'abstract_provenance' => $this->abstract_provenance, 'research_stage' => $this->research_stage, 'submission_status' => $this->submission_status, 'archive_status' => $this->archive_status, 'visibility' => $this->visibility, 'submitted_at' => $this->submitted_at?->toISOString(), 'approved_at' => $this->approved_at?->toISOString(), 'archived_at' => $this->archived_at?->toISOString(), 'authors' => ResearchAuthorResource::collection($this->whenLoaded('authors')), 'category' => new CategoryResource($this->whenLoaded('category'))];
    }
}
