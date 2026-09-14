<?php

$payload = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$secretWasPassed = getenv('TEST_SECRET') !== false;
if (array_key_exists('query', $payload)) {
    $score = $secretWasPassed ? '1.000000000000' : '0.000000000000';
    echo json_encode(['results' => array_map(static fn (array $candidate): array => [
        'matched_research_id' => $candidate['id'],
        'title_similarity_score' => $score,
        'content_similarity_score' => $score,
        'matched_terms' => [],
        'fasttext_support_score' => null,
    ], $payload['candidates'])], JSON_THROW_ON_ERROR);

    exit(0);
}

$score = str_starts_with($payload['source']['title'], 'Malformed worker output') ? '1.000000000001' : '0.500000000000';

echo json_encode(['results' => array_map(static fn (array $candidate): array => [
    'matched_research_id' => $candidate['id'],
    'title_similarity_score' => $score,
    'content_similarity_score' => $score,
    'fasttext_score' => '0.900000000000',
    'matched_terms' => ['candidate'],
    'contextual_analysis' => $secretWasPassed ? 'worker secret present' : 'worker secret absent',
], $payload['candidates'])], JSON_THROW_ON_ERROR);
