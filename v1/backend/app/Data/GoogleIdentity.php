<?php

namespace App\Data;

readonly class GoogleIdentity
{
    public function __construct(
        public string $subject,
        public string $email,
        public bool $emailVerified,
    ) {}
}
