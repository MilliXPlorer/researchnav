<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SupabaseStorageService
{
    private const SIGNED_URL_SECONDS = 300;

    private const UPLOAD_TIMEOUT_SECONDS = 120;

    private const INSTITUTES = [
        'Institute of Computer Studies',
        'Institute of Health Sciences',
        'Institute of Business and Financial Management',
        'Institute of Arts and Sciences',
        'Institute of Criminal Justice Education',
        'Institute of Teacher Education',
        'Unclassified',
    ];

    /** @var array{url:string,secret_key:string,storage_bucket:string}|null */
    private ?array $configuration = null;

    public function upload(string $path, string $contents, string $mimeType): void
    {
        $this->assertPath($path);
        if ($contents === '') {
            throw new SupabaseStorageException('The manuscript upload is empty.');
        }

        try {
            $response = $this->http(self::UPLOAD_TIMEOUT_SECONDS)
                ->withHeaders($this->headers())
                ->withBody($contents, $mimeType)
                ->send('POST', $this->objectUrl($path), [
                    'headers' => ['x-upsert' => 'false'],
                ]);
        } catch (ConnectionException $exception) {
            Log::warning('Supabase manuscript upload connection failed.', [
                'curl_errno' => $exception->handlerContext()['errno'] ?? null,
            ]);
            throw new SupabaseStorageException('The manuscript storage service is unavailable.');
        }

        if (! $response->successful()) {
            Log::warning('Supabase manuscript upload rejected.', [
                'status' => $response->status(),
                'error' => is_string($response->json('error')) ? $response->json('error') : null,
            ]);
            throw new SupabaseStorageException('The manuscript could not be stored.');
        }
    }

    public function delete(string $path): void
    {
        $this->assertPath($path);

        try {
            $response = $this->http(20)
                ->withHeaders($this->headers())
                ->delete($this->objectUrl($path));
        } catch (ConnectionException) {
            throw new SupabaseStorageException('The manuscript storage service is unavailable.');
        }

        if (! $response->successful() && $response->status() !== 404) {
            throw new SupabaseStorageException('The uploaded manuscript could not be cleaned up.');
        }
    }

    public function download(string $path): string
    {
        $this->assertPath($path);

        try {
            $response = $this->http(60)
                ->withHeaders($this->headers())
                ->get($this->objectUrl($path));
        } catch (ConnectionException) {
            throw new SupabaseStorageException('The manuscript storage service is unavailable.');
        }

        if (! $response->successful()) {
            throw new SupabaseStorageException('The manuscript could not be retrieved.');
        }

        $contents = $response->body();
        $maximumBytes = min(25 * 1024 * 1024, (int) config('researchnav.manuscript_search.maximum_input_bytes'));
        if ($contents === '' || strlen($contents) > $maximumBytes) {
            throw new SupabaseStorageException('The manuscript could not be retrieved.');
        }

        return $contents;
    }

    public function exists(string $path): bool
    {
        $this->assertPath($path);

        try {
            $response = $this->http(10)
                ->withHeaders($this->headers())
                ->head($this->objectUrl($path));
        } catch (ConnectionException) {
            throw new SupabaseStorageException('The manuscript storage service is unavailable.');
        }

        // Supabase Storage currently returns 400 for HEAD on a missing object.
        if (in_array($response->status(), [400, 404], true)) {
            return false;
        }
        if (! $response->successful()) {
            throw new SupabaseStorageException('The manuscript storage location could not be checked.');
        }

        return true;
    }

    public function signedUrl(string $path, int $expiresIn = self::SIGNED_URL_SECONDS): string
    {
        $this->assertPath($path);
        if ($expiresIn < 1 || $expiresIn > self::SIGNED_URL_SECONDS) {
            throw new SupabaseStorageException('The requested access duration is invalid.');
        }

        try {
            $response = $this->http(10)
                ->withHeaders($this->headers())
                ->post($this->signUrl($path), ['expiresIn' => $expiresIn]);
        } catch (ConnectionException) {
            throw new SupabaseStorageException('The manuscript storage service is unavailable.');
        }

        if (! $response->successful() || ! is_string($response->json('signedURL')) || $response->json('signedURL') === '') {
            throw new SupabaseStorageException('The manuscript access link could not be created.');
        }

        $signedUrl = $response->json('signedURL');

        if (str_starts_with($signedUrl, 'http://') || str_starts_with($signedUrl, 'https://')) {
            $signedParts = parse_url($signedUrl);
            $configuredParts = parse_url($this->config()['url']);
            if ($signedParts === false || $configuredParts === false
                || strtolower((string) ($signedParts['scheme'] ?? '')) !== strtolower((string) ($configuredParts['scheme'] ?? ''))
                || strtolower((string) ($signedParts['host'] ?? '')) !== strtolower((string) ($configuredParts['host'] ?? ''))
                || ($signedParts['port'] ?? null) !== ($configuredParts['port'] ?? null)) {
                throw new SupabaseStorageException('The manuscript access link could not be created.');
            }

            return $signedUrl;
        }

        return $this->config()['url'].(str_starts_with($signedUrl, '/storage/v1/')
            ? $signedUrl
            : '/storage/v1/'.ltrim($signedUrl, '/'));
    }

    public function isSupabasePath(string $path): bool
    {
        foreach (self::INSTITUTES as $institute) {
            if (str_starts_with($path, $institute.'/')) {
                return true;
            }
        }

        return false;
    }

    /** @return array<string, string> */
    private function headers(): array
    {
        $configuration = $this->config();

        $headers = [
            'apikey' => $configuration['secret_key'],
        ];

        // New sb_secret keys are opaque API keys, not JWT bearer tokens.
        if (! str_starts_with($configuration['secret_key'], 'sb_secret_')) {
            $headers['Authorization'] = 'Bearer '.$configuration['secret_key'];
        }

        return $headers;
    }

    private function http(int $timeout): PendingRequest
    {
        $request = Http::timeout($timeout);
        $caBundle = config('services.google.ca_bundle');

        return is_string($caBundle) && $caBundle !== '' && is_file($caBundle)
            ? $request->withOptions(['verify' => $caBundle])
            : $request;
    }

    private function objectUrl(string $path): string
    {
        return $this->config()['url'].'/storage/v1/object/'.$this->config()['storage_bucket'].'/'.$this->encodedPath($path);
    }

    private function signUrl(string $path): string
    {
        return $this->config()['url'].'/storage/v1/object/sign/'.$this->config()['storage_bucket'].'/'.$this->encodedPath($path);
    }

    private function encodedPath(string $path): string
    {
        return implode('/', array_map(rawurlencode(...), explode('/', $path)));
    }

    private function assertPath(string $path): void
    {
        if ($path === '' || str_contains($path, "\0") || str_starts_with($path, '/') || str_contains($path, '\\') || in_array('..', explode('/', $path), true)) {
            throw new SupabaseStorageException('The manuscript storage path is invalid.');
        }
    }

    /** @return array{url:string,secret_key:string,storage_bucket:string} */
    private function config(): array
    {
        if ($this->configuration !== null) {
            return $this->configuration;
        }

        $url = rtrim(trim((string) config('supabase.url')), '/');
        $secretKey = trim((string) config('supabase.secret_key'));
        $bucket = trim((string) config('supabase.storage_bucket'));
        $parts = parse_url($url);

        if ($url === '' || $parts === false || ! isset($parts['scheme'], $parts['host']) || strtolower($parts['scheme']) !== 'https' || isset($parts['user'], $parts['pass'], $parts['query'], $parts['fragment']) || $secretKey === '' || preg_match('/\s/', $secretKey) === 1 || preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}\z/', $bucket) !== 1) {
            throw new SupabaseStorageException('Supabase storage is not configured correctly.');
        }

        return $this->configuration = [
            'url' => $url,
            'secret_key' => $secretKey,
            'storage_bucket' => $bucket,
        ];
    }
}
