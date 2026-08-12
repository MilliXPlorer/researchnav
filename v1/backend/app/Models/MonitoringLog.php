<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class MonitoringLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['research_document_id', 'performed_by', 'activity_type', 'remarks', 'previous_status', 'new_status', 'monitoring_status', 'activity_date'];

    protected function casts(): array
    {
        return ['activity_date' => 'datetime', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(static fn () => throw new LogicException('Monitoring logs are immutable.'));
        static::deleting(static fn () => throw new LogicException('Monitoring logs are immutable.'));
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by')->withTrashed();
    }
}
