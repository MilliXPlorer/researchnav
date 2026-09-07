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
$weightedSimilarityPolicy = [
    'title_weight' => '0.30',
    'content_weight' => '0.70',
    'moderate_threshold' => '0.40',
    'high_threshold' => '0.70',
    'title_alert_threshold' => '0.90',
];
foreach ($configuredOrigins as $origin) {
    $origins[] = $canonicalOrigin($origin);
}

return [
    'consolidation' => [
        // Disabled until every source relationship has a parity-tested adapter.
        'read_shadow' => (bool) env('RESEARCHNAV_CONSOLIDATION_READ_SHADOW', false),
    ],
    'allowed_origins' => array_values(array_unique($origins)),
    'trusted_proxies' => array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1'))))),
    'bootstrap_admin_email' => env('BOOTSTRAP_ADMIN_EMAIL'),
    'frontend_url' => $canonicalOrigin((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost'))),
    'research_study_import_source' => storage_path('app/private/research_studies/ics'),
    'similarity' => [
        // Policy names and values are versioned application configuration, not
        // deploy-time environment tuning. A version therefore always names its
        // exact decision contract.
        'algorithm_version' => 'title-content-weighted-v1',
        'policies' => ['title-content-weighted-v1' => $weightedSimilarityPolicy],
        ...$weightedSimilarityPolicy,
        // This child receives verified text and IDs only; no database credentials or private-document path is provided.
        'python_binary' => env('SIMILARITY_PYTHON_BINARY', 'python'),
        'cli_path' => app_path('Services/similarity/cli.py'),
        'fasttext_model_path' => env('SIMILARITY_FASTTEXT_MODEL_PATH', ''),
        'timeout_seconds' => (int) env('SIMILARITY_TIMEOUT_SECONDS', 20),
        'maximum_candidates' => (int) env('SIMILARITY_MAXIMUM_CANDIDATES', 250),
        'maximum_input_bytes' => (int) env('SIMILARITY_MAXIMUM_INPUT_BYTES', 268435456),
        'maximum_output_bytes' => (int) env('SIMILARITY_MAXIMUM_OUTPUT_BYTES', 262144),
    ],
    'manuscript_search' => [
        // The worker receives one verified canonical private-disk path by argv.
        'python_binary' => env('MANUSCRIPT_SEARCH_PYTHON_BINARY', 'python'),
        'cli_path' => env('MANUSCRIPT_SEARCH_CLI_PATH', app_path('Services/manuscript_text_cli.py')),
        'timeout_seconds' => (int) env('MANUSCRIPT_SEARCH_TIMEOUT_SECONDS', 30),
        'maximum_input_bytes' => (int) env('MANUSCRIPT_SEARCH_MAXIMUM_INPUT_BYTES', 26214400),
        'maximum_output_bytes' => (int) env('MANUSCRIPT_SEARCH_MAXIMUM_OUTPUT_BYTES', 8388608),
        'maximum_text_characters' => (int) env('MANUSCRIPT_SEARCH_MAXIMUM_TEXT_CHARACTERS', 1000000),
        'extractor_version' => env('MANUSCRIPT_SEARCH_EXTRACTOR_VERSION', 'manuscript-text/1'),
    ],
];
