<?php

namespace App\Http\Requests;

use App\Models\PdfAnnotation;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StorePdfAnnotationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'kind' => ['required', Rule::in(PdfAnnotation::KINDS)],
            'body' => ['nullable', 'string', 'max:10000', 'required_if:kind,comment'],
            'anchor' => ['required', 'array:schema_version,page_number,exact,prefix,suffix,rects'],
            'anchor.schema_version' => ['required', 'integer', 'in:1'],
            'anchor.page_number' => ['required', 'integer', 'between:1,10000'],
            'anchor.exact' => ['required', 'string', 'max:20000'],
            'anchor.prefix' => ['nullable', 'string', 'max:256'],
            'anchor.suffix' => ['nullable', 'string', 'max:256'],
            'anchor.rects' => ['required', 'array', 'min:1', 'max:100'],
            'anchor.rects.*' => ['required', 'array:x,y,width,height'],
            'anchor.rects.*.x' => ['required', 'numeric', 'between:0,1'],
            'anchor.rects.*.y' => ['required', 'numeric', 'between:0,1'],
            'anchor.rects.*.width' => ['required', 'numeric', 'gt:0', 'max:1'],
            'anchor.rects.*.height' => ['required', 'numeric', 'gt:0', 'max:1'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($this->input('kind') === 'comment' && trim((string) $this->input('body')) === '') {
                $validator->errors()->add('body', 'A comment is required.');
            }
            if (trim((string) $this->input('anchor.exact')) === '') {
                $validator->errors()->add('anchor.exact', 'Select text from the PDF.');
            }
            foreach ((array) $this->input('anchor.rects', []) as $index => $rect) {
                if (! is_array($rect)) {
                    continue;
                }
                $x = (float) ($rect['x'] ?? 0);
                $y = (float) ($rect['y'] ?? 0);
                $width = (float) ($rect['width'] ?? 0);
                $height = (float) ($rect['height'] ?? 0);
                if ($x + $width > 1.000001 || $y + $height > 1.000001) {
                    $validator->errors()->add("anchor.rects.{$index}", 'The highlight must remain within the PDF page.');
                }
            }
        }];
    }
}
