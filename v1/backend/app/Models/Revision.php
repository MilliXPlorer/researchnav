<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Revision extends ConsolidatedReviewModel
{
    protected $table = 'revisions';

    protected static string $reviewType = 'revision';

    protected static array $finalReviewTypes = ['revision_request'];

    protected static array $consolidatedAliases = [
        'requested_by' => 'actor_id',
        'document_file_id' => 'file_id',
        'revision_number' => 'sequence_number',
        'revision_remarks' => 'remarks',
        'revision_status' => 'status',
    ];

    public const STATUSES = ['requested', 'in_progress', 'resubmitted', 'under_review', 'accepted'];

    protected $fillable = ['research_document_id', 'requested_by', 'reviewer_role', 'review_type', 'document_file_id', 'revision_number', 'revision_remarks', 'required_action', 'revision_status', 'requested_at', 'submitted_at', 'reviewed_at', 'resolved_at'];

    public static function column(string $legacyColumn): string
    {
        if ((new static)->usesFinalStorage()) {
            return match ($legacyColumn) {
                'requested_by' => 'reviewer_id',
                'revision_number' => 'id',
                'revision_remarks' => 'remarks',
                'revision_status' => 'status',
                'requested_at' => 'created_at',
                'submitted_at' => 'reviewed_at',
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

    public function setAttribute($key, $value): static
    {
        return parent::setAttribute($this->usesFinalStorage() ? static::column((string) $key) : $key, $value);
    }

    protected function casts(): array
    {
        return ['revision_number' => 'integer', 'sequence_number' => 'integer', 'requested_at' => 'datetime', 'submitted_at' => 'datetime', 'resolved_at' => 'datetime'];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('requested_by'))->withTrashed();
    }

    public function documentFile(): BelongsTo
    {
        return $this->belongsTo(DocumentFile::class, static::column('document_file_id'));
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn(static::column('revision_status'), ['requested', 'in_progress']);
    }
}
