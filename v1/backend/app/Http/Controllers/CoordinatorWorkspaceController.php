<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Models\DefenseSchedule;
use App\Services\DefenseScheduleService;
use App\Services\ReportingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class CoordinatorWorkspaceController extends DomainController
{
    public function schedules(Request $request, DefenseScheduleService $schedules): JsonResponse
    {
        return response()
            ->json(['data' => $schedules->list($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function storeSchedule(Request $request, DefenseScheduleService $schedules): JsonResponse
    {
        $input = $this->validated($request, [
            'research_document_id' => ['required', 'integer', 'exists:research_documents,id'],
            'scheduled_at' => ['required', 'date', 'after:now'],
            'room' => ['nullable', 'string', 'max:150'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $schedule = $schedules->create($this->actor($request), $input, $request);

        return response()->json(['data' => $this->payload($schedule)], 201);
    }

    public function updateSchedule(Request $request, DefenseSchedule $defenseSchedule, DefenseScheduleService $schedules): JsonResponse
    {
        $input = $this->validated($request, [
            'scheduled_at' => ['sometimes', 'date'],
            'room' => ['nullable', 'string', 'max:150'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', 'string'],
        ]);
        if (isset($input['status'])) {
            DefenseScheduleService::guardStatus($input['status']);
        }
        $schedule = $schedules->update($this->actor($request), $defenseSchedule, $input, $request);

        return response()->json(['data' => $this->payload($schedule)]);
    }

    public function duplicateFlags(ReportingService $reports): JsonResponse
    {
        return response()
            ->json(['data' => $reports->duplicateFlags(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function adviserLoad(ReportingService $reports): JsonResponse
    {
        return response()
            ->json(['data' => $reports->adviserLoad(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function reports(ReportingService $reports): JsonResponse
    {
        return response()
            ->json(['data' => $reports->coordinatorProgram()])
            ->header('Cache-Control', 'private, no-store');
    }

    private function payload(DefenseSchedule $schedule): array
    {
        return [
            'id' => $schedule->id,
            'research_document_id' => $schedule->research_document_id,
            'title' => $schedule->researchDocument?->title,
            'submission_status' => $schedule->researchDocument?->submission_status,
            'research_stage' => $schedule->researchDocument?->research_stage,
            'scheduled_at' => $schedule->scheduled_at?->toISOString(),
            'room' => $schedule->room,
            'notes' => $schedule->notes,
            'status' => $schedule->status,
        ];
    }

    /** @param array<string, array<int, string>> $rules @return array<string, string> */
    private function validated(Request $request, array $rules): array
    {
        $validator = Validator::make($request->json()->all(), $rules);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }

        return $validator->validated();
    }
}
