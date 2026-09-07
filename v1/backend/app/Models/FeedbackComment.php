<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeedbackComment extends ConsolidatedReviewModel
{
    protected $table = 'feedback_comments';

    protected static string $reviewType = 'feedback';

    protected static array $finalReviewTypes = ['comment', 'suggestion', 'approval_remark', 'general_feedback'];

    protected static array $consolidatedAliases = [
        'user_id' => 'actor_id',
        'document_file_id' => 'file_id',
        'comment' => 'remarks',
        'feedback_status' => 'status',
    ];

    public static function column(string $legacyColumn): string
    {
        if ((new static)->usesFinalStorage()) {
            return match ($legacyColumn) {
                'user_id' => 'reviewer_id',
                'comment' => 'remarks',
                'feedback_type' => 'review_type',
                'feedback_status' => 'status',
                default => $legacyColumn,
            };
        }

        return parent::column($legacyColumn);
    }

    public function getAttribute($key): mixed
    {
        if ($this->usesFinalStorage()) {
            $key = static::column((string) $key);
        }

        return parent::getAttribute($key);
    }

    public const FEEDBACK_TYPES = ['comment', 'suggestion', 'revision_request', 'approval_remark', 'general_feedback'];

    public const FEEDBACK_STATUSES = ['open', 'acknowledged', 'resolved'];

    protected $fillable = ['research_document_id', 'user_id', 'reviewer_role', 'document_file_id', 'comment', 'feedback_type', 'review_type', 'feedback_status', 'reviewed_at', 'researcher_acknowledged_at', 'researcher_addressed_at', 'researcher_action_remarks'];

    public function setAttribute($key, $value): static
    {
        return parent::setAttribute($this->usesFinalStorage() ? static::column((string) $key) : $key, $value);
    }

    protected function casts(): array
    {
        return ['researcher_acknowledged_at' => 'datetime', 'researcher_addressed_at' => 'datetime'];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('user_id'))->withTrashed();
    }

    public function documentFile(): BelongsTo
    {
        return $this->belongsTo(DocumentFile::class, static::column('document_file_id'));
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where(static::column('feedback_status'), 'open');
    }
}
