<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTitleRecommendationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'validation_status' => ['required', Rule::in(['approved', 'revision_required', 'rejected'])],
            'adviser_remarks' => ['nullable', 'string', 'max:10000', 'required_unless:validation_status,approved'],
            'similarity_result_id' => ['nullable', 'integer', 'exists:similarity_results,id'],
            'validated_by' => ['prohibited'],
        ];
    }
}
