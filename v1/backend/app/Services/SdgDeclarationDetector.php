<?php

namespace App\Services;

class SdgDeclarationDetector
{
    private const MARKER_PATTERN = '/(?<![\p{L}\p{Nd}])(?:Sustainable Development Goals?|SDGs?)(?![\p{L}\p{Nd}])/iu';

    /**
     * Return the explicit SDG declarations in a body of persisted manuscript text.
     *
     * @return list<int>
     */
    public function detect(string $bodyText): array
    {
        $detections = [];
        $offset = 0;

        while (preg_match(self::MARKER_PATTERN, $bodyText, $match, PREG_OFFSET_CAPTURE, $offset) === 1) {
            $marker = $match[0][0];
            $markerOffset = $match[0][1];
            $this->parseDeclaration($bodyText, $markerOffset + strlen($marker), $detections);
            $offset = $markerOffset + strlen($marker);
        }

        $detections = array_values(array_unique($detections));
        sort($detections, SORT_NUMERIC);

        return $detections;
    }

    /** @param list<int> $detections */
    private function parseDeclaration(string $bodyText, int $offset, array &$detections): void
    {
        $numberOffset = $this->firstNumberOffset($bodyText, $offset);
        if ($numberOffset === null) {
            return;
        }

        while (($token = $this->numberTokenAt($bodyText, $numberOffset)) !== null) {
            if ($token['number'] !== null) {
                $detections[] = $token['number'];
            }

            $numberOffset = $this->separatorEnd($bodyText, $token['end']);
            if ($numberOffset === null) {
                return;
            }
        }
    }

    private function firstNumberOffset(string $bodyText, int $offset): ?int
    {
        if ($this->matchesAt('/\G#/u', $bodyText, $offset, $match)) {
            return $this->horizontalWhitespaceEnd($bodyText, $offset + strlen($match[0]));
        }

        $afterWhitespace = $this->horizontalWhitespaceEnd($bodyText, $offset);
        if ($afterWhitespace === $offset) {
            return null;
        }

        if ($this->matchesAt('/\G(?:Nos?\.?)/iu', $bodyText, $afterWhitespace, $match)) {
            return $this->horizontalWhitespaceEnd($bodyText, $afterWhitespace + strlen($match[0]));
        }

        if ($this->matchesAt('/\G#/u', $bodyText, $afterWhitespace, $match)) {
            return $this->horizontalWhitespaceEnd($bodyText, $afterWhitespace + strlen($match[0]));
        }

        return $afterWhitespace;
    }

    /** @return array{number: ?int, end: int}|null */
    private function numberTokenAt(string $bodyText, int $offset): ?array
    {
        if (! $this->matchesAt('/\G[0-9]+/u', $bodyText, $offset, $match)) {
            return null;
        }

        $digits = $match[0];
        $end = $offset + strlen($digits);
        $invalid = str_starts_with($digits, '0') || (int) $digits < 1 || (int) $digits > 17;
        $remaining = substr($bodyText, $end);

        if (preg_match('/\A[\p{L}\p{Nd}]+/u', $remaining, $malformed) === 1
            || preg_match('/\A(?:\.[0-9]+)+/u', $remaining, $malformed) === 1
            || preg_match('/\A[+-]/u', $remaining, $malformed) === 1
            || preg_match('/\A\h*[-\x{2013}\x{2014}]\h*[0-9]+/u', $remaining, $malformed) === 1
            || preg_match('/\A\h+to\h+[0-9]+/iu', $remaining, $malformed) === 1) {
            $invalid = true;
            $end += strlen($malformed[0]);
        }

        return ['number' => $invalid ? null : (int) $digits, 'end' => $end];
    }

    private function separatorEnd(string $bodyText, int $offset): ?int
    {
        if ($this->matchesAt('/\G\h*[,\/&]\h*/u', $bodyText, $offset, $match)) {
            return $offset + strlen($match[0]);
        }

        if ($this->matchesAt('/\G\h+and\h+/iu', $bodyText, $offset, $match)) {
            return $offset + strlen($match[0]);
        }

        return null;
    }

    private function horizontalWhitespaceEnd(string $bodyText, int $offset): int
    {
        if (! $this->matchesAt('/\G\h*/u', $bodyText, $offset, $match)) {
            return $offset;
        }

        return $offset + strlen($match[0]);
    }

    /** @param array<int, string> $match */
    private function matchesAt(string $pattern, string $subject, int $offset, ?array &$match): bool
    {
        return preg_match($pattern, $subject, $match, 0, $offset) === 1;
    }
}
