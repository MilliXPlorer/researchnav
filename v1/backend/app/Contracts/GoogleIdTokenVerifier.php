<?php

namespace App\Contracts;

use App\Data\GoogleIdentity;

interface GoogleIdTokenVerifier
{
    public function verify(string $credential): GoogleIdentity;
}
