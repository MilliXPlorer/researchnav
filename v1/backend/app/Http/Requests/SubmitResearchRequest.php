<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class SubmitResearchRequest extends FormRequest
{
    use Concerns\RejectsUnknownFields;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // The endpoint accepts no inputs. Draft completeness is checked in the
        // service after the ownership policy runs, avoiding metadata leakage.
        return [];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn () => $this->rejectUnknownFields($validator, []));
    }
}
