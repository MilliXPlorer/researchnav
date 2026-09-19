<?php

namespace App\Http\Controllers;

use App\Http\Resources\AdminAuditLogResource;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class UserLogController extends DomainController
{
    public function index(Request $request): JsonResponse
    {
        $actor = $this->actor($request);

        $query = AuditLog::query()
            ->with('user:id,email')
            ->where(AuditLog::column('user_id'), $actor->id)
            ->when(
                $actor->user_logs_cleared_at,
                fn ($query, $cutoff) => $query->where('created_at', '>', $cutoff),
            )
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        return AdminAuditLogResource::collection(
            $query->paginate(25)
        )
            ->response()
            ->header('Cache-Control', 'private, no-store');
    }

    public function clear(Request $request): Response
    {
        $actor = $this->actor($request);

        $actor->forceFill([
            'user_logs_cleared_at' => now(),
        ])->save();

        return response()->noContent();
    }
}