<?php

namespace App\Http\Requests;

use App\Models\User;
use App\Models\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateAdminUserRequest extends FormRequest
{
    private const ALLOWED_FIELDS = ['role', 'access_status'];

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'role' => ['sometimes', 'string', Rule::in([...User::LEGACY_ROLES, UserRole::RESEARCH_EDITOR])],
            'access_status' => ['sometimes', 'string', Rule::in(User::ACCESS_STATUSES)],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $unknown = array_diff(array_keys($this->json()->all()), self::ALLOWED_FIELDS);

            if ($unknown !== []) {
                $validator->errors()->add('request', 'Unknown fields are not allowed.');
            }

            if (! $this->hasAny(self::ALLOWED_FIELDS)) {
                $validator->errors()->add('request', 'At least one mutable field is required.');
            }
        });
    }
}
