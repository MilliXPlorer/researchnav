<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\RejectsUnknownFields;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ContentUploadSimilarityRequest extends FormRequest
{
    use RejectsUnknownFields;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'mode' => ['bail', 'nullable', 'in:file,folder'],
            'file' => [
                'bail',
                'nullable',
                'file',
                'max:30720',
                'mimes:pdf',
                'extensions:pdf',
            ],
            'files' => ['bail', 'nullable', 'array', 'min:1', 'max:20'],
            'files.*' => ['bail', 'file', 'max:30720', 'mimes:pdf', 'extensions:pdf'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $this->rejectUnknownFields($validator, ['file', 'files', 'mode']);
            $files = $this->file('files', []);
            if (! $this->hasFile('file') && (! is_array($files) || $files === [])) {
                $validator->errors()->add('file', 'Choose one manuscript file or a folder of PDF files.');
            }
            if ($this->hasFile('file') && is_array($files) && $files !== []) {
                $validator->errors()->add('files', 'Choose either one manuscript file or one folder, not both.');
            }
            if (is_array($files) && array_sum(array_map(fn ($file): int => $file?->getSize() ?? 0, $files)) > 100 * 1024 * 1024) {
                $validator->errors()->add('files', 'The selected files may not exceed 100 MiB together.');
            }
            if ($this->input('mode') === 'folder' && $this->hasFile('file')) {
                $validator->errors()->add('file', 'Folder mode accepts only files[].');
            }
        });
    }
}
