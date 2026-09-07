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
            && (new ResearchDocumentPolicy)->update($actor, $research);
    }

    public function rules(): array
    {
        return [
            'category_id' => ['sometimes', 'nullable', 'integer', 'exists:categories,id'],
            'title' => ['sometimes', 'string', 'max:500'],
            'abstract' => ['sometimes', 'nullable', 'string', 'max:50000'],
            'keywords' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'publication_year' => ['sometimes', 'nullable', 'integer', 'between:1901,2155'],
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
            $this->rejectUnknownFields($validator, ['category_id', 'title', 'abstract', 'keywords', 'publication_year', 'research_stage', 'authors']);
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
