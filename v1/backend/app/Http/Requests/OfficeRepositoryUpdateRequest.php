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
            'category_id' => ['sometimes', 'nullable', 'integer', 'exists:categories,id'],
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
            'authors.*' => ['required', 'string', 'max:255', 'distinct:ignore_case'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function () use ($validator): void {
            $this->rejectUnknownFields($validator, [
                'category_id', 'title', 'abstract', 'keywords', 'publication_year', 'sdg_ids',
                'institute', 'degree_program', 'manuscript_date_label', 'research_stage', 'authors',
            ]);

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
