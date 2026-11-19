<?php

namespace App\Services;

class UploadedContentInvalidScopeException extends \RuntimeException
{
    public function __construct(public readonly string $reason = 'chapter_one_not_found')
    {
        parent::__construct('Uploaded manuscript chapter scope is invalid.');
    }
}
