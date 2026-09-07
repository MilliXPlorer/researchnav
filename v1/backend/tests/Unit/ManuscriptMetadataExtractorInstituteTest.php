<?php

namespace Tests\Unit;

use App\Services\ManuscriptMetadataExtractor;
use App\Services\PdfTextExtractionService;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class ManuscriptMetadataExtractorInstituteTest extends TestCase
{
    #[DataProvider('programs')]
    public function test_it_detects_only_the_configured_program_mappings(string $text, string $expected): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractInstitute');

        $this->assertSame($expected, $method->invoke($extractor, $text));
    }

    public static function programs(): array
    {
        return [
            ['Bachelor of Science in Computer Science', 'Institute of Computer Studies'],
            ['BSBA-HRM', 'Institute of Business and Financial Management'],
            ['BSED-SOCSTUD', 'Institute of Teacher Education'],
            ['BSCRIM', 'Institute of Criminal Justice Education'],
            ['AB COMM', 'Institute of Arts and Sciences'],
            ['Bachelors in Midwifery', 'Institute of Health Sciences'],
            ['Bachelor of Science in Information Technology', 'Unclassified'],
            ['Unknown degree program', 'Unclassified'],
        ];
    }
}
