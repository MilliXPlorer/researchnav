<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PublicResearchDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'title' => $this->title, 'abstract' => $this->abstract, 'keywords' => $this->keywords, 'publication_year' => $this->publication_year, 'institution_name' => $this->institution_name, 'institution_location' => $this->institution_location, 'academic_unit' => $this->academic_unit, 'degree_program' => $this->degree_program, 'manuscript_date_label' => $this->manuscript_date_label, 'abstract_provenance' => $this->abstract_provenance, 'research_stage' => $this->research_stage, 'has_downloadable_manuscript' => (bool) ($this->has_downloadable_manuscript ?? false), 'authors' => PublicResearchAuthorResource::collection($this->whenLoaded('authors')), 'category' => new CategoryResource($this->whenLoaded('category'))];
    }
}
