<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AuditService
{
    public function log(?User $user, string $action, object|string|null $entity, ?string $description, ?Request $request = null): AuditLog
    {
        return AuditLog::query()->create([
            'user_id' => $user?->id,
            'action' => $action,
            'entity_type' => is_object($entity) ? $entity::class : $entity,
            'entity_id' => is_object($entity) && isset($entity->id) ? (string) $entity->id : null,
            // Callers deliberately provide a human description, never request payloads.
            'description' => $description,
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
        ]);
    }
}
