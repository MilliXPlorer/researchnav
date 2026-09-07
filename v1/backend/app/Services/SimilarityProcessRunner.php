<?php

namespace App\Services;

use App\Contracts\SimilarityProcess;
use App\Models\ResearchDocument;
use Illuminate\Support\Collection;
use JsonException;
use Symfony\Component\Process\Process;

class SimilarityProcessRunner implements SimilarityProcess
{
    public function __construct(
        private readonly ?ManuscriptSimilarityContentService $content = null,
        private readonly ?SimilarityScorePolicy $policy = null,
    ) {}

    /**
     * @param  Collection<int, ResearchDocument>  $candidates
     * @return array<int, array<string, mixed>>
     */
    public function run(ResearchDocument $source, Collection $candidates): array
    {
        $content = ($this->content ?? app(ManuscriptSimilarityContentService::class))->contentFor($source, $candidates);
        $decoded = $this->execute([
            'source' => $this->record($source, $content['source']['text']),
            'candidates' => $candidates->map(
                fn (ResearchDocument $candidate): array => $this->record(
                    $candidate,
                    $content['candidates'][(int) $candidate->id]['text'] ?? null,
                ),
            )->all(),
        ]);

        $results = collect($this->validateOutput($decoded, $candidates))
            ->map(function (array $result) use ($content): array {
                $candidateContent = $content['candidates'][(int) $result['matched_research_id']];
                $contentScore = $content['source']['text'] !== null && $candidateContent !== null
                    ? $result['content_similarity_score']
                    : null;
                $calculated = ($this->policy ?? app(SimilarityScorePolicy::class))->evaluate(
                    $result['title_similarity_score'], $contentScore,
                );

                return [
                    ...$result,
                    'content_similarity_score' => $contentScore,
                    // No FastText score means no worker-supplied contextual
                    // text is trusted; retain only the stable public copy.
                    'contextual_analysis' => $result['fasttext_score'] === null
                        ? 'FastText supporting context unavailable.'
                        : $result['contextual_analysis'],
                ] + $calculated + [
                    'score_status' => $calculated['overall_similarity_score'] === null ? 'content_unavailable' : 'scored',
                    'source_content_sha256' => $content['source']['sha256'] ?? null,
                    'source_input_fingerprint' => $content['source']['fingerprint'] ?? null,
                    'matched_content_sha256' => $candidateContent['sha256'] ?? null,
                ];
            });

        return $results
            ->sort(fn (array $left, array $right): int => $this->compareRankedResults($left, $right))
            ->values()
            ->all();
    }

    /**
     * Run the sessionless public-query protocol. FastText support is optional
     * for this protocol and a missing model is represented by null output.
     *
     * @param  Collection<int, ResearchDocument>  $candidates
     * @return array<int, array<string, mixed>>
     */
    public function runQuery(string $query, Collection $candidates): array
    {
        $decoded = $this->execute([
            'query' => $query,
            'candidates' => $candidates->map(fn (ResearchDocument $candidate): array => $this->queryRecord($candidate))->values()->all(),
        ]);

        $policy = $this->policy ?? app(SimilarityScorePolicy::class);

        return collect($this->validateQueryOutput($decoded, $candidates))
            ->map(function (array $result) use ($policy): array {
                $calculated = $policy->evaluate($result['title_similarity_score'], $result['content_similarity_score']);

                return $result + $calculated + [
                    'score_status' => $calculated['overall_similarity_score'] === null ? 'content_unavailable' : 'scored',
                ];
            })
            ->sort(fn (array $left, array $right): int => $this->compareRankedResults($left, $right))
            ->values()
            ->all();
    }

    /** @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function execute(array $payload): array
    {
        $input = $this->encode($payload);
        $maximumOutputBytes = (int) config('researchnav.similarity.maximum_output_bytes');
        $outputBytes = 0;
        $process = new Process(
            [
                (string) config('researchnav.similarity.python_binary'),
                (string) config('researchnav.similarity.cli_path'),
            ],
            null,
            $this->workerEnvironment(),
            $input,
            (float) config('researchnav.similarity.timeout_seconds'),
        );

        try {
            $process->run(function (string $type, string $buffer) use (&$outputBytes, $maximumOutputBytes): void {
                $outputBytes += strlen($buffer);
                if ($outputBytes > $maximumOutputBytes) {
                    throw new SimilarityProcessException('Similarity worker exceeded its output limit.');
                }
            });
        } catch (SimilarityProcessException $exception) {
            $process->stop();

            throw $exception;
        } catch (\Throwable $exception) {
            $process->stop();

            throw new SimilarityProcessException('Similarity worker failed to execute.', previous: $exception);
        }

        $decoded = $this->decode($process->getOutput());
        if (! $process->isSuccessful()) {
            throw new SimilarityProcessException('Similarity worker returned an unsuccessful status.');
        }

        return $decoded;
    }

    /** @return array{id: int, title: string}|array{id: int, title: string, content: string} */
    private function record(ResearchDocument $research, ?string $content = null): array
    {
        $record = ['id' => $research->id, 'title' => $research->title];

        return $content === null ? $record : $record + ['content' => $content];
    }

    /** @return array{id: int, title: string}|array{id: int, title: string, content: string} */
    private function queryRecord(ResearchDocument $research): array
    {
        $projection = $research->relationLoaded('manuscriptSearchDocument')
            ? $research->getRelation('manuscriptSearchDocument')
            : null;
        $content = ($this->content ?? app(ManuscriptSimilarityContentService::class))
            ->isTrustedReadyProjection($projection)
                ? $projection->body_text
                : null;

        return $this->record($research, $content);
    }

    /** @param array<string, mixed> $value */
    private function encode(array $value): string
    {
        try {
            $encoded = json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        } catch (JsonException $exception) {
            throw new SimilarityProcessException('Similarity input could not be encoded.', previous: $exception);
        }

        if (strlen($encoded) > (int) config('researchnav.similarity.maximum_input_bytes')) {
            throw new SimilarityProcessException('Similarity input exceeded its limit.');
        }

        return $encoded;
    }

    /** @return array<string, mixed> */
    private function decode(string $output): array
    {
        if ($output === '' || strlen($output) > (int) config('researchnav.similarity.maximum_output_bytes')) {
            throw new SimilarityProcessException('Similarity worker returned invalid output.');
        }

        try {
            $decoded = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new SimilarityProcessException('Similarity worker returned invalid JSON.', previous: $exception);
        }

        if (! is_array($decoded)) {
            throw new SimilarityProcessException('Similarity worker returned an invalid response.');
        }

        return $decoded;
    }

    /**
     * @param  array<string, mixed>  $output
     * @param  Collection<int, ResearchDocument>  $candidates
     * @return array<int, array<string, mixed>>
     */
    private function validateOutput(array $output, Collection $candidates): array
    {
        if (array_keys($output) !== ['results'] || ! is_array($output['results'])) {
            throw new SimilarityProcessException('Similarity worker response schema is invalid.');
        }

        $candidateIds = $candidates->pluck('id')->map(fn ($id): int => (int) $id)->all();
        if (count($output['results']) !== count($candidateIds)) {
            throw new SimilarityProcessException('Similarity worker did not return every candidate.');
        }

        $validated = [];
        foreach ($output['results'] as $result) {
            if (! is_array($result) || array_keys($result) !== [
                'matched_research_id', 'title_similarity_score', 'content_similarity_score',
                'fasttext_score', 'matched_terms', 'contextual_analysis',
            ]) {
                throw new SimilarityProcessException('Similarity worker result schema is invalid.');
            }
            if (! is_int($result['matched_research_id']) || ! in_array($result['matched_research_id'], $candidateIds, true)
                || isset($validated[$result['matched_research_id']])) {
                throw new SimilarityProcessException('Similarity worker returned an invalid candidate.');
            }
            if (! $this->validScore($result['title_similarity_score'])
                || ($result['fasttext_score'] !== null && ! $this->validScore($result['fasttext_score']))) {
                throw new SimilarityProcessException('Similarity worker returned an invalid score.');
            }
            if (($result['content_similarity_score'] !== null && ! $this->validScore($result['content_similarity_score']))
                || ! is_array($result['matched_terms']) || ! is_string($result['contextual_analysis'])
                || strlen($result['contextual_analysis']) > 1000) {
                throw new SimilarityProcessException('Similarity worker returned inconsistent document analysis.');
            }
            foreach ($result['matched_terms'] as $term) {
                if (! is_string($term) || strlen($term) > 100) {
                    throw new SimilarityProcessException('Similarity worker returned invalid matched terms.');
                }
            }
            $validated[$result['matched_research_id']] = $result;
        }

        return array_values($validated);
    }

    /**
     * @param  array<string, mixed>  $output
     * @param  Collection<int, ResearchDocument>  $candidates
     * @return array<int, array<string, mixed>>
     */
    private function validateQueryOutput(array $output, Collection $candidates): array
    {
        if (array_keys($output) !== ['results'] || ! is_array($output['results'])) {
            throw new SimilarityProcessException('Similarity worker response schema is invalid.');
        }

        $candidateIds = $candidates->pluck('id')->map(fn ($id): int => (int) $id)->all();
        if (count($output['results']) !== count($candidateIds)) {
            throw new SimilarityProcessException('Similarity worker did not return every candidate.');
        }

        $validated = [];
        foreach ($output['results'] as $result) {
            if (! is_array($result) || array_keys($result) !== [
                'matched_research_id', 'title_similarity_score', 'content_similarity_score',
                'matched_terms', 'fasttext_support_score',
            ]) {
                throw new SimilarityProcessException('Similarity worker result schema is invalid.');
            }
            if (! is_int($result['matched_research_id']) || ! in_array($result['matched_research_id'], $candidateIds, true)
                || isset($validated[$result['matched_research_id']])) {
                throw new SimilarityProcessException('Similarity worker returned an invalid candidate.');
            }
            if (! $this->validScore($result['title_similarity_score'])
                || ($result['content_similarity_score'] !== null && ! $this->validScore($result['content_similarity_score']))) {
                throw new SimilarityProcessException('Similarity worker returned an invalid query score.');
            }
            if (
                ($result['fasttext_support_score'] !== null && ! $this->validScore($result['fasttext_support_score']))
                || ! is_array($result['matched_terms'])) {
                throw new SimilarityProcessException('Similarity worker returned an invalid query score.');
            }
            foreach ($result['matched_terms'] as $term) {
                if (! is_string($term) || strlen($term) > 100) {
                    throw new SimilarityProcessException('Similarity worker returned invalid matched terms.');
                }
            }
            $validated[$result['matched_research_id']] = $result;
        }

        return array_values($validated);
    }

    private function validScore(mixed $value): bool
    {
        return is_string($value) && preg_match('/\A(?:0\.\d{12}|1\.000000000000)\z/', $value) === 1;
    }

    /**
     * Official weighted overall scores rank first. Unavailable overalls rank
     * after them; title score resolves both unavailable rows and equal-overall
     * rows, followed by the stable candidate identifier.
     *
     * @param  array<string, mixed>  $left
     * @param  array<string, mixed>  $right
     */
    private function compareRankedResults(array $left, array $right): int
    {
        $leftOverall = $left['overall_similarity_score'];
        $rightOverall = $right['overall_similarity_score'];
        if ($leftOverall === null || $rightOverall === null) {
            if ($leftOverall !== $rightOverall) {
                return $leftOverall === null ? 1 : -1;
            }
        } elseif (($comparison = strcmp((string) $rightOverall, (string) $leftOverall)) !== 0) {
            return $comparison;
        }

        return strcmp((string) $right['title_similarity_score'], (string) $left['title_similarity_score'])
            ?: ((int) $left['matched_research_id'] <=> (int) $right['matched_research_id']);
    }

    /**
     * Pass only OS runtime variables needed to launch Python plus the model path.
     * All inherited keys are explicitly disabled because Symfony otherwise merges
     * the parent environment, which could disclose Laravel credentials to the worker.
     *
     * @return array<string, string|false>
     */
    private function workerEnvironment(): array
    {
        $inherited = array_merge(
            is_array(getenv()) ? getenv() : [],
            $_ENV,
            $_SERVER,
        );
        $environment = array_fill_keys(array_keys($inherited), false);

        // These are process-launch/runtime values, not application configuration.
        foreach (['PATH', 'PATHEXT', 'SystemRoot', 'ComSpec'] as $name) {
            foreach ($inherited as $key => $value) {
                if (strcasecmp((string) $key, $name) === 0 && is_scalar($value)) {
                    $environment[$name] = (string) $value;
                    break;
                }
            }
        }

        $environment['SIMILARITY_FASTTEXT_MODEL_PATH'] = (string) config('researchnav.similarity.fasttext_model_path');
        $environment['SIMILARITY_MAXIMUM_INPUT_BYTES'] = (string) config('researchnav.similarity.maximum_input_bytes');
        $environment['SIMILARITY_MAXIMUM_CONTENT_CHARACTERS'] = (string) config('researchnav.manuscript_search.maximum_text_characters');

        return $environment;
    }
}
