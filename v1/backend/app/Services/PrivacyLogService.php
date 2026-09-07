<?php

namespace App\Services;

use App\Models\PrivacyLog;
use App\Models\User;
use Illuminate\Http\Request;

class PrivacyLogService
{
    public function __construct(private readonly AuditService $audit) {}

    public function list(): array
    {
        return PrivacyLog::query()
            ->with(['user:id,email,first_name,middle_name,last_name', 'performedBy:id,email,first_name,middle_name,last_name'])
            ->orderByDesc(PrivacyLog::column('activity_date'))
            ->get()
            ->map(fn (PrivacyLog $log) => [
                'id' => $log->id,
                'user' => $log->user === null ? null : [
                    'id' => $log->user->id,
                    'email' => $log->user->email,
                    'name' => trim(implode(' ', array_filter([$log->user->first_name, $log->user->middle_name, $log->user->last_name]))),
                ],
                'action' => $log->action,
                'details' => $log->details,
                'performed_by' => $log->performedBy === null ? null : trim(implode(' ', array_filter([
                    $log->performedBy->first_name, $log->performedBy->middle_name, $log->performedBy->last_name,
                ]))),
                'activity_date' => $log->activity_date?->toISOString(),
            ])
            ->all();
    }

    public function record(User $actor, array $data, ?Request $request = null): PrivacyLog
    {
        $log = PrivacyLog::query()->create([
            'user_id' => $data['user_id'] ?? null,
            'performed_by' => $actor->id,
            'action' => $data['action'],
            'details' => $data['details'] ?? null,
            'activity_date' => now(),
        ]);
        $this->audit->log($actor, 'PRIVACY_LOGGED', $log, "Recorded data privacy action [{$log->action}].", $request);

        return $log->load('user');
    }
}
