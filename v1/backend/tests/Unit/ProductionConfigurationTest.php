<?php

namespace Tests\Unit;

use App\Support\ProductionConfiguration;
use LogicException;
use Tests\TestCase;

class ProductionConfigurationTest extends TestCase
{
    public function test_production_rejects_an_empty_google_client_id(): void
    {
        config()->set('app.env', 'production');
        config()->set('app.debug', false);
        config()->set('session.secure', true);
        config()->set('mail.default', 'smtp');
        config()->set('researchnav.allowed_origins', ['https://app.example.test']);
        config()->set('services.google.client_id', '');

        $this->expectException(LogicException::class);
        ProductionConfiguration::validate();
    }

    public function test_production_rejects_http_origins(): void
    {
        config()->set('app.env', 'production');
        config()->set('app.debug', false);
        config()->set('session.secure', true);
        config()->set('mail.default', 'smtp');
        config()->set('researchnav.allowed_origins', ['http://app.example.test']);
        config()->set('services.google.client_id', '123-client.apps.googleusercontent.com');

        $this->expectException(LogicException::class);
        ProductionConfiguration::validate();
    }
}
