<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Sdg extends Model
{
    public $timestamps = false;

    protected $fillable = ['id', 'code', 'title', 'short_title', 'color_hex'];

    public function researchDocuments(): BelongsToMany
    {
        return $this->belongsToMany(ResearchDocument::class, 'research_document_sdgs');
    }
}
