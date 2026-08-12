<?php

namespace App\Exceptions;

use RuntimeException;

class ApiValidationException extends RuntimeException
{
    /** @param array<string, array<int, string>> $fieldErrors */
    public function __construct(public readonly array $fieldErrors)
    {
        parent::__construct('The request is invalid.');
    }
}
