<?php

namespace App\Services;

use InvalidArgumentException;

/**
 * The sole authority for weighted similarity decisions. Values are fixed-point
 * decimal strings so a threshold can never move because of binary floats.
 */
class SimilarityScorePolicy
{
    public const SCALE = 12;

    private string $titleWeight;

    private string $contentWeight;

    private string $moderateThreshold;

    private string $highThreshold;

    private string $titleAlertThreshold;

    private string $algorithmVersion;

    /** @var array<string, string> */
    private array $canonicalPolicy;

    public function __construct(?array $configuration = null)
    {
        $configuration ??= config('researchnav.similarity');
        $this->algorithmVersion = (string) ($configuration['algorithm_version'] ?? '');
        $canonical = $configuration['policies'][$this->algorithmVersion] ?? null;
        if ($this->algorithmVersion === '' || ! is_array($canonical)) {
            throw new InvalidArgumentException('Similarity policy version is invalid.');
        }
        $this->canonicalPolicy = [];
        foreach (['title_weight', 'content_weight', 'moderate_threshold', 'high_threshold', 'title_alert_threshold'] as $name) {
            $this->canonicalPolicy[$name] = self::normalize($canonical[$name] ?? null, str_replace('_', ' ', $name));
        }

        $this->titleWeight = self::normalize($configuration['title_weight'] ?? null, 'title weight');
        $this->contentWeight = self::normalize($configuration['content_weight'] ?? null, 'content weight');
        $this->moderateThreshold = self::normalize($configuration['moderate_threshold'] ?? null, 'moderate threshold');
        $this->highThreshold = self::normalize($configuration['high_threshold'] ?? null, 'high threshold');
        $this->titleAlertThreshold = self::normalize($configuration['title_alert_threshold'] ?? null, 'title alert threshold');

        if (self::add($this->titleWeight, $this->contentWeight) !== '1.000000000000') {
            throw new InvalidArgumentException('Similarity policy weights must sum exactly to 1.');
        }
        foreach ([
            'title_weight' => $this->titleWeight,
            'content_weight' => $this->contentWeight,
            'moderate_threshold' => $this->moderateThreshold,
            'high_threshold' => $this->highThreshold,
            'title_alert_threshold' => $this->titleAlertThreshold,
        ] as $name => $value) {
            if ($value !== $this->canonicalPolicy[$name]) {
                throw new InvalidArgumentException('Similarity policy values do not match its version.');
            }
        }
        if (self::compare($this->moderateThreshold, $this->highThreshold) > 0) {
            throw new InvalidArgumentException('Similarity policy thresholds are invalid.');
        }
    }

    /** @return array<string, string|bool|null> */
    public function evaluate(?string $titleScore, ?string $contentScore): array
    {
        $titleScore = $titleScore === null ? null : self::normalize($titleScore, 'title score');
        $contentScore = $contentScore === null ? null : self::normalize($contentScore, 'content score');
        $titleAlert = $titleScore !== null && self::compare($titleScore, $this->titleAlertThreshold) >= 0;

        if ($contentScore === null || $titleScore === null) {
            return $this->unavailable($titleScore, $titleAlert);
        }

        $titleContribution = self::multiply($titleScore, $this->titleWeight);
        $contentContribution = self::multiply($contentScore, $this->contentWeight);
        // Keep both 24-place products until after their sum. Truncating each
        // contribution first changes exact cancellation at policy boundaries.
        $overall = self::truncate(self::addAtScale(
            self::multiplyAtScale($titleScore, $this->titleWeight),
            self::multiplyAtScale($contentScore, $this->contentWeight),
            self::SCALE * 2,
        ), self::SCALE);
        $overallFlagged = self::compare($overall, $this->highThreshold) >= 0;
        $adviserReview = $overallFlagged || $titleAlert;

        return [
            'title_similarity_score' => $titleScore,
            'title_similarity_percentage' => self::percentage($titleScore),
            'title_weight' => $this->titleWeight,
            'title_weighted_contribution' => self::percentage($titleContribution),
            'content_similarity_score' => $contentScore,
            'content_similarity_percentage' => self::percentage($contentScore),
            'content_weight' => $this->contentWeight,
            'content_weighted_contribution' => self::percentage($contentContribution),
            'overall_similarity_score' => $overall,
            'overall_similarity_percentage' => self::percentage($overall),
            'classification' => self::compare($overall, $this->highThreshold) >= 0 ? 'high' : (self::compare($overall, $this->moderateThreshold) >= 0 ? 'moderate' : 'low'),
            'overall_flagged' => $overallFlagged,
            'title_match_alert' => $titleAlert,
            'adviser_review_required' => $adviserReview,
            'flag_reason' => $overallFlagged && $titleAlert ? 'overall_and_title_match' : ($overallFlagged ? 'overall_high_similarity' : ($titleAlert ? 'near_exact_title_match' : 'not_flagged')),
            'algorithm_version' => $this->algorithmVersion,
        ];
    }

    public function algorithmVersion(): string
    {
        return $this->algorithmVersion;
    }

    public function highThreshold(): string
    {
        return $this->highThreshold;
    }

    public function titleAlertThreshold(): string
    {
        return $this->titleAlertThreshold;
    }

    /** @return array<string, string|bool|null> */
    private function unavailable(?string $titleScore, bool $titleAlert): array
    {
        return [
            'title_similarity_score' => $titleScore,
            'title_similarity_percentage' => $titleScore === null ? null : self::percentage($titleScore),
            'title_weight' => $this->titleWeight,
            'title_weighted_contribution' => null,
            'content_similarity_score' => null, 'content_similarity_percentage' => null,
            'content_weight' => $this->contentWeight, 'content_weighted_contribution' => null,
            'overall_similarity_score' => null, 'overall_similarity_percentage' => null,
            'classification' => null, 'overall_flagged' => false,
            'title_match_alert' => $titleAlert, 'adviser_review_required' => $titleAlert,
            'flag_reason' => $titleAlert ? 'near_exact_title_match' : 'not_flagged',
            'algorithm_version' => $this->algorithmVersion,
        ];
    }

    public static function normalize(mixed $value, string $name = 'score'): string
    {
        if (! is_string($value) || preg_match('/\A(?:0|1)(?:\.\d+)?\z/', $value) !== 1) {
            throw new InvalidArgumentException("Invalid {$name}.");
        }
        [$whole, $fraction] = array_pad(explode('.', $value, 2), 2, '');
        if (strlen($fraction) > self::SCALE || ($whole === '1' && trim($fraction, '0') !== '')) {
            throw new InvalidArgumentException("Invalid {$name}.");
        }

        return $whole.'.'.str_pad($fraction, self::SCALE, '0');
    }

    public static function compare(string $left, string $right): int
    {
        return strcmp(str_replace('.', '', self::normalize($left)), str_replace('.', '', self::normalize($right)));
    }

    public static function percentage(string $value): string
    {
        $value = self::normalize($value);
        [$whole, $fraction] = explode('.', $value);

        // Moving the fixed decimal point two places is exact. Do not cast this
        // value: small normalized scores such as 0.004 and 0.000001 lose their
        // significant digits when a floating point intermediate is formatted.
        $integer = ltrim($whole.$fraction[0].$fraction[1], '0') ?: '0';

        return $integer.'.'.substr($fraction, 2).'00';
    }

    private static function add(string $left, string $right): string
    {
        $leftDigits = str_replace('.', '', self::normalize($left));
        $rightDigits = str_replace('.', '', self::normalize($right));
        $carry = 0;
        $output = '';
        for ($i = self::SCALE; $i >= 0; $i--) {
            $sum = (int) $leftDigits[$i] + (int) $rightDigits[$i] + $carry;
            $output = ($sum % 10).$output;
            $carry = intdiv($sum, 10);
        }
        if ($carry > 0) {
            throw new InvalidArgumentException('Similarity score exceeds 1.');
        }

        return substr($output, 0, 1).'.'.substr($output, 1);
    }

    public static function multiply(string $left, string $right): string
    {
        return self::truncate(self::multiplyAtScale($left, $right), self::SCALE);
    }

    private static function multiplyAtScale(string $left, string $right): string
    {
        $left = strrev(str_replace('.', '', self::normalize($left)));
        $right = strrev(str_replace('.', '', self::normalize($right)));
        $digits = array_fill(0, strlen($left) + strlen($right), 0);
        for ($i = 0; $i < strlen($left); $i++) {
            for ($j = 0; $j < strlen($right); $j++) {
                $digits[$i + $j] += (int) $left[$i] * (int) $right[$j];
            }
        }
        for ($i = 0; $i < count($digits) - 1; $i++) {
            $digits[$i + 1] += intdiv($digits[$i], 10);
            $digits[$i] %= 10;
        }
        $product = ltrim(strrev(implode('', $digits)), '0') ?: '0';
        $scale = self::SCALE * 2;
        $scaled = str_pad($product, $scale + 1, '0', STR_PAD_LEFT);

        return substr($scaled, 0, -$scale).'.'.substr($scaled, -$scale);
    }

    private static function addAtScale(string $left, string $right, int $scale): string
    {
        $leftDigits = str_replace('.', '', $left);
        $rightDigits = str_replace('.', '', $right);
        $carry = 0;
        $output = '';
        for ($i = $scale; $i >= 0; $i--) {
            $sum = (int) $leftDigits[$i] + (int) $rightDigits[$i] + $carry;
            $output = ($sum % 10).$output;
            $carry = intdiv($sum, 10);
        }
        if ($carry > 0) {
            throw new InvalidArgumentException('Similarity score exceeds 1.');
        }

        return substr($output, 0, 1).'.'.substr($output, 1);
    }

    private static function truncate(string $value, int $scale): string
    {
        [$whole, $fraction] = explode('.', $value, 2);

        return $whole.'.'.substr(str_pad($fraction, $scale, '0'), 0, $scale);
    }
}
