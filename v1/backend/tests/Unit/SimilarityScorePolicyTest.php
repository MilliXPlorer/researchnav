<?php

namespace Tests\Unit;

use App\Services\SimilarityScorePolicy;
use InvalidArgumentException;
use Tests\TestCase;

class SimilarityScorePolicyTest extends TestCase
{
    public function test_weighted_examples_and_flags_are_exact_decimal_strings(): void
    {
        $policy = new SimilarityScorePolicy;

        $low = $policy->evaluate('0.292108', '0.234404');
        $this->assertSame('0.251715200000', $low['overall_similarity_score']);
        $this->assertSame('low', $low['classification']);
        $this->assertFalse($low['overall_flagged']);

        $high = $policy->evaluate('0.8', '0.75');
        $this->assertSame('0.765000000000', $high['overall_similarity_score']);
        $this->assertSame('high', $high['classification']);
        $this->assertSame('overall_high_similarity', $high['flag_reason']);

        $titleAlert = $policy->evaluate('1', '0.2');
        $this->assertSame('0.440000000000', $titleAlert['overall_similarity_score']);
        $this->assertSame('moderate', $titleAlert['classification']);
        $this->assertTrue($titleAlert['title_match_alert']);
        $this->assertSame('near_exact_title_match', $titleAlert['flag_reason']);
        $this->assertSame('30.000000000000', $titleAlert['title_weighted_contribution']);
    }

    public function test_boundaries_and_content_unavailable_are_not_float_based(): void
    {
        $policy = new SimilarityScorePolicy;
        $this->assertSame('low', $policy->evaluate('0.39999999', '0.39999999')['classification']);
        $this->assertSame('moderate', $policy->evaluate('0.4', '0.4')['classification']);
        $this->assertSame('moderate', $policy->evaluate('0.69999999', '0.69999999')['classification']);
        $this->assertSame('high', $policy->evaluate('0.7', '0.7')['classification']);
        $this->assertSame('low', $policy->evaluate('0', '0')['classification']);
        $this->assertSame('high', $policy->evaluate('1', '1')['classification']);

        // The two products cancel at the final storage precision. Per-product
        // truncation would incorrectly classify both of these as below-boundary.
        $this->assertSame('0.700000000000', $policy->evaluate('0.700000000007', '0.699999999997')['overall_similarity_score']);
        $this->assertSame('high', $policy->evaluate('0.700000000007', '0.699999999997')['classification']);
        $this->assertSame('0.400000000000', $policy->evaluate('0.400000000007', '0.399999999997')['overall_similarity_score']);
        $this->assertSame('moderate', $policy->evaluate('0.400000000007', '0.399999999997')['classification']);

        $unavailable = $policy->evaluate('1', null);
        $this->assertNull($unavailable['overall_similarity_score']);
        $this->assertFalse($unavailable['overall_flagged']);
        $this->assertTrue($unavailable['adviser_review_required']);
        $this->assertSame('near_exact_title_match', $unavailable['flag_reason']);
    }

    public function test_percentage_conversion_moves_the_fixed_decimal_point_for_every_edge_size(): void
    {
        $examples = [
            '0' => '0.000000000000',
            '0.000000000001' => '0.000000000100',
            '0.000001' => '0.000100000000',
            '0.004' => '0.400000000000',
            '0.01' => '1.000000000000',
            '0.1' => '10.000000000000',
            '0.999999999999' => '99.999999999900',
            '1' => '100.000000000000',
        ];

        foreach ($examples as $normalized => $percentage) {
            $this->assertSame($percentage, SimilarityScorePolicy::percentage($normalized));
        }
    }

    public function test_invalid_scores_and_invalid_weight_sum_are_rejected(): void
    {
        foreach (['-0.1', '1.1', 'NaN', 'INF', '0.1234567890123', 0.5] as $value) {
            try {
                SimilarityScorePolicy::normalize($value);
                $this->fail('Malformed score was accepted.');
            } catch (InvalidArgumentException) {
                $this->assertTrue(true);
            }
        }
        $this->expectException(InvalidArgumentException::class);
        new SimilarityScorePolicy([
            ...config('researchnav.similarity'),
            'title_weight' => '0.3',
            'content_weight' => '0.6',
        ]);
    }

    public function test_current_version_rejects_configuration_drift(): void
    {
        $configuration = config('researchnav.similarity');
        $configuration['title_weight'] = '0.40';
        $configuration['content_weight'] = '0.60';

        $this->expectException(InvalidArgumentException::class);
        new SimilarityScorePolicy($configuration);
    }
}
