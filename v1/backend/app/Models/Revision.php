<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Revision extends Model
{
    public const STATUSES = ['requested', 'in_progress', 'resubmitted', 'under_review', 'accepted'];

    protected $fillable = ['research_document_id', 'requested_by', 'document_file_id', 'revision_number', 'revision_remarks', 'revision_status', 'requested_at', 'submitted_at', 'resolved_at'];

    protected function casts(): array
    {
        return ['revision_number' => 'integer', 'requested_at' => 'datetime', 'submitted_at' => 'datetime', 'resolved_at' => 'datetime'];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by')->withTrashed();
    }

    public function documentFile(): BelongsTo
    {
        return $this->belongsTo(DocumentFile::class);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('revision_status', ['requested', 'in_progress']);
    }
}
