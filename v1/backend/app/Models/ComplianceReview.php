<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComplianceReview extends ConsolidatedReviewModel
{
    protected $table = 'compliance_reviews';

    protected static string $reviewType = 'compliance_review';

    protected static array $consolidatedAliases = [
        'reviewed_by' => 'actor_id',
        'review_status' => 'status',
    ];

    public const STATUSES = ['pending', 'endorsed', 'returned'];

    protected $fillable = [
        'research_document_id', 'reviewed_by', 'format_compliant', 'attachments_compliant',
        'consent_forms_compliant', 'remarks', 'review_status', 'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'format_compliant' => 'boolean',
            'attachments_compliant' => 'boolean',
            'consent_forms_compliant' => 'boolean',
            'decided_at' => 'datetime',
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
