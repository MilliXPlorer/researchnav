<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;
use JsonException;

class RunSimilarityCheckRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->hasHeader('Content-Type') || ! str_contains(strtolower((string) $this->header('Content-Type')), 'application/json')) {
                $validator->errors()->add('body', 'The request body must be an empty JSON object.');

                return;
            }

            try {
                $body = json_decode($this->getContent(), false, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                $validator->errors()->add('body', 'The request body must be an empty JSON object.');

                return;
            }

            if (! $body instanceof \stdClass || get_object_vars($body) !== []) {
                $validator->errors()->add('body', 'The request body must be an empty JSON object.');
            }
        });
    }
}
