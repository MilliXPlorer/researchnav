<?php

namespace App\Services;

use JsonException;
use Symfony\Component\Process\Process;

class ManuscriptTextExtractor
{
    public function extract(string $canonicalPath): string
    {
        $maximumInputBytes = min(25 * 1024 * 1024, (int) config('researchnav.manuscript_search.maximum_input_bytes'));
        if (! is_file($canonicalPath) || is_link($canonicalPath) || filesize($canonicalPath) === false || filesize($canonicalPath) > $maximumInputBytes) {
            throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
        }

        $maximumOutputBytes = (int) config('researchnav.manuscript_search.maximum_output_bytes');
        $outputBytes = 0;
        $process = new Process([
            (string) config('researchnav.manuscript_search.python_binary'),
            (string) config('researchnav.manuscript_search.cli_path'),
            $canonicalPath,
        ], null, $this->workerEnvironment(), null, (float) config('researchnav.manuscript_search.timeout_seconds'));

        try {
            $process->run(function (string $type, string $buffer) use (&$outputBytes, $maximumOutputBytes): void {
                $outputBytes += strlen($buffer);
                if ($outputBytes > $maximumOutputBytes) {
                    throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
                }
            });
        } catch (ManuscriptTextExtractionException $exception) {
            $process->stop();

            throw $exception;
        } catch (\Throwable) {
            $process->stop();

            throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
        }

        if (! $process->isSuccessful() || $process->getErrorOutput() !== '') {
            throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
        }

        return $this->validateOutput($process->getOutput(), $maximumOutputBytes);
    }

    private function validateOutput(string $output, int $maximumOutputBytes): string
    {
        if ($output === '' || strlen($output) > $maximumOutputBytes) {
            throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
        }

        try {
            $decoded = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
        }

        if (! is_array($decoded) || array_keys($decoded) !== ['status', 'text'] || $decoded['status'] !== 'ready' || ! is_string($decoded['text'])) {
            throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
        }

        $text = preg_replace('/\s+/u', ' ', trim($decoded['text']));
        if ($text === null || $text !== $decoded['text'] || str_contains($text, "\0") || mb_strlen($text) > (int) config('researchnav.manuscript_search.maximum_text_characters')) {
            throw new ManuscriptTextExtractionException('Manuscript extraction failed.');
        }

        return $text;
    }

    /** @return array<string, string|false> */
    private function workerEnvironment(): array
    {
        $inherited = array_merge(is_array(getenv()) ? getenv() : [], $_ENV, $_SERVER);
        $environment = array_fill_keys(array_keys($inherited), false);
        foreach (['PATH', 'PATHEXT', 'SystemRoot', 'ComSpec'] as $name) {
            foreach ($inherited as $key => $value) {
                if (strcasecmp((string) $key, $name) === 0 && is_scalar($value)) {
                    $environment[$name] = (string) $value;
                    break;
                }
            }
        }
        $environment['PYTHONIOENCODING'] = 'utf-8';
        $environment['PYTHONUTF8'] = '1';
        $environment['PYTHONDONTWRITEBYTECODE'] = '1';

        return $environment;
    }
}
