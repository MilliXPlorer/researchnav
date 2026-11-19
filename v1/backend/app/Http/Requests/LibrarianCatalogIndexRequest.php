<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class LibrarianCatalogIndexRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:200'],
            'visibility' => ['nullable', 'string', Rule::in(['private', 'registered_only', 'public'])],
            'year' => ['nullable', 'integer', 'min:1900', 'max:'.(now()->year + 1)],
            'sort' => ['nullable', 'string', Rule::in(['title', 'submission_status', 'archive_status', 'visibility', 'publication_year', 'updated_at'])],
            'direction' => ['nullable', 'string', Rule::in(['asc', 'desc'])],
            'page' => ['nullable', 'integer', 'min:1'],
        ];
    }
}
