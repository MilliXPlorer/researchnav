<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class PrivacyLog extends ConsolidatedActivityModel
{
    protected $table = 'privacy_logs';

    protected static string $activityStream = 'privacy';

    protected static array $consolidatedAliases = [
        'user_id' => 'subject_user_id',
        'performed_by' => 'actor_id',
        'details' => 'description',
        'activity_date' => 'occurred_at',
    ];

    public const ACTIONS = ['consent_recorded', 'consent_withdrawn', 'consent_log_requested', 'data_export'];

    public $timestamps = false;

    protected $fillable = ['user_id', 'performed_by', 'action', 'details', 'activity_date'];

    protected function casts(): array
    {
        return ['activity_date' => 'datetime', 'occurred_at' => 'datetime', 'created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        parent::booted();
        static::updating(static fn () => throw new LogicException('Privacy logs are immutable.'));
        static::deleting(static fn () => throw new LogicException('Privacy logs are immutable.'));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('user_id'))->withTrashed();
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('performed_by'))->withTrashed();
    }
}
