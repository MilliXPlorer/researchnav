<?php

namespace App\Services;

use App\Contracts\GoogleIdTokenVerifier;
use App\Data\GoogleIdentity;
use Google\Client;
use GuzzleHttp\Client as HttpClient;
use RuntimeException;

class GoogleClientVerifier implements GoogleIdTokenVerifier
{
    public function verify(string $credential): GoogleIdentity
    {
        $clientId = (string) config('services.google.client_id');
        if (! self::isValidClientId($clientId)) {
            throw new RuntimeException('Google client ID is not configured correctly.');
        }

        $client = new Client(['client_id' => $clientId]);
        $caBundle = config('services.google.ca_bundle');
        if (is_string($caBundle) && $caBundle !== '') {
            if (! is_file($caBundle)) {
                throw new RuntimeException('The configured Google CA bundle does not exist.');
            }

            $client->setHttpClient(new HttpClient(['verify' => $caBundle]));
        }
        $payload = $client->verifyIdToken($credential);

        if (! is_array($payload)) {
            throw new RuntimeException('Google ID token could not be verified.');
        }

        return self::identityFromPayload($payload, $clientId);
    }

    public static function isValidClientId(mixed $clientId): bool
    {
        return is_string($clientId)
            && preg_match('/^\d+-[a-z0-9][a-z0-9-]*\.apps\.googleusercontent\.com$/i', $clientId) === 1;
    }

    /** @param array<string, mixed> $payload */
    public static function identityFromPayload(array $payload, string $clientId): GoogleIdentity
    {
        if (($payload['aud'] ?? null) !== $clientId) {
            throw new RuntimeException('Google ID token audience does not match this application.');
        }

        return new GoogleIdentity(
            (string) ($payload['sub'] ?? ''),
            (string) ($payload['email'] ?? ''),
            ($payload['email_verified'] ?? false) === true || ($payload['email_verified'] ?? false) === 'true',
        );
    }
}
