<?php

/** @return string */
$canonicalOrigin = static function (string $url): string {
    $url = trim($url);
    $parts = parse_url($url);

    if ($url === '' || $parts === false || ! isset($parts['scheme'], $parts['host'])
        || isset($parts['user'], $parts['pass'])
        || ! in_array(strtolower($parts['scheme']), ['http', 'https'], true)
        || (isset($parts['port']) && ($parts['port'] < 1 || $parts['port'] > 65535))) {
        throw new InvalidArgumentException('APP_URL and APP_ORIGINS must contain valid HTTP(S) origins.');
    }

    $scheme = strtolower($parts['scheme']);
    $host = strtolower($parts['host']);
    $port = $parts['port'] ?? null;
    $defaultPort = ($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443);

    return $scheme.'://'.$host.($port !== null && ! $defaultPort ? ':'.$port : '');
};

$configuredOrigins = array_filter(array_map('trim', explode(',', (string) env('APP_ORIGINS', ''))));
$origins = [$canonicalOrigin((string) env('APP_URL', 'http://localhost'))];
foreach ($configuredOrigins as $origin) {
    $origins[] = $canonicalOrigin($origin);
}

return [
    'allowed_origins' => array_values(array_unique($origins)),
    'trusted_proxies' => array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1'))))),
    'bootstrap_admin_email' => env('BOOTSTRAP_ADMIN_EMAIL'),
    'frontend_url' => $canonicalOrigin((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost'))),
    'research_study_import_source' => storage_path('app/private/research_studies/ics'),
];
