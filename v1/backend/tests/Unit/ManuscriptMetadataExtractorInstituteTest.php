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
            ['BSM', 'Institute of Health Sciences'],
            ['Bachelor of Science in Midwifery', 'Institute of Health Sciences'],
            ['ISM', 'Institute of Criminal Justice Education'],
            ['CRIM', 'Institute of Criminal Justice Education'],
            ['HRM', 'Institute of Business and Financial Management'],
            ['MM', 'Institute of Business and Financial Management'],
            ['BSED ENG', 'Institute of Teacher Education'],
            ['BSED FIL', 'Institute of Teacher Education'],
            ['BEED', 'Institute of Teacher Education'],
            ['BSED MATH', 'Institute of Teacher Education'],
            ['BSED SOCSTUD', 'Institute of Teacher Education'],
            ['POLSCI', 'Institute of Arts and Sciences'],
            ['AB COMM', 'Institute of Arts and Sciences'],
            ['AB ENGLISH', 'Institute of Arts and Sciences'],
            ['BSCS', 'Institute of Computer Studies'],
            ['Bachelor of Science in Office Administration', 'Unclassified'],
            ['Bachelor of Science in Information Technology', 'Unclassified'],
            ['Unknown degree program', 'Unclassified'],
        ];
    }

    public function test_keywords_stop_before_a_roman_numeral_page_number(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractKeywords');

        $this->assertSame(
            ['driver licensing status', 'unlicensed driving', 'road accidents', 'traffic violations', 'enforcement'],
            $method->invoke(
                $extractor,
                "Keywords: driver licensing status, unlicensed driving, road accidents, traffic violations, enforcement\niii\nCHAPTER I",
            ),
        );
    }

    public function test_filipino_abstract_and_keywords_are_extracted_from_localized_headings(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $abstract = new ReflectionMethod($extractor, 'extractAbstract');
        $keywords = new ReflectionMethod($extractor, 'extractKeywords');
        $text = <<<'TEXT'
ABSTRAK
Sinusuri ng pag-aaral na ito ang paggamit ng wikang Filipino sa pagtuturo at ang karanasan ng mga mag-aaral sa paaralan. Inilalarawan din nito ang mahahalagang resulta ng isinagawang pananaliksik.
Mga Susing Salita: wikang Filipino, pagtuturo, mag-aaral, paaralan
KABANATA I
PANIMULA
TEXT;

        $this->assertSame(
            'Sinusuri ng pag-aaral na ito ang paggamit ng wikang Filipino sa pagtuturo at ang karanasan ng mga mag-aaral sa paaralan. Inilalarawan din nito ang mahahalagang resulta ng isinagawang pananaliksik.',
            $abstract->invoke($extractor, $text),
        );
        $this->assertSame(
            ['wikang Filipino', 'pagtuturo', 'mag-aaral', 'paaralan'],
            $keywords->invoke($extractor, $text),
        );
    }

    public function test_localized_bsed_filipino_title_page_and_inline_metadata_are_extracted(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $text = <<<'TEXT'
STUDENTS WITH ONLINE PART-TIME JOB: MGA
HAMON NA KINAKAHARAP
Isang Tesis na Ihaharap sa
Institusyon ng mga Magtuturo ng Edukasyon
Tangub City Global College
Maloro, Tangub City
Bilang Bahagi
Ng Mga Pangangailangan Para sa Digring
BATSILYER NG EDUKASYON SEKONDARYA
MEDYUR SA FILIPINO
Jasper Lloyd M. Taoto-an
Sweet Charlyn B. Cagas
Mayo 2024 ABSTRAK
Sinusuri ng pag-aaral na ito ang mga hamon na kinakaharap ng mga mag-aaral na nagtatrabaho habang nagpapatuloy sa kanilang pag-aaral at inilalahad ang mahahalagang resulta.
Mga Susing salita: Hamon, Part-Time Job Online, Mag-aaral, Pag-aaral TALAAN NG NILALAMAN
Pahina
TEXT;

        $expectations = [
            'extractTitle' => 'STUDENTS WITH ONLINE PART-TIME JOB: MGA HAMON NA KINAKAHARAP',
            'extractInstitute' => 'Institute of Teacher Education',
            'extractResearchers' => ['Jasper Lloyd M. Taoto-an', 'Sweet Charlyn B. Cagas'],
            'extractAbstract' => 'Sinusuri ng pag-aaral na ito ang mga hamon na kinakaharap ng mga mag-aaral na nagtatrabaho habang nagpapatuloy sa kanilang pag-aaral at inilalahad ang mahahalagang resulta.',
            'extractKeywords' => ['Hamon', 'Part-Time Job Online', 'Mag-aaral', 'Pag-aaral'],
            'extractYear' => 2024,
            'extractFinalBindingDate' => 'May 2024',
        ];

        foreach ($expectations as $methodName => $expected) {
            $method = new ReflectionMethod($extractor, $methodName);
            $this->assertSame($expected, $method->invoke($extractor, $text), $methodName);
        }
    }

    public function test_researchers_are_found_after_british_fulfilment_and_non_computer_science_degree(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractResearchers');
        $text = <<<'TEXT'
LEVEL OF AWARENESS ON DATA PRIVACY ACT OF 2012
A Research Paper Presented to the
Faculty of the Institute of Criminal Justice Education
In Partial Fulfilment
of the Requirements of the Degree
BACHELOR OF SCIENCE IN INDUSTRIAL SECURITY MANAGEMENT
Dale Christian F. Davis
Joshua B. Lusterio
Mark Jhun C. Ladion
July 2025
TEXT;

        $this->assertSame(
            ['Dale Christian F. Davis', 'Joshua B. Lusterio', 'Mark Jhun C. Ladion'],
            $method->invoke($extractor, $text),
        );
    }

    public function test_researchers_support_surname_first_cover_page_names(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractResearchers');
        $text = <<<'TEXT'
In Partial Fulfillment
Of the Requirements for the Degree
BACHELOR OF SCIENCE IN INDUSTRIAL SECURITY MANAGEMENT
Dulanas, Jimmy Jr. C.
Lanugan, Mark William
Taguibalos, Nadine R.
April 2025
TEXT;

        $this->assertSame(
            ['Dulanas, Jimmy Jr. C.', 'Lanugan, Mark William', 'Taguibalos, Nadine R.'],
            $method->invoke($extractor, $text),
        );
    }

    public function test_researchers_follow_any_bachelor_degree_line(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractResearchers');

        $this->assertSame(
            ['Ana M. Reyes', 'Juan D. Cruz'],
            $method->invoke(
                $extractor,
                "BACHELOR OF ARTS IN COMMUNICATION\nAna M. Reyes\nJuan D. Cruz\nJune 2025",
            ),
        );
    }

    public function test_cover_authors_take_priority_over_later_research_participants(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractResearchers');
        $text = <<<'TEXT'
TRABAHUNT: TANGUB CITY JOB-HUNTING SITE
A Research Paper Presented to the
Faculty of the Institute of Computer Studies
In Partial Fulfillment
of the Requirements for the Degree
BACHELOR OF SCIENCE IN COMPUTER SCIENCE
Leda Grace C. Abella
Ramonito U. Lumapac Jr.
Nimbrod L. Sacan
Daniel M. Lapinig
January 2023
ABSTRACT
The researchers conducted interviews with local households.
Researchers
MR. ALEX S. ABELLA
MRS. NILDA C. ABELLA
MR. RAMONITO U. LUMAPAC SR.
TEXT;

        $this->assertSame(
            ['Leda Grace C. Abella', 'Ramonito U. Lumapac Jr.', 'Nimbrod L. Sacan', 'Daniel M. Lapinig'],
            $method->invoke($extractor, $text),
        );
    }

    public function test_title_stops_at_research_proposal_presentation_boundary(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractTitle');

        $this->assertSame(
            'AWARENESS OF COMMUNITY SAFETY PRACTICES',
            $method->invoke(
                $extractor,
                "AWARENESS OF COMMUNITY SAFETY PRACTICES\nA Research Proposal Presented to the Faculty\nBachelor of Science in Criminology",
            ),
        );
    }

    public function test_title_stops_at_research_paper_without_presented_word(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractTitle');

        $this->assertSame(
            'OPERATIONAL PERFORMANCE OF BARANGAY PEACE- KEEPING ACTION TEAM',
            $method->invoke(
                $extractor,
                "OPERATIONAL PERFORMANCE OF BARANGAY PEACE-\nKEEPING ACTION TEAM\nA Research Paper to the\nFaculty of the Institute",
            ),
        );
    }

    public function test_title_stops_at_research_presentation_without_document_type(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractTitle');

        $this->assertSame(
            'TEACHERS EXPERIENCES IN TEACHING MATHEMATICS IN THE NEW NORMAL',
            $method->invoke(
                $extractor,
                "TEACHERS EXPERIENCES IN TEACHING MATHEMATICS IN THE NEW NORMAL\nA Research Presented to the\nFaculty of the Institute of Teacher Education",
            ),
        );
    }

    public function test_source_code_heading_is_not_accepted_as_a_research_title(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractTitle');

        $this->assertNull(
            $method->invoke($extractor, 'Appendix H SOURCE CODE <div class="container"><!DOCTYPE html>'),
        );
    }

    public function test_requirement_line_is_not_extracted_as_a_researcher(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $method = new ReflectionMethod($extractor, 'extractResearchers');
        $text = <<<'TEXT'
In Partial Fulfillment
The Requirement for the Degree of
BACHELOR OF SCIENCE IN COMPUTER SCIENCE
Chella Mae R. Duerme
Maritho A. Cabasag
Ferlmarkish M. Clavecilla
December 2020
TEXT;

        $this->assertSame(
            ['Chella Mae R. Duerme', 'Maritho A. Cabasag', 'Ferlmarkish M. Clavecilla'],
            $method->invoke($extractor, $text),
        );
    }

    public function test_word_drawing_prefix_is_removed_and_major_line_is_not_a_researcher(): void
    {
        $extractor = new ManuscriptMetadataExtractor($this->createStub(PdfTextExtractionService::class));
        $title = new ReflectionMethod($extractor, 'extractTitle');
        $researchers = new ReflectionMethod($extractor, 'extractResearchers');

        $this->assertSame(
            'TECHNOLOGY ADAPTATION AMONG SMALL ENTERPRISES IN TANGUB CITY',
            $title->invoke($extractor, "5242560-57912000TECHNOLOGY ADAPTATION AMONG SMALL ENTERPRISES IN TANGUB CITY\nA Research Paper Presented to the"),
        );
        $this->assertSame(
            ['Charie L. Heledo', 'Shaira A. Sumalpong'],
            $researchers->invoke($extractor, "BACHELOR OF SCIENCE IN BUSINESS ADMINISTRATION\nMAJOR IN MARKETING MANAGEMENT\nCharie L. Heledo\nShaira A. Sumalpong\nApril 2023"),
        );
    }
}
