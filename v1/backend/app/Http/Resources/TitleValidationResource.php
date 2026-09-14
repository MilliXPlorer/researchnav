<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\DomainAuthorization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TitleValidationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $actor = $request->attributes->get('current_user');

        return ['id' => $this->getRouteKey(), 'research_document_id' => $this->research_document_id, 'similarity_result_id' => $this->similarity_result_id, 'validated_by' => $actor instanceof User && DomainAuthorization::isResearcher($actor) ? null : $this->validated_by, 'validator_name' => $this->whenLoaded('validator', fn () => $this->validator?->profileName() ?? 'Assigned reviewer'), 'similarity_result' => $this->whenLoaded('similarityResult', fn () => $this->similarityResult === null ? null : ['id' => $this->similarityResult->id, 'matched_title' => $this->similarityResult->matched_title, 'analyzed_at' => $this->similarityResult->analyzed_at?->toISOString()]), 'validation_status' => $this->validation_status, 'adviser_remarks' => $this->adviser_remarks, 'validated_at' => $this->validated_at?->toISOString(), 'created_at' => $this->created_at?->toISOString(), 'updated_at' => $this->updated_at?->toISOString()];
    }
}
