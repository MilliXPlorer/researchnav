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

    private const LIST_PAGE_SIZE = 1000;

    private const INSTITUTES = [
        'Institute of Computer Studies',
        'Institute of Health Sciences',
        'Institute of Business and Financial Management',
        'Institute of Arts and Sciences',
        'Institute of Criminal Justice Education',
        'Institute of Teacher Education',
        'Unclassified',
    ];

    private const INSTITUTE_CODES = [
        'IHS' => 'Institute of Health Sciences',
        'ICS' => 'Institute of Computer Studies',
        'IBFS' => 'Institute of Business and Financial Management',
        'ICJE' => 'Institute of Criminal Justice Education',
        'ITE' => 'Institute of Teacher Education',
        'IAS' => 'Institute of Arts and Sciences',
    ];

    /** @var array{url:string,secret_key:string,storage_bucket:string}|null */
    private ?array $configuration = null;

    /** @return list<array{institute:string,total:int}> */
    public function manuscriptCountsByInstitute(): array
    {
        return collect(array_slice(self::INSTITUTES, 0, 6))
            ->map(function (string $institute): array {
                $total = 0;
                foreach ($this->listFolders($institute) as $year) {
                    $total += count($this->listFolders($institute.'/'.$year));
                }

                return ['institute' => $institute, 'total' => $total];
            })
            ->all();
    }

    /** @return list<array{year:string,title:string}> */
    public function studiesForInstitute(string $code): array
    {
        $institute = $this->instituteForCode($code);
        $studies = [];
        foreach ($this->listFolders($institute) as $year) {
            foreach ($this->listFolders($institute.'/'.$year) as $title) {
                $studies[] = ['year' => $year, 'title' => $title];
            }
        }
        usort($studies, fn (array $left, array $right): int => ($right['year'] <=> $left['year']) ?: strcasecmp($left['title'], $right['title']));

        return $studies;
    }

    /** @return list<array{name:string,path:string,extension:string}> */
    public function filesForStudy(string $code, string $year, string $title): array
    {
        $institute = $this->instituteForCode($code);
        if (preg_match('/\A\d{4}\z/', $year) !== 1 || $title === '' || str_contains($title, '/') || str_contains($title, '\\') || $title === '..') {
            throw new SupabaseStorageException('The manuscript storage path is invalid.');
        }

        return collect($this->listEntries($institute.'/'.$year.'/'.$title))
            ->filter(function (array $entry): bool {
                $name = $entry['name'] ?? null;

                return is_string($name)
                    && $name !== ''
                    && ($entry['id'] ?? null) !== null
                    && preg_match('/[\x00-\x1F\x7F\\\\\/]/', $name) !== 1
                    && $name !== '..';
            })
            ->map(function (array $entry) use ($institute, $year, $title): array {
                $name = $entry['name'];

                return [
                    'name' => $name,
                    'path' => $institute.'/'.$year.'/'.$title.'/'.$name,
                    'extension' => strtolower(pathinfo($name, PATHINFO_EXTENSION)),
                ];
            })
            ->filter(fn (array $file): bool => in_array($file['extension'], ['pdf', 'doc', 'docx'], true))
            ->sortBy(fn (array $file): string => strtolower($file['name']), SORT_NATURAL)
            ->values()
            ->all();
    }

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

    public function downloadTo(string $path, string $destination): void
    {
        $contents = $this->download($path);
        $directory = dirname($destination);
        if (! is_dir($directory) || ! is_writable($directory) || is_link($destination)) {
            throw new SupabaseStorageException('The manuscript could not be retrieved.');
        }

        $written = @file_put_contents($destination, $contents, LOCK_EX);
        if ($written !== strlen($contents)) {
            @unlink($destination);
            throw new SupabaseStorageException('The manuscript could not be retrieved.');
        }
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

    /** @return list<string> */
    private function listFolders(string $prefix): array
    {
        return collect($this->listEntries($prefix))
            ->filter(fn (array $entry): bool => is_string($entry['name'] ?? null) && ($entry['id'] ?? null) === null)
            ->pluck('name')
            ->unique()
            ->values()
            ->all();
    }

    /** @return list<array<string, mixed>> */
    private function listEntries(string $prefix): array
    {
        $results = [];
        for ($offset = 0; $offset < 100_000; $offset += self::LIST_PAGE_SIZE) {
            try {
                $response = $this->http(20)
                    ->withHeaders($this->headers())
                    ->post($this->listUrl(), [
                        'prefix' => $prefix,
                        'limit' => self::LIST_PAGE_SIZE,
                        'offset' => $offset,
                        'sortBy' => ['column' => 'name', 'order' => 'asc'],
                    ]);
            } catch (ConnectionException) {
                throw new SupabaseStorageException('The manuscript storage service is unavailable.');
            }

            if (! $response->successful() || ! is_array($response->json())) {
                Log::warning('Supabase manuscript listing failed.', ['status' => $response->status()]);
                throw new SupabaseStorageException('The manuscript storage service is unavailable.');
            }

            $entries = $response->json();
            foreach ($entries as $entry) {
                if (is_array($entry)) {
                    $results[] = $entry;
                }
            }
            if (count($entries) < self::LIST_PAGE_SIZE) {
                break;
            }
        }

        return $results;
    }

    private function listUrl(): string
    {
        return $this->config()['url'].'/storage/v1/object/list/'.rawurlencode($this->config()['storage_bucket']);
    }

    private function instituteForCode(string $code): string
    {
        $institute = self::INSTITUTE_CODES[strtoupper($code)] ?? null;
        if ($institute === null) {
            throw new SupabaseStorageException('The institute is invalid.');
        }

        return $institute;
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
