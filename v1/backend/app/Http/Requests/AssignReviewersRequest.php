<?php

namespace App\Http\Requests;

use App\Models\ReviewAssignment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AssignReviewersRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'reviewers' => ['required', 'array', 'max:20'],
            'reviewers.*.reviewer_id' => ['required', 'uuid', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'reviewers.*.review_role' => ['required', Rule::in(ReviewAssignment::ROLES)],
        ];
    }
}
