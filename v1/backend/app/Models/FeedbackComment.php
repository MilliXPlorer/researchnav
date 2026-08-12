<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeedbackComment extends Model
{
    public const FEEDBACK_TYPES = ['comment', 'suggestion', 'revision_request', 'approval_remark', 'general_feedback'];

    public const FEEDBACK_STATUSES = ['open', 'acknowledged', 'resolved'];

    protected $fillable = ['research_document_id', 'user_id', 'document_file_id', 'comment', 'feedback_type', 'feedback_status'];

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    public function documentFile(): BelongsTo
    {
        return $this->belongsTo(DocumentFile::class);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('feedback_status', 'open');
    }
}
