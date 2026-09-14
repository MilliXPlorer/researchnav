<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateProfileRequest extends FormRequest
{
    private const MUTABLE_FIELDS = [
        'first_name',
        'middle_name',
        'last_name',
    ];

    private const IMMUTABLE_FIELDS = [
        'email',
        'role',
        'access_status',
        'account_status',
        'is_admin',
        'student_employee_id',
    ];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];
        foreach (self::MUTABLE_FIELDS as $field) {
            if (! $this->exists($field)) {
                continue;
            }

            $value = $this->input($field);
            $normalized[$field] = is_string($value) && trim($value) === '' ? null : (is_string($value) ? trim($value) : $value);
        }

        $this->merge($normalized);
    }

    public function rules(): array
    {
        $nameRules = ['sometimes', 'nullable', 'string', 'max:100', 'not_regex:/[\x00-\x1F\x7F]/u'];

        return [
            'first_name' => $nameRules,
            'middle_name' => $nameRules,
            'last_name' => $nameRules,
            'student_employee_id' => ['prohibited'],
            'email' => ['prohibited'],
            'role' => ['prohibited'],
            'access_status' => ['prohibited'],
            'account_status' => ['prohibited'],
            'is_admin' => ['prohibited'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            $keys = array_keys($this->all());
            $known = [...self::MUTABLE_FIELDS, ...self::IMMUTABLE_FIELDS];
            if (array_diff($keys, $known) !== []) {
                $validator->errors()->add('request', 'Unknown fields are not allowed.');
            }
            if (array_intersect($keys, self::MUTABLE_FIELDS) === []) {
                $validator->errors()->add('request', 'At least one editable profile field is required.');
            }
        }];
    }
}
