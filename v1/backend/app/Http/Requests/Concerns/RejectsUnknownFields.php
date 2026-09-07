<?php

namespace App\Http\Requests\Concerns;

use Illuminate\Validation\Validator;

trait RejectsUnknownFields
{
    /** @param list<string> $allowed */
    protected function rejectUnknownFields(Validator $validator, array $allowed): void
    {
        $unknown = array_diff(array_keys($this->all()), $allowed);
        foreach ($unknown as $field) {
            $validator->errors()->add($field, 'This field is not allowed.');
        }
    }
}
