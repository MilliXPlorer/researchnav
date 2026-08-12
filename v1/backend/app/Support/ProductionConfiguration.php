<?php

namespace App\Support;

use App\Services\GoogleClientVerifier;
use LogicException;

class ProductionConfiguration
{
    public static function validate(): void
    {
        if (config('app.env') !== 'production') {
            return;
        }

        $valid = config('app.debug') === false
            && config('session.secure') === true
            && config('mail.default') !== 'log'
            && GoogleClientVerifier::isValidClientId(config('services.google.client_id'));

        $origins = config('researchnav.allowed_origins');
        $valid = $valid && is_array($origins) && $origins !== []
            && collect($origins)->every(static fn (mixed $origin): bool => is_string($origin) && str_starts_with($origin, 'https://'));

        if (! $valid) {
            throw new LogicException('Production security configuration is invalid.');
        }
    }
}
