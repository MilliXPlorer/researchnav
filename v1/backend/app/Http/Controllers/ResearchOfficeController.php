<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Models\ComplianceReview;
use App\Models\PrivacyLog;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\ComplianceService;
use App\Services\PrivacyLogService;
use App\Services\ReportingService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ResearchOfficeController extends DomainController
{
    public function compliance(ComplianceService $compliance): JsonResponse
    {
        return response()
            ->json(['data' => $compliance->pendingQueue(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function decideCompliance(Request $request, ResearchDocument $researchDocument, ComplianceService $compliance): JsonResponse
    {
        $input = $this->validated($request, [
            'format_compliant' => ['nullable', 'boolean'],
            'attachments_compliant' => ['nullable', 'boolean'],
            'consent_forms_compliant' => ['nullable', 'boolean'],
            'remarks' => ['nullable', 'string', 'max:5000'],
            'review_status' => ['required', 'string'],
        ]);
        ComplianceService::guardStatus($input['review_status']);
        if ($input['review_status'] === 'pending') {
            return response()->json(['error' => 'INVALID_REVIEW_STATUS'], 422);
        }
        $review = $compliance->decide($this->actor($request), $researchDocument, $input, $request);

        return response()->json(['data' => $this->payload($review)]);
    }

    public function users(Request $request): JsonResponse
    {
        $input = $this->validated($request, [
            'search' => ['nullable', 'string', 'max:200'],
            'role' => ['nullable', 'string', 'max:50'],
            'access_status' => ['nullable', 'string', 'max:20'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $query = User::query()
            ->select(['id', 'email', 'first_name', 'middle_name', 'last_name', 'role', 'access_status', 'created_at', 'updated_at'])
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if (isset($input['role']) && $input['role'] !== '') {
            $query->where('role', $input['role']);
        }
        if (isset($input['access_status']) && $input['access_status'] !== '') {
            $query->where('access_status', $input['access_status']);
        }
        if (isset($input['search']) && $input['search'] !== '') {
            $like = '%'.$this->escapedLike($input['search']).'%';
            $query->where(function (Builder $query) use ($like): void {
                foreach (['email', 'first_name', 'middle_name', 'last_name'] as $column) {
                    $query->orWhereRaw("{$column} LIKE ? ESCAPE '!'", [$like]);
                }
            });
        }

        return response()
            ->json([
                'data' => $query->paginate($input['per_page'] ?? 25)->appends($request->query()),
                'schema_version' => 1,
            ])
            ->header('Cache-Control', 'private, no-store');
    }

    public function updateUser(Request $request, string $user): JsonResponse
    {
        $input = $this->validated($request, [
            'access_status' => ['required', 'string', 'max:20'],
        ]);
        $target = User::query()->find($user);
        if ($target === null) {
            return response()->json(['error' => 'NOT_FOUND'], 404);
        }
        if (! in_array($input['access_status'], User::ACCESS_STATUSES, true)) {
            return response()->json(['error' => 'INVALID_ACCESS_STATUS'], 422);
        }
        $actor = $this->actor($request);
        if ($actor->is($target) || $target->role === 'admin') {
            return response()->json(['error' => 'ACCOUNT_MUTATION_NOT_ALLOWED'], 409);
        }
        $target->update(['access_status' => $input['access_status']]);

        return response()
            ->json(['data' => [
                'id' => $target->id,
                'email' => $target->email,
                'role' => $target->role,
                'access_status' => $target->access_status,
            ]])
            ->header('Cache-Control', 'private, no-store');
    }

    public function reports(ReportingService $reports): JsonResponse
    {
        return response()
            ->json(['data' => $reports->officeInstitutional()])
            ->header('Cache-Control', 'private, no-store');
    }

    public function privacyLogs(PrivacyLogService $logs): JsonResponse
    {
        return response()
            ->json(['data' => $logs->list(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function recordPrivacyLog(Request $request, PrivacyLogService $logs): JsonResponse
    {
        $input = $this->validated($request, [
            'user_id' => ['nullable', 'string', 'max:36', 'exists:users,id'],
            'action' => ['required', 'string', 'max:100'],
            'details' => ['nullable', 'string', 'max:5000'],
        ]);
        if (! in_array($input['action'], PrivacyLog::ACTIONS, true)) {
            return response()->json(['error' => 'INVALID_ACTION'], 422);
        }
        $log = $logs->record($this->actor($request), $input, $request);

        return response()->json(['data' => $this->privacyPayload($log)], 201);
    }

    private function payload(ComplianceReview $review): array
    {
        return [
            'id' => $review->id,
            'research_document_id' => $review->research_document_id,
            'title' => $review->researchDocument?->title,
            'format_compliant' => $review->format_compliant,
            'attachments_compliant' => $review->attachments_compliant,
            'consent_forms_compliant' => $review->consent_forms_compliant,
            'remarks' => $review->remarks,
            'review_status' => $review->review_status,
            'decided_at' => $review->decided_at?->toISOString(),
        ];
    }

    private function privacyPayload(PrivacyLog $log): array
    {
        return [
            'id' => $log->id,
            'user_id' => $log->user_id,
            'action' => $log->action,
            'details' => $log->details,
            'activity_date' => $log->activity_date?->toISOString(),
        ];
    }

    private function escapedLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
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
