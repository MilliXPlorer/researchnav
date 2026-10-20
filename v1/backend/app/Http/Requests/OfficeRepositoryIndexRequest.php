<?php

namespace App\Http\Requests;

use App\Models\ResearchDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class OfficeRepositoryIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'bucket' => ['nullable', 'string', Rule::in(['ongoing', 'archived', 'recycle'])],
            'search' => ['nullable', 'string', 'max:200'],
            'institute' => ['nullable', 'string', Rule::in(ResearchDocument::INSTITUTES)],
            'publication_year' => ['nullable', 'integer', 'between:1901,2155'],
            'sort' => ['nullable', 'string', Rule::in(['title', 'publication_year', 'updated_at'])],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ];
    }
}
