<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreRevisionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['document_file_id' => ['nullable', 'integer', 'exists:document_files,id'], 'revision_remarks' => ['required', 'string', 'max:10000']];
    }
}
