<?php

namespace App\Http\Controllers;

use App\Http\Resources\AccessRequestResource;
use App\Models\AccessRequest;
use App\Services\AccessRequestException;
use App\Services\AccessRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Workspace access requests.
 *
 * Google remains the only way to authenticate. These endpoints let an already
 * authenticated account without a role ask for one, and let an administrator
 * approve or reject that request.
 */
class AccessRequestController extends DomainController
{
    /** The applicant's own latest request, so they can see its status. */
    public function mine(Request $request): JsonResponse
    {
        $latest = app(AccessRequestService::class)->latestFor($this->actor($request));

        return response()
            ->json(['data' => $latest === null ? null : new AccessRequestResource($latest)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request, AccessRequestService $service): JsonResponse
    {
        $data = $this->validated($request, [
            'requested_role' => ['required', 'string', 'in:'.implode(',', AccessRequestService::REQUESTABLE_ROLES)],
            'full_name' => ['nullable', 'string', 'max:180'],
            'program' => ['nullable', 'string', 'max:180'],
            'justification' => ['nullable', 'string', 'max:1000'],
        ]);

        try {
            $accessRequest = $service->submit($this->actor($request), $data, $request);
        } catch (AccessRequestException $exception) {
            return response()->json(['error' => $exception->error], 409);
        }

        return (new AccessRequestResource($accessRequest))
            ->response()
            ->setStatusCode(201)
            ->header('Cache-Control', 'private, no-store');
    }

    public function index(Request $request): JsonResponse
    {
        $data = $this->validated($request, [
            'status' => ['nullable', 'string', 'in:'.implode(',', AccessRequest::STATUSES)],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);

        $requests = app(AccessRequestService::class)
            ->paginate($data['status'] ?? null, $data['per_page'] ?? 25)
            ->appends($request->query());

        return AccessRequestResource::collection($requests)
            ->response()
            ->header('Cache-Control', 'private, no-store');
    }

    public function decide(Request $request, string $accessRequest, AccessRequestService $service): JsonResponse
    {
        $data = $this->validated($request, [
            'decision' => ['required', 'string', 'in:approve,reject'],
            'granted_role' => ['nullable', 'string', 'in:'.implode(',', AccessRequestService::REQUESTABLE_ROLES)],
            'decision_remarks' => ['nullable', 'string', 'max:1000'],
        ]);

        try {
            $decided = $service->decide($this->actor($request), $accessRequest, $data, $request);
        } catch (AccessRequestException $exception) {
            return response()->json(['error' => $exception->error], 409);
        }

        return (new AccessRequestResource($decided))
            ->response()
            ->header('Cache-Control', 'private, no-store');
    }

    /** @param array<string, array<int, string>> $rules */
    private function validated(Request $request, array $rules): array
    {
        $validator = Validator::make($request->all(), $rules);

        if ($validator->fails()) {
            abort(422, $validator->errors()->first());
        }

        return $validator->validated();
    }
}
