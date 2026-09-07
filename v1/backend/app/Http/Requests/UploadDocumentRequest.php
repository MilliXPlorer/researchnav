<?php

namespace App\Http\Requests;

use App\Models\DocumentFile;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UploadDocumentRequest extends FormRequest
{
    use Concerns\RejectsUnknownFields;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['file' => ['required', 'file', 'max:25600', 'mimetypes:application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 'document_type' => ['required', Rule::in(DocumentFile::TYPES)]];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn () => $this->rejectUnknownFields($validator, ['file', 'document_type']));
    }
}
