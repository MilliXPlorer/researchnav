<?php

$payload = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$scopeTexts = $payload['scope_texts'] ?? null;
if (is_array($scopeTexts)) {
    $results = [];
    foreach ($scopeTexts as $scope) {
        $text = $scope['text'] ?? null;
        if (! is_string($text)) {
            echo json_encode(['error' => ['code' => 'INVALID_INPUT']], JSON_THROW_ON_ERROR);
            exit(2);
        }
        preg_match_all('/(?im)^\s*(?:chapter|chpter|kabanata|tsapter)\s+(?<number>10|[1-9]|one|uno|two|three|four|five|six|seven|eight|nine|ten|i{1,3}|iv|v|vi{0,3}|ix|x)\b/', $text, $matches);
        $numbers = array_map(static fn (string $value): int => match (strtoupper($value)) {
            'ONE', 'UNO', 'I' => 1, 'TWO', 'II' => 2, 'THREE', 'III' => 3,
            'FOUR', 'IV' => 4, 'FIVE', 'V' => 5, 'SIX', 'VI' => 6,
            'SEVEN', 'VII' => 7, 'EIGHT', 'VIII' => 8, 'NINE', 'IX' => 9,
            'TEN', 'X' => 10, default => (int) $value,
        }, $matches['number'] ?? []);
        if ($numbers === []) {
            $results[] = ['status' => 'supporting', 'chapters' => []];

            continue;
        }
        foreach (array_slice($numbers, 1) as $position => $number) {
            if ($number <= $numbers[$position]) {
                echo json_encode(['error' => ['code' => 'CHAPTER_ORDER_INVALID']], JSON_THROW_ON_ERROR);
                exit(2);
            }
        }
        $lastHeading = end($matches[0]);
        if (is_string($lastHeading) && trim(substr($text, (int) strrpos($text, $lastHeading) + strlen($lastHeading)), " \t\r\n:.-") === '') {
            echo json_encode(['error' => ['code' => 'CHAPTER_SCOPE_EMPTY']], JSON_THROW_ON_ERROR);
            exit(2);
        }
        $results[] = ['status' => 'valid', 'chapters' => array_values(array_unique($numbers))];
    }
    echo json_encode(['results' => $results], JSON_THROW_ON_ERROR);
    exit(0);
}
$scopeText = $payload['scope_text'] ?? null;
if (is_string($scopeText)) {
    preg_match_all('/(?im)^\s*(?:chapter|chpter|kabanata|tsapter)\s+(?<number>10|[1-9]|one|uno|two|three|four|five|six|seven|eight|nine|ten|i{1,3}|iv|v|vi{0,3}|ix|x)\b/', $scopeText, $matches);
    $numbers = array_map(static fn (string $value): int => match (strtoupper($value)) {
        'ONE', 'UNO', 'I' => 1, 'TWO', 'II' => 2, 'THREE', 'III' => 3,
        'FOUR', 'IV' => 4, 'FIVE', 'V' => 5, 'SIX', 'VI' => 6,
        'SEVEN', 'VII' => 7, 'EIGHT', 'VIII' => 8, 'NINE', 'IX' => 9,
        'TEN', 'X' => 10,
        default => (int) $value,
    }, $matches['number'] ?? []);
    if ($numbers === []) {
        echo json_encode(['error' => ['code' => 'CHAPTER_ONE_NOT_FOUND']], JSON_THROW_ON_ERROR);
        exit(2);
    }
    echo json_encode([
        'status' => 'valid',
        'chapters' => array_values(array_unique($numbers)),
        'scope_characters' => strlen($scopeText),
    ], JSON_THROW_ON_ERROR);
    exit(0);
}
$secretWasPassed = getenv('TEST_SECRET') !== false;
if (array_key_exists('query', $payload) || array_key_exists('uploaded_content', $payload)) {
    if (str_contains((string) ($payload['uploaded_content'] ?? ''), 'WORKER_CAPACITY')) {
        echo json_encode(['error' => ['code' => 'CAPACITY_EXCEEDED']], JSON_THROW_ON_ERROR);

        exit(3);
    }
    $score = $secretWasPassed ? '1.000000000000' : '0.000000000000';
    echo json_encode(['results' => array_map(static fn (array $candidate): array => [
        'matched_research_id' => $candidate['id'],
        'title_similarity_score' => $score,
        'content_similarity_score' => $score,
        'matched_terms' => [],
        'fasttext_support_score' => null,
        ...(array_key_exists('uploaded_content', $payload) ? ['exact_content_match' => false] : []),
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
