<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TitleValidation extends ConsolidatedReviewModel
{
    protected $table = 'title_validations';

    protected static string $reviewType = 'title_validation';

    protected static array $finalReviewTypes = ['title_validation', 'recommendation'];

    protected static array $consolidatedAliases = [
        'validated_by' => 'actor_id',
        'validation_status' => 'status',
        'adviser_remarks' => 'remarks',
    ];

    public const STATUSES = ['pending', 'approved', 'revision_required', 'rejected'];

    protected $fillable = ['research_document_id', 'similarity_result_id', 'validated_by', 'reviewer_role', 'review_type', 'validation_status', 'adviser_remarks', 'validated_at'];

    public static function column(string $legacyColumn): string
    {
        if ((new static)->usesFinalStorage()) {
            return match ($legacyColumn) {
                'validated_by' => 'reviewer_id',
                'validation_status' => 'status',
                'adviser_remarks' => 'remarks',
                'validated_at' => 'reviewed_at',
                default => $legacyColumn,
            };
        }

        return parent::column($legacyColumn);
    }

    public function getAttribute($key): mixed
    {
        if ($this->usesFinalStorage()) {
            $key = static::column((string) $key);
            if ($key === 'similarity_result_id') {
                return null;
            }
        }

        return parent::getAttribute($key);
    }

    public function setAttribute($key, $value): static
    {
        if ($this->usesFinalStorage() && $key === 'similarity_result_id') {
            return $this;
        }

        return parent::setAttribute($this->usesFinalStorage() ? static::column((string) $key) : $key, $value);
    }

    protected function casts(): array
    {
        return ['validated_at' => 'datetime'];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('validated_by'))->withTrashed();
    }

    public function similarityResult(): BelongsTo
    {
        return $this->belongsTo(SimilarityResult::class);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where(static::column('validation_status'), 'pending');
    }
}
