<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class MonitoringLog extends ConsolidatedActivityModel
{
    protected $table = 'monitoring_logs';

    protected static string $activityStream = 'research';

    protected static array $consolidatedAliases = [
        'performed_by' => 'actor_id',
        'activity_type' => 'action',
        'activity_date' => 'occurred_at',
    ];

    public $timestamps = false;

    protected $fillable = ['research_document_id', 'performed_by', 'activity_type', 'remarks', 'previous_status', 'new_status', 'monitoring_status', 'activity_date'];

    protected function casts(): array
    {
        return ['activity_date' => 'datetime', 'occurred_at' => 'datetime', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        parent::booted();
        static::updating(static fn () => throw new LogicException('Monitoring logs are immutable.'));
        static::deleting(static fn () => throw new LogicException('Monitoring logs are immutable.'));
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('performed_by'))->withTrashed();
    }
}
