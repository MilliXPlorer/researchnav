<?php

namespace App\Services;

use RuntimeException;

class OfficeRepositoryConflictException extends RuntimeException
{
    public string $error = 'REPOSITORY_RECORD_CONFLICT';
}
