<?php

namespace App\Services;

class ManuscriptTextParts
{
    /** @return list<string> */
    public function split(string $text): array
    {
        if ($text === '') {
            return [];
        }

        $limit = max(1, (int) config('researchnav.manuscript_search.part_characters'));
        $parts = [];
        $offset = 0;
        $length = strlen($text);

        while ($length - $offset > $limit) {
            $boundary = $offset + $limit;
            while ($boundary > $offset && ! ctype_space($text[$boundary - 1])) {
                $boundary--;
            }
            if ($boundary === $offset) {
                $boundary = $offset + $limit;
                while ($boundary < $length && ! ctype_space($text[$boundary])) {
                    $boundary++;
                }
                if ($boundary < $length) {
                    $boundary++;
                }
            }

            $parts[] = substr($text, $offset, $boundary - $offset);
            $offset = $boundary;
        }

        $parts[] = substr($text, $offset);

        return $parts;
    }

    /** @param list<string> $parts */
    public function combine(array $parts): string
    {
        return implode('', $parts);
    }
}
