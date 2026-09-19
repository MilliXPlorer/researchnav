<?php

namespace App\Http\Controllers;

use App\Http\Requests\UserLogIndexRequest;
use App\Http\Resources\AdminAuditLogResource;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;

class UserLogController extends DomainController
{
    public function index(UserLogIndexRequest $request): JsonResponse
    {
        $actor = $this->actor($request);
        $input = $request->validated();

        $query = AuditLog::query()
            ->with('user:id,email')
            ->where(AuditLog::column('user_id'), $actor->id)
            ->when(
                $actor->user_logs_cleared_at,
                fn ($query, $cutoff) => $query->where('created_at', '>', $cutoff),
            )
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if (($search = trim($input['search'] ?? '')) !== '') {
            $like = $this->like($search);
            $normalizedLike = $this->like(preg_replace('/\s+/', '_', $search) ?? $search);

            $query->where(function ($query) use ($like, $normalizedLike): void {
                $query
                    ->whereRaw("action LIKE ? ESCAPE '!'", [$normalizedLike])
                    ->orWhereRaw("entity_type LIKE ? ESCAPE '!'", [$normalizedLike])
                    ->orWhereRaw("entity_id LIKE ? ESCAPE '!'", [$like])
                    ->orWhereRaw("description LIKE ? ESCAPE '!'", [$like]);
            });
        }
        if (($from = $input['created_from'] ?? null) !== null) {
            $query->where('created_at', '>=', Carbon::parse($from)->startOfDay());
        }
        if (($to = $input['created_to'] ?? null) !== null) {
            $query->where('created_at', '<=', Carbon::parse($to)->endOfDay());
        }

        return AdminAuditLogResource::collection(
            $query->paginate(25)->appends($input)
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

    private function like(string $value): string
    {
        return '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value).'%';
    }
}
