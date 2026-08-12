<?php

namespace App\Http\Requests;

use App\Models\FeedbackComment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreFeedbackRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['document_file_id' => ['nullable', 'integer', 'exists:document_files,id'], 'comment' => ['required', 'string', 'max:10000'], 'feedback_type' => ['required', Rule::in(FeedbackComment::FEEDBACK_TYPES)]];
    }
}
