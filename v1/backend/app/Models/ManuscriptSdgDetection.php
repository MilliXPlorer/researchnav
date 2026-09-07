<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ManuscriptSdgDetection extends Model
{
    protected $fillable = [
        'manuscript_sdg_classification_id',
        'sdg_number',
    ];

    protected function casts(): array
    {
        return [
            'sdg_number' => 'integer',
        ];
    }

    public function classification(): BelongsTo
    {
        return $this->belongsTo(ManuscriptSdgClassification::class, 'manuscript_sdg_classification_id');
    }

    public function sustainableDevelopmentGoal(): BelongsTo
    {
        return $this->belongsTo(SustainableDevelopmentGoal::class, 'sdg_number', 'number');
    }
}
