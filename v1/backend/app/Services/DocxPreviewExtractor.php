<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Validation\ValidationException;
use ZipArchive;

class DocxPreviewExtractor
{
    private const MAX_ENTRIES = 2048;

    private const MAX_UNCOMPRESSED_BYTES = 134_217_728;

    private const MAX_CONTENT_TYPES_XML_BYTES = 1_048_576;

    private const MAX_DOCUMENT_XML_BYTES = 8_388_608;

    private const MAX_PARAGRAPHS = 2000;

    private const MAX_PARAGRAPH_CHARACTERS = 4000;

    private const MAX_TOTAL_CHARACTERS = 250000;

    /** @param array{absolute_path:string,size:int} $resolved
     * @return array{paragraphs:list<array{index:int,text:string,truncated:bool}>,truncated:bool}
     */
    public function extract(array $resolved): array
    {
        $zip = new ZipArchive;
        if ($zip->open($resolved['absolute_path']) !== true) {
            throw $this->unreadable();
        }

        try {
            if ($zip->numFiles < 1 || $zip->numFiles > self::MAX_ENTRIES) {
                throw $this->unreadable();
            }
            $total = 0;
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $stat = $zip->statIndex($index);
                if (! is_array($stat)) {
                    throw $this->unreadable();
                }
                $size = (int) ($stat['size'] ?? 0);
                $compressed = (int) ($stat['comp_size'] ?? 0);
                $total += $size;
                if ($total > self::MAX_UNCOMPRESSED_BYTES || ($size > 0 && ($compressed < 1 || $size / $compressed > 100))) {
                    throw $this->unreadable();
                }
            }

            $contentTypes = $this->readEntry($zip, '[Content_Types].xml', self::MAX_CONTENT_TYPES_XML_BYTES);
            $xml = $this->readEntry($zip, 'word/document.xml', self::MAX_DOCUMENT_XML_BYTES);
            if (! str_contains($contentTypes, 'wordprocessingml.document.main+xml') || $xml === '') {
                throw $this->unreadable();
            }
        } finally {
            $zip->close();
        }

        if (stripos($xml, '<!DOCTYPE') !== false || stripos($xml, '<!ENTITY') !== false) {
            throw $this->unreadable();
        }

        $document = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        try {
            if (! $document->loadXML($xml, LIBXML_NONET | LIBXML_COMPACT)) {
                throw $this->unreadable();
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previous);
        }

        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
        $nodes = $xpath->query('/w:document/w:body//w:p');
        if ($nodes === false) {
            throw $this->unreadable();
        }

        $paragraphs = [];
        $totalCharacters = 0;
        $documentTruncated = false;
        foreach ($nodes as $paragraph) {
            if (! $paragraph instanceof DOMElement) {
                continue;
            }
            if (count($paragraphs) >= self::MAX_PARAGRAPHS || $totalCharacters >= self::MAX_TOTAL_CHARACTERS) {
                $documentTruncated = true;
                break;
            }
            $parts = $xpath->query('.//w:t | .//w:tab | .//w:br | .//w:cr', $paragraph);
            if ($parts === false) {
                continue;
            }
            $text = '';
            foreach ($parts as $part) {
                $text .= match ($part->localName) {
                    'tab' => "\t",
                    'br', 'cr' => "\n",
                    default => $part->textContent,
                };
            }
            $text = trim($text);
            if ($text === '') {
                continue;
            }
            $remaining = self::MAX_TOTAL_CHARACTERS - $totalCharacters;
            $limit = min(self::MAX_PARAGRAPH_CHARACTERS, $remaining);
            $truncated = mb_strlen($text) > $limit;
            if ($truncated) {
                $text = mb_substr($text, 0, $limit);
                $documentTruncated = true;
            }
            $paragraphs[] = ['index' => count($paragraphs), 'text' => $text, 'truncated' => $truncated];
            $totalCharacters += mb_strlen($text);
        }

        if ($paragraphs === []) {
            throw $this->unreadable();
        }

        return ['paragraphs' => $paragraphs, 'truncated' => $documentTruncated];
    }

    private function readEntry(ZipArchive $zip, string $name, int $maximumBytes): string
    {
        $index = $zip->locateName($name, ZipArchive::FL_NOCASE);
        if ($index === false) {
            throw $this->unreadable();
        }
        $stat = $zip->statIndex($index);
        if (! is_array($stat) || (int) ($stat['size'] ?? 0) > $maximumBytes) {
            throw $this->unreadable();
        }
        $contents = $zip->getFromIndex($index);
        if (! is_string($contents) || strlen($contents) > $maximumBytes) {
            throw $this->unreadable();
        }

        return $contents;
    }

    private function unreadable(): ValidationException
    {
        return ValidationException::withMessages(['document_file_id' => ['A safe text preview could not be generated for this DOCX file.']]);
    }
}
