<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TitleValidation extends Model
{
    public const STATUSES = ['pending', 'approved', 'revision_required', 'rejected'];

    protected $fillable = ['research_document_id', 'similarity_result_id', 'validated_by', 'validation_status', 'adviser_remarks', 'validated_at'];

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
        return $this->belongsTo(User::class, 'validated_by')->withTrashed();
    }

    public function similarityResult(): BelongsTo
    {
        return $this->belongsTo(SimilarityResult::class);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('validation_status', 'pending');
    }
}
