<?php

namespace App\Http\Requests;

use App\Models\ResearchDocument;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreResearchRequest extends FormRequest
{
    use Concerns\RejectsUnknownFields;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'institute' => ['nullable', Rule::in(ResearchDocument::INSTITUTES)],
            'degree_program' => ['nullable', 'string', 'max:255'],
            'title' => ['required', 'string', 'max:500'],
            'abstract' => ['nullable', 'string', 'max:50000'],
            'keywords' => ['nullable', 'string', 'max:5000'],
            'publication_year' => ['nullable', 'integer', 'between:1901,2155'],
            'research_stage' => ['required', Rule::in(ResearchDocument::RESEARCH_STAGES)],
            'visibility' => ['prohibited'],
            'authors' => ['required', 'array', 'min:1', 'max:50'],
            'authors.*.user_id' => ['nullable', 'uuid', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'authors.*.author_name' => ['required', 'string', 'max:255', 'distinct'],
            'authors.*.is_corresponding_author' => ['sometimes', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function () use ($validator): void {
            $this->rejectUnknownFields($validator, ['category_id', 'institute', 'degree_program', 'title', 'abstract', 'keywords', 'publication_year', 'research_stage', 'authors']);
            $this->validateProgram($validator);
            foreach ((array) $this->input('authors', []) as $index => $author) {
                if (! is_array($author)) {
                    continue;
                }
                foreach (array_diff(array_keys($author), ['user_id', 'author_name', 'is_corresponding_author']) as $field) {
                    $validator->errors()->add("authors.{$index}.{$field}", 'This field is not allowed.');
                }
            }
        });
    }

    private function validateProgram(Validator $validator): void
    {
        $institute = $this->input('institute');
        $program = $this->input('degree_program');
        if ($program !== null && ! in_array($program, ResearchDocument::PROGRAMS_BY_INSTITUTE[$institute] ?? [], true)) {
            $validator->errors()->add('degree_program', 'Select a program offered by the chosen institute.');
        }
    }
}
