<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateFeedbackStatusRequest extends FormRequest
{
    use Concerns\RejectsUnknownFields;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['feedback_status' => ['required', Rule::in(['open', 'resolved'])]];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn () => $this->rejectUnknownFields($validator, ['feedback_status']));
    }
}
