<?php

namespace App\Http\Requests;

use App\Models\ResearchDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ResearchIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'mine' => ['nullable', 'boolean'],
            'submission_status' => ['nullable', 'string', Rule::in(ResearchDocument::SUBMISSION_STATUSES)],
            'sort' => ['nullable', 'string', Rule::in(['title', 'submission_status', 'updated_at'])],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
