<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeedbackAttachment extends Model
{
    protected $fillable = [
        'feedback_comment_id',
        'research_document_id',
        'uploaded_by',
        'original_filename',
        'stored_filename',
        'file_path',
        'file_extension',
        'mime_type',
        'file_size',
    ];

    protected function casts(): array
    {
        return ['file_size' => 'integer'];
    }

    public function feedbackComment(): BelongsTo
    {
        return $this->belongsTo(FeedbackComment::class, 'feedback_comment_id');
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
