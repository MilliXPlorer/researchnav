<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MetadataReview extends ConsolidatedReviewModel
{
    protected $table = 'metadata_reviews';

    protected static string $reviewType = 'metadata_review';

    protected static array $consolidatedAliases = [
        'reviewed_by' => 'actor_id',
        'review_status' => 'status',
    ];

    public const STATUSES = ['pending', 'complete', 'needs_correction'];

    protected $fillable = [
        'research_document_id', 'reviewed_by', 'title_complete', 'abstract_complete', 'authors_complete',
        'keywords_complete', 'category_complete', 'notes', 'review_status',
    ];

    protected function casts(): array
    {
        return [
            'title_complete' => 'boolean',
            'abstract_complete' => 'boolean',
            'authors_complete' => 'boolean',
            'keywords_complete' => 'boolean',
            'category_complete' => 'boolean',
        ];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function reviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('reviewed_by'))->withTrashed();
    }
}
