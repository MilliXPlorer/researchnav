<?php

namespace App\Http\Requests;

use App\Models\ResearchDocument;
use App\Models\User;
use App\Policies\ResearchDocumentPolicy;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateResearchRequest extends FormRequest
{
    use Concerns\RejectsUnknownFields;

    public function authorize(): bool
    {
        $actor = $this->attributes->get('current_user');
        $research = $this->route('researchDocument');

        return $actor instanceof User
            && $research instanceof ResearchDocument
            && (new ResearchDocumentPolicy)->updateMetadata($actor, $research);
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
            'visibility' => ['prohibited'],
            'authors' => ['sometimes', 'array', 'min:1', 'max:50'],
            'authors.*.user_id' => ['nullable', 'uuid', Rule::exists('users', 'id')->whereNull('deleted_at')],
            'authors.*.author_name' => ['required_with:authors', 'string', 'max:255', 'distinct'],
            'authors.*.is_corresponding_author' => ['sometimes', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function () use ($validator): void {
            $this->rejectUnknownFields($validator, ['category_id', 'title', 'abstract', 'keywords', 'publication_year', 'sdg_ids', 'institute', 'degree_program', 'manuscript_date_label', 'research_stage', 'authors']);
            $institute = $this->input('institute', $this->route('researchDocument')?->institute);
            $program = $this->input('degree_program', $this->route('researchDocument')?->degree_program);
            if ($program !== null && ! in_array($program, ResearchDocument::PROGRAMS_BY_INSTITUTE[$institute] ?? [], true)) {
                $validator->errors()->add('degree_program', 'Select a program offered by the chosen institute.');
            }
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
}
