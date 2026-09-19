<?php

namespace App\Http\Requests;

use App\Models\User;
use App\Models\UserRole;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AdminUserIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:200'],
            'role' => ['nullable', 'string', Rule::in([...User::LEGACY_ROLES, UserRole::RESEARCH_EDITOR])],
            'access_status' => ['nullable', 'string', Rule::in(User::ACCESS_STATUSES)],
            'sort' => ['nullable', 'string', Rule::in([
                'email',
                'last_name',
                'role',
                'access_status',
                'created_at',
                'last_login_at',
            ])],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50, 100])],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
