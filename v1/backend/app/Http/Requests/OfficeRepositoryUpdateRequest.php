<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\RejectsUnknownFields;
use App\Models\ResearchDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class OfficeRepositoryUpdateRequest extends FormRequest
{
    use RejectsUnknownFields;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'expected_updated_at' => ['required', 'date'],
            'title' => ['sometimes', 'filled', 'string', 'max:500'],
            'abstract' => ['sometimes', 'nullable', 'string', 'max:50000'],
            'keywords' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'publication_year' => ['sometimes', 'nullable', 'integer', 'between:1901,2155'],
            'sdg_ids' => ['sometimes', 'array', 'max:17'],
            'sdg_ids.*' => ['integer', 'distinct', 'exists:sdgs,id'],
            'institute' => ['sometimes', 'nullable', Rule::in(ResearchDocument::INSTITUTES)],
            'degree_program' => ['sometimes', 'nullable', 'string', 'max:255'],
            'manuscript_date_label' => ['sometimes', 'nullable', 'string', 'max:50'],
            'research_stage' => ['sometimes', Rule::in(ResearchDocument::RESEARCH_STAGES)],
            'authors' => ['sometimes', 'array', 'min:1', 'max:50'],
            'authors.*' => ['required', 'array'],
            'authors.*.id' => ['sometimes', 'nullable', 'integer'],
            'authors.*.user_id' => ['present', 'nullable', 'uuid'],
            'authors.*.author_name' => ['required', 'string', 'max:255'],
            'authors.*.is_corresponding_author' => ['required', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $authors = $this->input('authors');
        if (! is_array($authors)) {
            return;
        }

        foreach ($authors as $index => $author) {
            if (! is_array($author)) {
                continue;
            }
            if (is_string($author['author_name'] ?? null)) {
                $authors[$index]['author_name'] = preg_replace('/\s+/u', ' ', trim($author['author_name'])) ?? '';
            }
            if (is_string($author['user_id'] ?? null)) {
                $authors[$index]['user_id'] = strtolower(trim($author['user_id']));
            }
        }

        $this->merge(['authors' => $authors]);
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function () use ($validator): void {
            $this->rejectUnknownFields($validator, [
                'expected_updated_at', 'title', 'abstract', 'keywords', 'publication_year', 'sdg_ids',
                'institute', 'degree_program', 'manuscript_date_label', 'research_stage', 'authors',
            ]);

            $authors = $this->input('authors');
            if (is_array($authors)) {
                $names = [];
                $userIds = [];
                $rowIds = [];
                foreach ($authors as $index => $author) {
                    if (! is_array($author)) {
                        continue;
                    }
                    foreach (array_diff(array_keys($author), ['id', 'user_id', 'author_name', 'is_corresponding_author']) as $field) {
                        $validator->errors()->add("authors.{$index}.{$field}", 'This field is not allowed.');
                    }
                    if (is_string($author['author_name'] ?? null)) {
                        $name = mb_strtolower($author['author_name']);
                        if (isset($names[$name])) {
                            $validator->errors()->add("authors.{$index}.author_name", 'The author name must be distinct.');
                        }
                        $names[$name] = true;
                    }
                    if (is_string($author['user_id'] ?? null) && $author['user_id'] !== '') {
                        $userId = mb_strtolower($author['user_id']);
                        if (isset($userIds[$userId])) {
                            $validator->errors()->add("authors.{$index}.user_id", 'The user ID must be distinct.');
                        }
                        $userIds[$userId] = true;
                    }
                    if (($author['id'] ?? null) !== null && $author['id'] !== '') {
                        $rowId = (string) $author['id'];
                        if (isset($rowIds[$rowId])) {
                            $validator->errors()->add("authors.{$index}.id", 'The author row ID must be distinct.');
                        }
                        $rowIds[$rowId] = true;
                    }
                }
            }

            if (! $this->has('institute') && ! $this->has('degree_program')) {
                return;
            }

            $current = ResearchDocument::withTrashed()->find($this->route('researchDocument'));
            if ($current === null) {
                return;
            }

            if ($validator->errors()->has('institute') || $validator->errors()->has('degree_program')) {
                return;
            }

            $institute = $this->has('institute') ? $this->input('institute') : $current->institute;
            $program = $this->has('degree_program') ? $this->input('degree_program') : $current->degree_program;
            if (! is_string($institute) || ! is_string($program)) {
                return;
            }

            if ($program !== null && ! in_array($program, ResearchDocument::PROGRAMS_BY_INSTITUTE[$institute] ?? [], true)) {
                $validator->errors()->add('degree_program', 'Select a program offered by the chosen institute.');
            }
        });
    }
}
