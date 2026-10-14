<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;
use JsonException;

class PublicRepositorySimilarityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'q' => ['required', 'string', 'min:2', 'max:200'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'year_from' => ['sometimes', 'integer', 'between:1901,2155'],
            'year_to' => ['sometimes', 'integer', 'between:1901,2155'],
            'category' => ['sometimes', 'string', 'max:180'],
            'institute' => ['sometimes', 'string', 'max:255'],
            'sdg_ids' => ['sometimes', 'array', 'max:17'],
            'sdg_ids.*' => ['integer', 'distinct', 'between:1,17'],
            'sort' => ['sometimes', 'string', 'in:relevance,newest,oldest'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->hasHeader('Content-Type') || ! str_contains(strtolower((string) $this->header('Content-Type')), 'application/json')) {
                $validator->errors()->add('body', 'The request body must be a valid similarity search object.');

                return;
            }

            try {
                $body = json_decode($this->getContent(), false, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                $validator->errors()->add('body', 'The request body must be a valid similarity search object.');

                return;
            }

            $allowed = ['q', 'page', 'year_from', 'year_to', 'category', 'institute', 'sdg_ids', 'sort'];
            if (! $body instanceof \stdClass || array_diff(array_keys(get_object_vars($body)), $allowed) !== []) {
                $validator->errors()->add('body', 'The request body contains unsupported fields.');
            }
        });
    }
}
