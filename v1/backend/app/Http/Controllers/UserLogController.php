<?php

namespace App\Http\Controllers;

use App\Http\Resources\AdminAuditLogResource;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserLogController extends DomainController
{
    public function index(Request $request): JsonResponse
    {
        $actor = $this->actor($request);

        $query = AuditLog::query()
            ->with('user:id,email')
            ->where(AuditLog::column('user_id'), $actor->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        return AdminAuditLogResource::collection(
            $query->paginate(25)
        )
            ->response()
            ->header('Cache-Control', 'private, no-store');
    }
}