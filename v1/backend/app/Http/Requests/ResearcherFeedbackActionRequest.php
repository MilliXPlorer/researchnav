<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ResearcherFeedbackActionRequest extends FormRequest
{
    use Concerns\RejectsUnknownFields;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'action' => ['required', Rule::in(['acknowledge', 'address'])],
            'remarks' => ['nullable', 'string', 'max:10000', 'required_if:action,address'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn () => $this->rejectUnknownFields($validator, ['action', 'remarks']));
    }
}
