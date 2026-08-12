<?php

namespace App\Http\Middleware;

use Illuminate\Http\Middleware\TrustProxies;

class TrustConfiguredProxies extends TrustProxies
{
    /** @return array<int, string> */
    protected function proxies(): array
    {
        return config('researchnav.trusted_proxies');
    }
}
