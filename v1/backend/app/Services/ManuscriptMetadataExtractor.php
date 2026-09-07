<?php

namespace App\Services;

use ZipArchive;

class ManuscriptMetadataExtractor
{
    public const INSTITUTES = [
        'Institute of Computer Studies',
        'Institute of Health Sciences',
        'Institute of Business and Financial Management',
        'Institute of Arts and Sciences',
        'Institute of Criminal Justice Education',
        'Institute of Teacher Education',
        'Unclassified',
    ];

    private PdfTextExtractionService $pdfTextExtractionService;

    public function __construct(
        PdfTextExtractionService $pdfTextExtractionService
    ) {
        $this->pdfTextExtractionService =
            $pdfTextExtractionService;
    }

    public function extract(
        string $filePath,
        string $extension
    ): array {
        $extension = strtolower(
            trim($extension)
        );

        return match ($extension) {
            'docx' => $this->extractFromDocx($filePath),

            'pdf' => $this->extractFromPdf($filePath),

            default => throw new \InvalidArgumentException(
                'Unsupported manuscript format. Please upload a DOCX or text-based PDF.'
            ),
        };
    }

    public function extractFromDocx(
        string $filePath
    ): array {
        $text =
            $this->extractDocxText(
                $filePath
            );

        if (trim($text) === '') {
            throw new \RuntimeException(
                'Unable to extract text from this DOCX file.'
            );
        }

        return $this->extractMetadata(
            $text
        );
    }

    public function extractFromPdf(
        string $filePath
    ): array {
        $text =
            $this->extractPdfText(
                $filePath
            );

        if (trim($text) === '') {
            throw new \RuntimeException(
                'No extractable text was found in this PDF. Scanned or image-based PDFs are not supported.'
            );
        }

        return $this->extractMetadata(
            $text
        );
    }

    private function extractMetadata(
        string $text
    ): array {
        return [
            'title' => $this->extractTitle($text),

            'researchers' => $this->extractResearchers($text),

            'abstract' => $this->extractAbstract($text),

            'keywords' => $this->extractKeywords($text),

            'year' => $this->extractYear($text),

            'final_binding_date' => $this->extractFinalBindingDate(
                $text
            ),

            'institute' => $this->extractInstitute($text),

            'raw_text' => $text,
        ];
    }

    private function extractInstitute(string $text): string
    {
        $institutes = [
            'Institute of Computer Studies' => [
                '/\bbachelor\s+of\s+science\s+in\s+computer\s+science\b/i',
                '/\bbscs\b/i',
            ],
            'Institute of Health Sciences' => [
                '/\bbachelors?\s+(?:of\s+science\s+)?in\s+midwifery\b/i',
                '/\bbsm\b/i',
            ],
            'Institute of Business and Financial Management' => [
                '/\bbachelor\s+of\s+science\s+in\s+business\s+administration\s+major\s+in\s+(?:human\s+resource|marketing)\s+management\b/i',
                '/\b(?:human\s+resource|marketing)\s+management\b/i',
                '/\bbsba[\s-]?(?:hrm|mm)\b/i',
                '/\bbachelor\s+of\s+science\s+in\s+office\s+administration\b/i',
                '/\boffice\s+administration\b/i',
                '/\bbsoa\b/i',
            ],
            'Institute of Arts and Sciences' => [
                '/\bbachelor\s+of\s+arts\s+in\s+(?:communication|english\s+language|political\s+science)\b/i',
                '/\bab\s+(?:comm|english|polsci)\b/i',
            ],
            'Institute of Criminal Justice Education' => [
                '/\bbachelor\s+of\s+science\s+in\s+criminology\b/i',
                '/\bbs\s*crim\b/i',
                '/\bbachelor\s+of\s+science\s+in\s+industrial\s+security\s+management\b/i',
                '/\bbsism\b/i',
            ],
            'Institute of Teacher Education' => [
                '/\bbachelor\s+of\s+elementary\s+education\b/i',
                '/\bbeed\b/i',
                '/\bbachelor\s+of\s+secondary\s+education\s+major\s+in\s+(?:english|filipino|math(?:ematics)?|social\s+studies)\b/i',
                '/\bbsed[\s-]?(?:english|filipino|math|socstud)\b/i',
            ],
        ];

        foreach ($institutes as $institute => $patterns) {
            foreach ($patterns as $pattern) {
                if (preg_match($pattern, $text) === 1) {
                    return $institute;
                }
            }
        }

        return 'Unclassified';
    }

    /*
    |--------------------------------------------------------------------------
    | DOCX TEXT EXTRACTION
    |--------------------------------------------------------------------------
    */

    private function extractDocxText(
        string $filePath
    ): string {
        $zip = new ZipArchive;

        if (
            $zip->open($filePath) !== true
        ) {
            throw new \RuntimeException(
                'Invalid DOCX file.'
            );
        }

        $xml = $zip->getFromName(
            'word/document.xml'
        );

        $zip->close();

        if ($xml === false) {
            throw new \RuntimeException(
                'Unable to read DOCX document content.'
            );
        }

        $xml = str_replace(
            [
                '</w:p>',
                '</w:tr>',
                '<w:tab/>',
                '<w:br/>',
                '<w:br />',
            ],
            [
                "\n",
                "\n",
                "\t",
                "\n",
                "\n",
            ],
            $xml
        );

        $text = strip_tags(
            $xml
        );

        $text = html_entity_decode(
            $text,
            ENT_QUOTES | ENT_XML1,
            'UTF-8'
        );

        return $this->normalizeText(
            $text
        );
    }

    /*
    |--------------------------------------------------------------------------
    | PDF TEXT EXTRACTION
    |--------------------------------------------------------------------------
    */

    private function extractPdfText(
        string $filePath
    ): string {
        $text =
            $this
                ->pdfTextExtractionService
                ->extract($filePath);

        return $this->normalizeText(
            $text
        );
    }

    /*
    |--------------------------------------------------------------------------
    | NORMALIZATION
    |--------------------------------------------------------------------------
    */

    private function normalizeText(
        string $text
    ): string {
        $text = str_replace(
            ["\r\n", "\r"],
            "\n",
            $text
        );

        $text = str_replace(
            "\0",
            '',
            $text
        );

        /*
         * Collapse repeated spaces but preserve
         * actual new lines.
         */
        $text = preg_replace(
            '/[ \t]+/',
            ' ',
            $text
        );

        $text = preg_replace(
            "/\n{3,}/",
            "\n\n",
            $text
        );

        return trim($text);
    }

    /*
    |--------------------------------------------------------------------------
    | TITLE
    |--------------------------------------------------------------------------
    */

    private function extractTitle(
        string $text
    ): ?string {
        $lines = array_slice(
            $this->getLines($text),
            0,
            50
        );

        if (empty($lines)) {
            return null;
        }

        $titleLines = [];

        foreach ($lines as $line) {
            $line = trim($line);

            /*
             * TCGC title normally appears before:
             *
             * A Research Paper Presented...
             * A Thesis Presented...
             * A Capstone Project Presented...
             */
            if (
                preg_match(
                    '/^(a\s+research\s+paper|a\s+thesis|a\s+capstone(?:\s+project)?|a\s+research\s+project)\s+(presented|submitted)/i',
                    $line
                )
            ) {
                break;
            }

            if (
                $this->shouldIgnoreTitleLine(
                    $line
                )
            ) {
                continue;
            }

            if (
                strlen($line) >= 10 &&
                strlen($line) <= 300
            ) {
                $titleLines[] = $line;
            }
        }

        if (! empty($titleLines)) {
            $title = implode(
                ' ',
                $titleLines
            );

            $title = preg_replace(
                '/\s+/',
                ' ',
                $title
            );

            return trim($title);
        }

        return null;
    }

    private function shouldIgnoreTitleLine(
        string $line
    ): bool {
        if ($line === '') {
            return true;
        }

        $lower = strtolower(
            $line
        );

        $ignored = [
            'tangub city global college',
            'research and publication office',
            'institute of computer studies',
            'institute of health sciences',
            'institute of business and financial management',
            'institute of arts and sciences',
            'institute of criminal justice education',
            'institute of teacher education',
            'faculty of the institute',
        ];

        foreach ($ignored as $ignore) {
            if (
                str_contains(
                    $lower,
                    $ignore
                )
            ) {
                return true;
            }
        }

        return false;
    }

    /*
    |--------------------------------------------------------------------------
    | RESEARCHERS
    |--------------------------------------------------------------------------
    */

    private function extractResearchers(
        string $text
    ): array {
        $lines = array_slice(
            $this->getLines($text),
            0,
            120
        );

        /*
         * METHOD 1
         *
         * Explicit labels such as:
         *
         * Prepared by
         * Presented by
         * Submitted by
         * Researchers
         */
        foreach (
            $lines as $index => $line
        ) {
            if (
                preg_match(
                    '/^(researchers?|authors?|prepared\s+by|presented\s+by|submitted\s+by)\s*:?\s*$/i',
                    trim($line)
                )
            ) {
                $researchers = [];

                for (
                    $i = $index + 1;
                    $i < count($lines);
                    $i++
                ) {
                    $candidate = trim(
                        $lines[$i]
                    );

                    if (
                        $this->isDateLine(
                            $candidate
                        )
                    ) {
                        break;
                    }

                    if (
                        $this->isSectionBoundary(
                            $candidate
                        )
                    ) {
                        break;
                    }

                    /*
                     * IMPORTANT:
                     * Always split first.
                     *
                     * A flattened line may still look
                     * like a valid name.
                     */
                    $splitNames =
                        $this->splitFlattenedResearcherLine(
                            $candidate
                        );

                    foreach (
                        $splitNames as $name
                    ) {
                        if (
                            $this->looksLikePersonName(
                                $name
                            )
                        ) {
                            $researchers[] =
                                $name;
                        }
                    }
                }

                if (! empty($researchers)) {
                    return array_values(
                        array_unique(
                            $researchers
                        )
                    );
                }
            }
        }

        /*
         * METHOD 2
         *
         * Common TCGC format:
         *
         * In Partial Fulfillment
         * Of the Requirements...
         * Bachelor of Science in Computer Science
         *
         * Mark Adrian Reyes
         * Jenelyn Socias
         * John Francis Unabia
         *
         * December 2025
         */
        $partialIndex = null;
        $dateIndex = null;

        foreach (
            $lines as $index => $line
        ) {
            if (
                $partialIndex === null &&
                preg_match(
                    '/in\s+partial\s+fulfillment/i',
                    $line
                )
            ) {
                $partialIndex =
                    $index;

                continue;
            }

            if (
                $partialIndex !== null &&
                $this->isDateLine(
                    trim($line)
                )
            ) {
                $dateIndex =
                    $index;

                break;
            }
        }

        if (
            $partialIndex !== null &&
            $dateIndex !== null
        ) {
            $researchers = [];

            for (
                $i = $partialIndex + 1;
                $i < $dateIndex;
                $i++
            ) {
                $candidate = trim(
                    $lines[$i]
                );

                if (
                    $this->isAcademicRequirementLine(
                        $candidate
                    )
                ) {
                    continue;
                }

                /*
                 * Always split first.
                 *
                 * Example:
                 *
                 * Jay C. Matin-ao Nicole Galvez Vangie Bantilan
                 *
                 * should become:
                 *
                 * Jay C. Matin-ao
                 * Nicole Galvez
                 * Vangie Bantilan
                 */
                $splitNames =
                    $this->splitFlattenedResearcherLine(
                        $candidate
                    );

                foreach (
                    $splitNames as $name
                ) {
                    if (
                        $this->looksLikePersonName(
                            $name
                        )
                    ) {
                        $researchers[] =
                            $name;
                    }
                }
            }

            if (! empty($researchers)) {
                return array_values(
                    array_unique(
                        $researchers
                    )
                );
            }
        }

        /*
         * METHOD 3
         *
         * Some TCGC manuscripts place the researchers
         * directly after the degree line.
         *
         * Example:
         *
         * BACHELOR OF SCIENCE IN COMPUTER SCIENCE
         * Jayven Enomar
         * Jesmark B. Pilapil
         * Joyce Carmen H. Amigo
         * May 2025
         */
        $degreeIndex = null;
        $degreeDateIndex = null;

        foreach (
            $lines as $index => $line
        ) {
            if (
                $degreeIndex === null &&
                preg_match(
                    '/^bachelor\s+of\s+science\s+in\s+computer\s+science$/i',
                    trim($line)
                )
            ) {
                $degreeIndex = $index;

                continue;
            }

            if (
                $degreeIndex !== null &&
                $this->isDateLine(
                    trim($line)
                )
            ) {
                $degreeDateIndex = $index;

                break;
            }
        }

        if (
            $degreeIndex !== null &&
            $degreeDateIndex !== null &&
            $degreeDateIndex > $degreeIndex
        ) {
            $researchers = [];

            for (
                $i = $degreeIndex + 1;
                $i < $degreeDateIndex;
                $i++
            ) {
                $candidate = trim(
                    $lines[$i]
                );

                if ($candidate === '') {
                    continue;
                }

                if (
                    $this->isAcademicRequirementLine(
                        $candidate
                    ) ||
                    $this->isSectionBoundary(
                        $candidate
                    )
                ) {
                    continue;
                }

                $splitNames =
                    $this->splitFlattenedResearcherLine(
                        $candidate
                    );

                foreach (
                    $splitNames as $name
                ) {
                    if (
                        $this->looksLikePersonName(
                            $name
                        )
                    ) {
                        $researchers[] = $name;
                    }
                }
            }

            if (! empty($researchers)) {
                return array_values(
                    array_unique(
                        $researchers
                    )
                );
            }
        }

        return [];
    }

    /*
     * Split multiple researchers that were flattened
    }

    /*
     * Split multiple researchers that were flattened
     * by PDF or DOCX extraction.
     */
    private function splitFlattenedResearcherLine(
        string $line
    ): array {
        $line = trim($line);

        if ($line === '') {
            return [];
        }

        /*
         * BEST CASE:
         *
         * Layout extraction preserved multiple spaces
         * between researcher names.
         */
        $parts = preg_split(
            '/\s{2,}/u',
            $line
        );

        if (
            is_array($parts) &&
            count($parts) > 1
        ) {
            $cleaned = array_values(
                array_filter(
                    array_map(
                        'trim',
                        $parts
                    ),
                    fn ($name) => $name !== ''
                )
            );

            if (count($cleaned) > 1) {
                return $cleaned;
            }
        }

        /*
         * FALLBACK:
         *
         * Some documents completely flatten the
         * researcher names.
         *
         * Example:
         *
         * Jay C. Matin-ao Nicole Galvez Vangie Bantilan
         *
         * Expected:
         *
         * Jay C. Matin-ao
         * Nicole Galvez
         * Vangie Bantilan
         */
        $parts = preg_split(
            '/(?<=[a-zA-Z.\-])\s+(?=[A-Z][a-zA-Z.\'-]*(?:\s+[A-Z]\.)?\s+[A-Z][a-zA-Z.\'-]+)/u',
            $line
        );

        if (
            is_array($parts) &&
            count($parts) > 1
        ) {
            $cleaned = [];

            foreach ($parts as $part) {
                $part = trim($part);

                if (
                    $part !== '' &&
                    $this->looksLikePersonName(
                        $part
                    )
                ) {
                    $cleaned[] =
                        $part;
                }
            }

            if (count($cleaned) > 1) {
                return $cleaned;
            }
        }

        /*
         * If the parser gives us no reliable
         * separator, preserve the original instead
         * of inventing names.
         */
        return [$line];
    }

    private function looksLikePersonName(
        string $line
    ): bool {
        $line = trim($line);

        if (
            $line === '' ||
            strlen($line) < 4 ||
            strlen($line) > 100
        ) {
            return false;
        }

        if (
            preg_match(
                '/\d/',
                $line
            )
        ) {
            return false;
        }

        if (
            preg_match(
                '/^(abstract|keywords?|chapter|adviser|instructor|faculty|institute|college|school|bachelor|degree|research|submitted|presented|partial|requirement|requirements|computer\s+science|tangub\s+city)/i',
                $line
            )
        ) {
            return false;
        }

        if (
            ! preg_match(
                "/^[\p{L}\s.'\-]+$/u",
                $line
            )
        ) {
            return false;
        }

        $words = preg_split(
            '/\s+/',
            $line
        );

        if (! is_array($words)) {
            return false;
        }

        if (
            count($words) < 2 ||
            count($words) > 7
        ) {
            return false;
        }

        return true;
    }

    private function isAcademicRequirementLine(
        string $line
    ): bool {
        $line = trim($line);

        return (bool) preg_match(
            '/^(of\s+the\s+requirements?|for\s+the\s+degree|bachelor|bachelor\s+of\s+science|in\s+computer\s+science|computer\s+science|faculty|institute|tangub\s+city|a\s+research|submitted|presented)/i',
            $line
        );
    }

    private function isSectionBoundary(
        string $line
    ): bool {
        return (bool) preg_match(
            '/^(abstract|keywords?|chapter\s+(?:i|1)|introduction|adviser|approved|acknowledg)/i',
            trim($line)
        );
    }

    /*
    |--------------------------------------------------------------------------
    | ABSTRACT
    |--------------------------------------------------------------------------
    */

    private function extractAbstract(
        string $text
    ): ?string {
        /*
         * Preferred:
         *
         * ABSTRACT
         * ...
         * Keywords:
         */
        if (
            preg_match(
                '/\bABSTRACT\b\s*(.+?)(?=\b(?:KEYWORDS?|KEY\s+WORDS?)\b)/is',
                $text,
                $matches
            )
        ) {
            $abstract =
                $this->cleanParagraph(
                    $matches[1]
                );

            if (
                strlen($abstract) >= 30
            ) {
                return $abstract;
            }
        }

        /*
         * Fallback:
         *
         * ABSTRACT
         * ...
         * CHAPTER I
         */
        if (
            preg_match(
                '/\bABSTRACT\b\s*(.+?)(?=\b(?:CHAPTER\s+(?:I|1)|INTRODUCTION)\b)/is',
                $text,
                $matches
            )
        ) {
            $abstract =
                $this->cleanParagraph(
                    $matches[1]
                );

            if (
                strlen($abstract) >= 30
            ) {
                return $abstract;
            }
        }

        return null;
    }

    /*
    |--------------------------------------------------------------------------
    | KEYWORDS
    |--------------------------------------------------------------------------
    */

    private function extractKeywords(
        string $text
    ): array {
        $lines =
            $this->getLines(
                $text
            );

        foreach (
            $lines as $index => $line
        ) {
            if (
                ! preg_match(
                    '/^(?:keywords?|key\s+words?)\s*[:\-–—]?\s*(.*)$/i',
                    trim($line),
                    $matches
                )
            ) {
                continue;
            }

            $keywordText =
                trim(
                    $matches[1] ?? ''
                );

            /*
             * Keywords may wrap to next line.
             */
            for (
                $i = $index + 1;
                $i < count($lines);
                $i++
            ) {
                $nextLine =
                    trim(
                        $lines[$i]
                    );

                if (
                    preg_match(
                        '/^(chapter\s+(?:i|1)|introduction|acknowledg|table\s+of\s+contents)/i',
                        $nextLine
                    )
                ) {
                    break;
                }

                if (
                    strlen(
                        $keywordText
                    ) > 500
                ) {
                    break;
                }

                $keywordText .=
                    ' '.$nextLine;

                /*
                 * Common keyword lists end with period.
                 */
                if (
                    str_ends_with(
                        $nextLine,
                        '.'
                    )
                ) {
                    break;
                }
            }

            $keywordText =
                preg_replace(
                    '/\s+/',
                    ' ',
                    $keywordText
                );

            $keywordText =
                trim(
                    $keywordText
                );

            $keywordText =
                rtrim(
                    $keywordText,
                    '. '
                );

            $keywords =
                preg_split(
                    '/[,;]+/',
                    $keywordText
                );

            if (! is_array($keywords)) {
                return [];
            }

            return array_values(
                array_filter(
                    array_map(
                        fn ($keyword) => trim(
                            $keyword
                        ),
                        $keywords
                    ),
                    fn ($keyword) => $keyword !== ''
                )
            );
        }

        return [];
    }

    /*
    |--------------------------------------------------------------------------
    | YEAR
    |--------------------------------------------------------------------------
    */

    private function extractYear(
        string $text
    ): ?int {
        /*
         * Prefer the year from the binding date.
         */
        $bindingDate =
            $this->extractFinalBindingDate(
                $text
            );

        if (
            $bindingDate !== null &&
            preg_match(
                '/\b(20\d{2})\b/',
                $bindingDate,
                $matches
            )
        ) {
            return (int) $matches[1];
        }

        /*
         * Fallback to title page.
         */
        $lines = array_slice(
            $this->getLines($text),
            0,
            100
        );

        foreach (
            array_reverse($lines) as $line
        ) {
            if (
                preg_match(
                    '/\b(20\d{2})\b/',
                    $line,
                    $matches
                )
            ) {
                $year =
                    (int) $matches[1];

                if (
                    $year >= 2000 &&
                    $year <=
                        ((int) date('Y') + 1)
                ) {
                    return $year;
                }
            }
        }

        return null;
    }

    /*
    |--------------------------------------------------------------------------
    | FINAL BINDING DATE
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | Only Month + Year is returned.
    |
    | Example:
    | December 2025
    |
    | We do not invent a day.
    |
    */

    private function extractFinalBindingDate(
        string $text
    ): ?string {
        $lines = array_slice(
            $this->getLines($text),
            0,
            120
        );

        /*
         * Explicit labels.
         */
        $explicitPatterns = [
            '/Final\s+Binding\s+Date\s*[:\-–—]\s*(.+)$/i',

            '/Date\s+of\s+Final\s+Binding\s*[:\-–—]\s*(.+)$/i',

            '/Approved\s+for\s+Binding\s*(?:on)?\s*[:\-–—]?\s*(.+)$/i',

            '/Approval\s+for\s+Binding\s*(?:Date)?\s*[:\-–—]?\s*(.+)$/i',
        ];

        foreach ($lines as $line) {
            foreach (
                $explicitPatterns as $pattern
            ) {
                if (
                    preg_match(
                        $pattern,
                        $line,
                        $matches
                    )
                ) {
                    $monthYear =
                        $this->normalizeMonthYear(
                            trim(
                                $matches[1]
                            )
                        );

                    if (
                        $monthYear !== null
                    ) {
                        return $monthYear;
                    }
                }
            }
        }

        /*
         * TCGC title-page fallback:
         *
         * December 2025
         */
        $dateCandidates = [];

        foreach ($lines as $line) {
            $monthYear =
                $this->normalizeMonthYear(
                    trim($line)
                );

            if (
                $monthYear !== null
            ) {
                $dateCandidates[] =
                    $monthYear;
            }
        }

        if (! empty($dateCandidates)) {
            return end(
                $dateCandidates
            );
        }

        return null;
    }

    private function normalizeMonthYear(
        string $value
    ): ?string {
        $months =
            'January|February|March|April|May|June|July|August|September|October|November|December';

        /*
         * December 2025
         */
        if (
            preg_match(
                '/^('.
                    $months.
                    ')\s+(20\d{2})$/i',
                trim($value),
                $matches
            )
        ) {
            return ucfirst(
                strtolower(
                    $matches[1]
                )
            ).
                ' '.
                $matches[2];
        }

        /*
         * December 15, 2025
         *
         * becomes:
         *
         * December 2025
         */
        if (
            preg_match(
                '/^('.
                    $months.
                    ')\s+\d{1,2},?\s+(20\d{2})$/i',
                trim($value),
                $matches
            )
        ) {
            return ucfirst(
                strtolower(
                    $matches[1]
                )
            ).
                ' '.
                $matches[2];
        }

        /*
         * 15 December 2025
         *
         * becomes:
         *
         * December 2025
         */
        if (
            preg_match(
                '/^\d{1,2}\s+('.
                    $months.
                    ')\s+(20\d{2})$/i',
                trim($value),
                $matches
            )
        ) {
            return ucfirst(
                strtolower(
                    $matches[1]
                )
            ).
                ' '.
                $matches[2];
        }

        return null;
    }

    private function isDateLine(
        string $line
    ): bool {
        return $this->normalizeMonthYear(
            trim($line)
        ) !== null;
    }

    /*
    |--------------------------------------------------------------------------
    | HELPERS
    |--------------------------------------------------------------------------
    */

    private function getLines(
        string $text
    ): array {
        $lines = preg_split(
            '/\r?\n/',
            $text
        );

        if (! is_array($lines)) {
            return [];
        }

        return array_values(
            array_filter(
                array_map(
                    'trim',
                    $lines
                ),
                fn ($line) => $line !== ''
            )
        );
    }

    private function cleanParagraph(
        string $text
    ): string {
        $text = preg_replace(
            '/\s+/',
            ' ',
            $text
        );

        return trim(
            $text
        );
    }
}
