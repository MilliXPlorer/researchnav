<?php

namespace App\Services;

final class GroupedManuscriptArchive
{
    public function __construct(
        public readonly string $path,
        public readonly string $downloadName,
    ) {}

    public function cleanup(): void
    {
        if (is_file($this->path)) {
            @unlink($this->path);
        }
    }
}
