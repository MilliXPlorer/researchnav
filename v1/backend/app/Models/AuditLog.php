<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class AuditLog extends ConsolidatedActivityModel
{
    protected $table = 'audit_logs';

    protected static string $activityStream = 'audit';

    protected static array $consolidatedAliases = [
        'user_id' => 'actor_id',
    ];

    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'action', 'entity_type', 'entity_id', 'description', 'ip_address', 'user_agent'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        parent::booted();
        static::updating(static fn () => throw new LogicException('Audit logs are immutable.'));
        static::deleting(static fn () => throw new LogicException('Audit logs are immutable.'));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('user_id'))->withTrashed();
    }
}
