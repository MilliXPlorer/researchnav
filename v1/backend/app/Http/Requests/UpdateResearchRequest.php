<?php

namespace App\Http\Requests;

use App\Models\ResearchDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateResearchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['category_id' => ['sometimes', 'nullable', 'integer', 'exists:categories,id'], 'title' => ['sometimes', 'string', 'max:500'], 'abstract' => ['sometimes', 'nullable', 'string', 'max:50000'], 'keywords' => ['sometimes', 'nullable', 'string', 'max:5000'], 'publication_year' => ['sometimes', 'nullable', 'integer', 'between:1901,2155'], 'research_stage' => ['sometimes', Rule::in(ResearchDocument::RESEARCH_STAGES)], 'visibility' => ['prohibited'], 'authors' => ['sometimes', 'array', 'min:1', 'max:50'], 'authors.*.user_id' => ['nullable', 'uuid', Rule::exists('users', 'id')->whereNull('deleted_at')], 'authors.*.author_name' => ['required_with:authors', 'string', 'max:255', 'distinct'], 'authors.*.is_corresponding_author' => ['sometimes', 'boolean']];
    }
}
