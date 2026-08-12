<?php

namespace App\Http\Requests;

use App\Models\DocumentFile;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UploadDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['file' => ['required', 'file', 'max:25600', 'mimetypes:application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 'document_type' => ['required', Rule::in(DocumentFile::TYPES)]];
    }
}
