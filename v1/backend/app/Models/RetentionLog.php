<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class RetentionLog extends ConsolidatedActivityModel
{
    protected $table = 'retention_logs';

    protected static string $activityStream = 'retention';

    protected static array $consolidatedAliases = [
        'performed_by' => 'actor_id',
        'activity_date' => 'occurred_at',
    ];

    public const ACTIONS = ['version_kept', 'version_superseded', 'final_archived', 'unpublished', 'removed'];

    public $timestamps = false;

    protected $fillable = ['research_document_id', 'performed_by', 'action', 'remarks', 'activity_date'];

    protected function casts(): array
    {
        return ['activity_date' => 'datetime', 'occurred_at' => 'datetime', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        parent::booted();
        static::updating(static fn () => throw new LogicException('Retention logs are immutable.'));
        static::deleting(static fn () => throw new LogicException('Retention logs are immutable.'));
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
