<?php

namespace Tests\Unit;

use App\Services\GoogleClientVerifier;
use RuntimeException;
use Tests\TestCase;

class GoogleClientVerifierTest extends TestCase
{
    public function test_invalid_client_id_fails_closed_without_contacting_google(): void
    {
        config()->set('services.google.client_id', '');

        $this->expectException(RuntimeException::class);
        app(GoogleClientVerifier::class)->verify('not-a-token');
    }

    public function test_verified_claims_must_target_the_configured_client_id(): void
    {
        $this->expectException(RuntimeException::class);

        GoogleClientVerifier::identityFromPayload([
            'aud' => 'other-client.apps.googleusercontent.com',
            'sub' => 'subject',
            'email' => 'user@example.test',
            'email_verified' => true,
        ], '123-client.apps.googleusercontent.com');
    }
}
