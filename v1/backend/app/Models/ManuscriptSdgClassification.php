<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ManuscriptSdgClassification extends Model
{
    protected $fillable = [
        'manuscript_search_document_id',
        'detector_version',
        'projection_indexed_at',
        'classified_at',
    ];

    protected function casts(): array
    {
        return [
            'projection_indexed_at' => 'datetime',
            'classified_at' => 'datetime',
        ];
    }

    public function manuscriptSearchDocument(): BelongsTo
    {
        return $this->belongsTo(ManuscriptSearchDocument::class);
    }

    public function detections(): HasMany
    {
        return $this->hasMany(ManuscriptSdgDetection::class);
    }
}
