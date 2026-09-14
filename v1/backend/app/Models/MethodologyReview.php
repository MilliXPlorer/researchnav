<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MethodologyReview extends ConsolidatedReviewModel
{
    protected $table = 'methodology_reviews';

    protected static string $reviewType = 'methodology_review';

    protected static array $finalReviewTypes = ['statistical_review', 'statistical_clearance', 'statistical_not_applicable'];

    protected static array $consolidatedAliases = [
        'statistician_id' => 'actor_id',
        'review_status' => 'status',
    ];

    public const STATUSES = ['pending', 'in_progress', 'signed_off', 'returned_for_clarification'];

    protected $fillable = [
        'research_document_id', 'statistician_id', 'reviewer_role', 'review_type', 'remarks', 'required_action', 'review_status', 'signed_off_at', 'reviewed_at',
    ];

    public static function column(string $legacyColumn): string
    {
        if ((new static)->usesFinalStorage()) {
            return match ($legacyColumn) {
                'statistician_id' => 'reviewer_id', 'review_status' => 'status', 'signed_off_at' => 'reviewed_at',
                default => $legacyColumn,
            };
        }

        return parent::column($legacyColumn);
    }

    public function getAttribute($key): mixed
    {
        if ($this->usesFinalStorage() && in_array($key, ['design_fit', 'sample_size', 'instrument_validity', 'analysis_plan'], true)) {
            return data_get(json_decode((string) parent::getAttribute('remarks'), true), 'checklist.'.$key);
        }

        return parent::getAttribute($this->usesFinalStorage() ? static::column((string) $key) : $key);
    }

    public function setAttribute($key, $value): static
    {
        return parent::setAttribute($this->usesFinalStorage() ? static::column((string) $key) : $key, $value);
    }

    protected function casts(): array
    {
        return [
            'design_fit' => 'boolean',
            'sample_size' => 'boolean',
            'instrument_validity' => 'boolean',
            'analysis_plan' => 'boolean',
            'signed_off_at' => 'datetime',
        ];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function statistician(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('statistician_id'))->withTrashed();
    }
}
