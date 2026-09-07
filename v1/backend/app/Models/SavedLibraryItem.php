<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SavedLibraryItem extends Model
{
    protected $fillable = ['user_id', 'research_document_id'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }
}
