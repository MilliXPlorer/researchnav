<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTitleValidationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['validated_by' => ['required', 'uuid', Rule::exists('users', 'id')->whereNull('deleted_at')]];
    }
}
