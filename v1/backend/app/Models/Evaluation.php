<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Evaluation extends ConsolidatedReviewModel
{
    protected $table = 'evaluations';

    protected static string $reviewType = 'evaluation';

    protected static array $consolidatedAliases = [
        'panelist_id' => 'actor_id',
        'comments' => 'remarks',
    ];

    protected $fillable = ['research_document_id', 'panelist_id', 'originality', 'methodology', 'clarity', 'comments', 'submitted_at'];

    protected function casts(): array
    {
        return [
            'originality' => 'integer',
            'methodology' => 'integer',
            'clarity' => 'integer',
            'submitted_at' => 'datetime',
        ];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function panelist(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('panelist_id'))->withTrashed();
    }
}
