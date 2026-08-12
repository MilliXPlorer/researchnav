<?php

namespace App\Http\Requests;

use App\Models\ResearchDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TransitionResearchRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['submission_status' => ['required', Rule::in(ResearchDocument::SUBMISSION_STATUSES)]];
    }
}
