<?php

namespace App\Models;

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

    public const FLAG_THRESHOLD = '0.700000';

    public const ANALYSIS_TYPES = ['title', 'document', 'search_retrieval'];

    protected $fillable = [
        'source_research_id', 'matched_research_id', 'source_title', 'matched_title',
        'tfidf_score', 'cosine_score', 'fasttext_score', 'final_similarity_score', 'threshold',
        'contextual_analysis', 'matched_terms', 'analysis_type', 'analyzed_at',
    ];

    protected function casts(): array
    {
        return [
            'tfidf_score' => 'decimal:6',
            'cosine_score' => 'decimal:6',
            'fasttext_score' => 'decimal:6',
            'final_similarity_score' => 'decimal:6',
            'threshold' => 'decimal:6',
            'is_flagged' => 'boolean',
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

            foreach (['tfidf_score', 'cosine_score', 'fasttext_score', 'final_similarity_score', 'threshold'] as $attribute) {
                if ($result->{$attribute} !== null && ((float) $result->{$attribute} < 0 || (float) $result->{$attribute} > 1)) {
                    throw new InvalidArgumentException('Similarity scores and thresholds must be normalized between 0 and 1.');
                }
            }

            // This is a storage/compliance rule only; it never drives a
            // validation or submission decision.
            $result->threshold = self::FLAG_THRESHOLD;
            $result->is_flagged = (float) $result->final_similarity_score >= (float) self::FLAG_THRESHOLD;
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
        return $query->where('is_flagged', true);
    }
}
