<?php

namespace App\Models;

use App\Services\SimilarityScorePolicy;
use Database\Factories\SimilarityResultFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use InvalidArgumentException;

class SimilarityResult extends Model
{
    use HasFactory;

    public const ANALYSIS_TYPES = ['title', 'document', 'search_retrieval'];

    protected $fillable = [
        'source_research_id', 'matched_research_id', 'source_title', 'matched_title',
        'tfidf_score', 'title_similarity_score', 'content_similarity_score', 'title_weight', 'content_weight', 'score_status',
        'cosine_score', 'fasttext_score', 'final_similarity_score', 'overall_similarity_score', 'classification',
        'overall_flagged', 'title_match_alert', 'adviser_review_required', 'flag_reason', 'threshold',
        'contextual_analysis', 'matched_terms', 'analysis_type', 'algorithm_version',
        'source_content_sha256', 'matched_content_sha256', 'analyzed_at',
    ];

    protected function casts(): array
    {
        return [
            'tfidf_score' => 'decimal:6',
            'title_similarity_score' => 'decimal:12',
            'content_similarity_score' => 'decimal:12',
            'title_weight' => 'decimal:12',
            'content_weight' => 'decimal:12',
            'cosine_score' => 'decimal:12',
            'fasttext_score' => 'decimal:6',
            'final_similarity_score' => 'decimal:12',
            'overall_similarity_score' => 'decimal:12',
            'threshold' => 'decimal:6',
            'is_flagged' => 'boolean', 'overall_flagged' => 'boolean', 'title_match_alert' => 'boolean', 'adviser_review_required' => 'boolean',
            'matched_terms' => 'array',
            'analyzed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $result): void {
            if ($result->source_research_id === $result->matched_research_id) {
                throw new InvalidArgumentException('A research document cannot be compared with itself.');
            }

            $policy = app(SimilarityScorePolicy::class);
            foreach (['title_similarity_score', 'content_similarity_score', 'fasttext_score'] as $attribute) {
                if ($result->{$attribute} !== null) {
                    SimilarityScorePolicy::normalize((string) $result->{$attribute}, $attribute);
                }
            }
            if ($result->algorithm_version === $policy->algorithmVersion()) {
                $calculated = $policy->evaluate($result->title_similarity_score, $result->content_similarity_score);
                foreach (['title_similarity_score', 'content_similarity_score', 'title_weight', 'content_weight', 'overall_similarity_score', 'classification', 'overall_flagged', 'title_match_alert', 'adviser_review_required', 'flag_reason', 'algorithm_version'] as $attribute) {
                    $value = $calculated[$attribute];
                    $result->{$attribute} = $value;
                }
                // Legacy downstream consumers still read this field; it mirrors
                // the new overall flag and is never a review decision itself.
                $result->is_flagged = $result->overall_flagged;
                $result->final_similarity_score = $result->overall_similarity_score;
                $result->cosine_score = $result->overall_similarity_score;
                $result->tfidf_score = $result->overall_similarity_score;
                $result->threshold = $policy->highThreshold();
            } elseif (! $result->exists) {
                // Compatibility for imports created after this expand migration.
                // It deliberately maps only decisions and does not change a
                // legacy score, timestamp, or algorithm version.
                $titleAlert = $result->title_similarity_score !== null
                    && SimilarityScorePolicy::compare((string) $result->title_similarity_score, $policy->titleAlertThreshold()) >= 0;
                $result->overall_flagged = (bool) $result->is_flagged;
                $result->title_match_alert = $titleAlert;
                $result->adviser_review_required = $result->overall_flagged || $titleAlert;
                $result->flag_reason = $result->overall_flagged && $titleAlert
                    ? 'overall_and_title_match'
                    : ($result->overall_flagged ? 'overall_high_similarity' : ($titleAlert ? 'near_exact_title_match' : 'not_flagged'));
            }
        });
    }

    protected static function newFactory(): SimilarityResultFactory
    {
        return SimilarityResultFactory::new();
    }

    public function sourceResearch(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class, 'source_research_id');
    }

    public function matchedResearch(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class, 'matched_research_id');
    }

    public function titleValidations(): HasMany
    {
        return $this->hasMany(TitleValidation::class);
    }

    public function scopeFlagged(Builder $query): Builder
    {
        return $query->where('adviser_review_required', true);
    }

    /** Operational queues use the current decision, while history remains append-only. */
    public function scopeLatestPerPair(Builder $query): Builder
    {
        return $query->whereNotExists(function ($newer): void {
            $newer->selectRaw('1')
                ->from('similarity_results as newer_similarity_results')
                ->whereColumn('newer_similarity_results.source_research_id', 'similarity_results.source_research_id')
                ->whereColumn('newer_similarity_results.matched_research_id', 'similarity_results.matched_research_id')
                ->whereColumn('newer_similarity_results.id', '>', 'similarity_results.id');
        });
    }

    /**
     * Return the persisted canonical decision fields. Legacy rows retain their
     * original score/version; their historic flag is mapped only to the review
     * decision so queues continue to show it after the expand migration.
     *
     * @return array{overall_flagged: bool, title_match_alert: bool, adviser_review_required: bool, flag_reason: string}
     */
    public function canonicalDecision(): array
    {
        $policy = app(SimilarityScorePolicy::class);
        $isCurrent = $this->algorithm_version === $policy->algorithmVersion();
        $overallFlagged = $isCurrent
            ? (bool) $this->overall_flagged
            : ((bool) $this->overall_flagged || (bool) $this->is_flagged);
        $titleAlert = (bool) $this->title_match_alert;

        return [
            'overall_flagged' => $overallFlagged,
            'title_match_alert' => $titleAlert,
            'adviser_review_required' => $overallFlagged || $titleAlert,
            'flag_reason' => $overallFlagged && $titleAlert
                ? 'overall_and_title_match'
                : ($overallFlagged ? 'overall_high_similarity' : ($titleAlert ? 'near_exact_title_match' : 'not_flagged')),
        ];
    }
}
