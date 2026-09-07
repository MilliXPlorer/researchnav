<?php

namespace App\Http\Controllers;

use App\Http\Requests\AdminAuditLogIndexRequest;
use App\Http\Requests\AdminUserIndexRequest;
use App\Http\Requests\UpdateAdminUserRequest;
use App\Http\Resources\AdminAuditLogResource;
use App\Http\Resources\AdminUserResource;
use App\Models\AuditLog;
use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\AdminUserMutationException;
use App\Services\AdminUserService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Throwable;

class AdminController extends DomainController
{
    public function users(AdminUserIndexRequest $request): JsonResponse
    {
        $input = $request->validated();
        $query = User::query()->select(['id', 'email', 'student_employee_id', 'first_name', 'middle_name', 'last_name', 'role', 'access_status', 'is_admin', 'invitation_sent_at', 'confirmed_at', 'last_login_at', 'created_at', 'updated_at'])->orderByDesc('created_at')->orderByDesc('id');
        if (($role = $input['role'] ?? null) !== null) {
            $query->where('role', $role);
        }
        if (($status = $input['access_status'] ?? null) !== null) {
            $query->where('access_status', $status);
        }
        if (($search = $input['search'] ?? null) !== null && $search !== '') {
            $like = '%'.$this->escapedLike($search).'%';
            $query->where(function (Builder $query) use ($like): void {
                foreach (['email', 'student_employee_id', 'first_name', 'middle_name', 'last_name'] as $column) {
                    $query->orWhereRaw("{$column} LIKE ? ESCAPE '!'", [$like]);
                }
            });
        }

        return AdminUserResource::collection($query->paginate($input['per_page'] ?? 25)->appends($request->query()))->response()->header('Cache-Control', 'private, no-store');
    }

    public function updateUser(UpdateAdminUserRequest $request, string $user, AdminUserService $users): JsonResponse
    {
        try {
            $updated = $users->update($this->actor($request), $user, $request->validated(), $request);
        } catch (AdminUserMutationException $exception) {
            return response()->json(['error' => $exception->error], 409);
        }

        return (new AdminUserResource($updated))->response()->header('Cache-Control', 'private, no-store');
    }

    public function auditLogs(AdminAuditLogIndexRequest $request): JsonResponse
    {
        $input = $request->validated();
        $query = AuditLog::query()->with('user:id,email')->orderByDesc('created_at')->orderByDesc('id');
        if (($action = $input['action'] ?? null) !== null) {
            $query->where('action', $action);
        }
        if (($actor = $input['actor_id'] ?? null) !== null) {
            $query->where(AuditLog::column('user_id'), $actor);
        }
        if (($from = $input['created_from'] ?? null) !== null) {
            $query->whereDate('created_at', '>=', $from);
        }
        if (($to = $input['created_to'] ?? null) !== null) {
            $query->whereDate('created_at', '<=', $to);
        }

        return AdminAuditLogResource::collection($query->paginate($input['per_page'] ?? 25)->appends($request->query()))->response()->header('Cache-Control', 'private, no-store');
    }

    public function systemStatus(): JsonResponse
    {
        try {
            $databaseDriver = DB::connection()->getDriverName();
            $accessStatuses = User::query()
                ->selectRaw('access_status, COUNT(*) as aggregate')
                ->groupBy('access_status')
                ->pluck('aggregate', 'access_status');
            $appliedMigrations = DB::table('migrations')->count();
            $availableMigrations = count(File::glob(database_path('migrations/*.php')));
            $counts = [
                'users' => [
                    'total' => User::query()->count(),
                    'access_statuses' => [
                        'active' => (int) ($accessStatuses['active'] ?? 0),
                        'invited' => (int) ($accessStatuses['invited'] ?? 0),
                        'blocked' => (int) ($accessStatuses['blocked'] ?? 0),
                    ],
                    'administrators' => User::query()->where('role', 'admin')->where('is_admin', true)->count(),
                    'coordinators' => User::query()->where('role', 'coordinator')->count(),
                ],
                'audit_logs' => AuditLog::query()->count(),
                'research_documents' => ResearchDocument::query()->count(),
                'notifications' => DB::table('notifications')->count(),
                'document_files' => DocumentFile::query()->count(),
                'document_file_bytes' => (int) DocumentFile::query()->sum('file_size'),
            ];
            $migrations = [
                'applied' => $appliedMigrations,
                'available' => $availableMigrations,
                'pending' => max(0, $availableMigrations - $appliedMigrations),
            ];
            $databaseStatus = 'operational';
        } catch (Throwable) {
            $databaseDriver = null;
            $counts = [
                'users' => ['total' => null, 'access_statuses' => ['active' => null, 'invited' => null, 'blocked' => null], 'administrators' => null, 'coordinators' => null],
                'audit_logs' => null,
                'research_documents' => null,
                'notifications' => null,
                'document_files' => null,
                'document_file_bytes' => null,
            ];
            $migrations = ['applied' => null, 'available' => null, 'pending' => null];
            $databaseStatus = 'unavailable';
        }

        $storage = $this->privateStorageStatus();
        $issues = [];
        if ($databaseStatus !== 'operational') {
            $issues[] = 'database_unavailable';
        }
        if ($storage['status'] !== 'operational') {
            $issues[] = 'storage.researchnav_private_unavailable';
        }

        return response()->json(['data' => [
            'schema_version' => 1,
            'checked_at' => now()->toISOString(),
            'overall' => $issues === [] ? 'operational' : 'degraded',
            'issues' => $issues,
            'runtime' => [
                'environment' => app()->environment(),
                'debug_enabled' => (bool) config('app.debug'),
                'php_version' => PHP_VERSION,
                'framework_version' => app()->version(),
            ],
            'database' => [
                'driver' => $databaseDriver,
                'status' => $databaseStatus,
                'counts' => $counts,
                'migrations' => $migrations,
            ],
            'storage' => ['private' => $storage],
        ]])->header('Cache-Control', 'private, no-store');
    }

    /** @return array{disk: string, driver: mixed, status: string, capabilities: ?array{read: bool, write: bool, delete: bool}} */
    private function privateStorageStatus(): array
    {
        $diskName = 'researchnav_private';
        $probe = '.researchnav-status-'.bin2hex(random_bytes(8));
        $disk = Storage::disk($diskName);

        try {
            $write = $disk->put($probe, 'ok');
            $read = $write && $disk->get($probe) === 'ok';
            $delete = $disk->delete($probe);
            $operational = $write && $read && $delete;
        } catch (Throwable) {
            try {
                $disk->delete($probe);
            } catch (Throwable) {
            }
            $operational = false;
        }

        return [
            'disk' => $diskName,
            'driver' => config("filesystems.disks.{$diskName}.driver"),
            'status' => $operational ? 'operational' : 'unavailable',
            'capabilities' => $operational ? ['read' => true, 'write' => true, 'delete' => true] : null,
        ];
    }

    private function escapedLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
    }
}
