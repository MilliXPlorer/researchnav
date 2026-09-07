<?php

namespace Tests\Unit;

use App\Services\SdgDeclarationDetector;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class SdgDeclarationDetectorTest extends TestCase
{
    #[DataProvider('declarationExamples')]
    public function test_it_detects_only_frozen_explicit_declarations(string $bodyText, array $expected): void
    {
        $this->assertSame($expected, (new SdgDeclarationDetector)->detect($bodyText));
    }

    public static function declarationExamples(): array
    {
        return [
            'single marker' => ['SDG 4', [4]],
            'hash introducer' => ['SDG #13', [13]],
            'number introducer' => ['SDG No. 6', [6]],
            'plural list' => ['SDGs 3, 4 and 5', [3, 4, 5]],
            'long marker list' => ['Sustainable Development Goals 7 & 12', [7, 12]],
            'official title punctuation' => ['SDG 4 (Quality Education)', [4]],
            'case and duplicate normalization' => ['sdg\t4 / SDG 4, SDGs 13 AND 13', [4, 13]],
            'mixed list retains valid tokens' => ['SDGs 3, 18 and 5', [3, 5]],
            'all goals' => [implode('; ', array_map(fn (int $number): string => 'SDG '.$number, range(1, 17))), range(1, 17)],
            'thematic text is not a declaration' => ['quality education and climate action', []],
            'no marker' => ['Goal 4 and the goals include four outcomes', []],
            'official title is not a marker' => ['Sustainable Cities and Communities', []],
            'out of range tokens' => ['SDG 0; SDG 18; SDG 2025', []],
            'conjoined marker number' => ['SDG13', []],
            'conjoined number introducer' => ['SDGNo. 13', []],
            'only hash may touch marker' => ['SDG#13; SDGNo 6', [13]],
            'malformed number tokens' => ['SDG 4th; SDG 04; SDG 4.0; SDG +4', []],
            'unicode marker boundary' => ['éSDG 4; SDG４; SDG 4é', []],
            'newline is not grammar whitespace' => ["SDG\n4; SDG #\n13; SDG 4 and\n5", [4]],
            'and requires horizontal whitespace' => ['SDGs 3and 4; SDGs 3 and4', [3]],
            'ranges are never declarations' => ['SDGs 3-5; SDGs 3–5; SDGs 3—5; SDGs 3 to 5; SDGs 3 - 5', []],
            'malformed member does not prevent later list member' => ['SDGs 04, 2 and 4.0 / 7', [2, 7]],
        ];
    }
}
