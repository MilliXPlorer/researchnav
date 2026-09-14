<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\RetentionLog;
use App\Models\User;
use Illuminate\Http\Request;

class RetentionLogService
{
    public function __construct(private readonly AuditService $audit) {}

    public function list(): array
    {
        return RetentionLog::query()
            ->with(['researchDocument:id,title', 'performedBy:id,first_name,middle_name,last_name'])
            ->orderByDesc(RetentionLog::column('activity_date'))
            ->get()
            ->map(fn (RetentionLog $log) => [
                'id' => $log->id,
                'research_document_id' => $log->research_document_id,
                'title' => $log->researchDocument?->title,
                'action' => $log->action,
                'remarks' => $log->remarks,
                'performed_by' => $log->performedBy ? trim(implode(' ', array_filter([
                    $log->performedBy->first_name, $log->performedBy->middle_name, $log->performedBy->last_name,
                ]))) : null,
                'activity_date' => $log->activity_date?->toISOString(),
            ])
            ->all();
    }

    public function record(User $actor, array $data, ?Request $request = null): RetentionLog
    {
        $document = $data['research_document_id'] === null
            ? null
            : ResearchDocument::query()->whereKey($data['research_document_id'])->firstOrFail();
        $log = RetentionLog::query()->create([
            'research_document_id' => $document?->id,
            'performed_by' => $actor->id,
            'action' => $data['action'],
            'remarks' => $data['remarks'] ?? null,
            'activity_date' => now(),
        ]);
        $this->audit->log($actor, 'RETENTION_LOGGED', $log, "Recorded retention action [{$log->action}].", $request);

        return $log->load('researchDocument');
    }
}
