<?php

namespace App\Services;

use RuntimeException;

class AccessRequestException extends RuntimeException
{
    public function __construct(public readonly string $error)
    {
        parent::__construct($error);
    }
}
