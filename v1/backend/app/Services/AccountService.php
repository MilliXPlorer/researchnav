<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class AccountService
{
    public function findById(string $id): ?User
    {
        return User::query()->find($id);
    }

    public function resolveGoogleUser(string $emailInput, string $googleSubject): User
    {
        $email = $this->normalizeEmail($emailInput);

        return $this->retryAfterDuplicateInsert(function () use ($email, $googleSubject): User {
            return DB::transaction(function () use ($email, $googleSubject): User {
                $existing = User::query()
                    ->where('google_sub', $googleSubject)
                    ->lockForUpdate()
                    ->first();

                if ($existing !== null && $existing->email !== $email) {
                    throw new RuntimeException('Google subject email changed; audited relinking is required.');
                }

                if ($existing === null) {
                    $existing = User::query()
                        ->where('email', $email)
                        ->lockForUpdate()
                        ->first();
                }

                if ($existing === null) {
                    return User::query()->create([
                        'id' => (string) Str::uuid(),
                        'email' => $email,
                        'google_sub' => $googleSubject,
                        'role' => 'researcher',
                        'access_status' => 'blocked',
                        'is_admin' => false,
                        'last_login_at' => now(),
                    ]);
                }

                if ($existing->google_sub !== null && $existing->google_sub !== $googleSubject) {
                    throw new RuntimeException('Google subject does not match the existing account binding.');
                }

                $accessStatus = $existing->access_status === 'invited' ? 'active' : $existing->access_status;
                $existing->forceFill([
                    'google_sub' => $googleSubject,
                    'access_status' => $accessStatus,
                    'confirmed_at' => $accessStatus === 'active' ? ($existing->confirmed_at ?? now()) : $existing->confirmed_at,
                    'last_login_at' => now(),
                ])->save();

                return $existing->fresh();
            }, 3);
        });
    }

    /** @return list<User> */
    public function listProvisionedUsers(string $role): array
    {
        return User::query()->where('role', $role)->latest('created_at')->get()->all();
    }

    /** @return list<User> */
    public function listProvisionedAccounts(): array
    {
        return User::query()
            ->whereNotNull('invitation_sent_at')
            ->latest('created_at')
            ->get()
            ->all();
    }

    public function provisionUser(string $emailInput, string $role, string $invitedBy): User
    {
        $email = $this->normalizeEmail($emailInput);

        return $this->retryAfterDuplicateInsert(function () use ($email, $role, $invitedBy): User {
            return DB::transaction(function () use ($email, $role, $invitedBy): User {
                $existing = User::query()->where('email', $email)->lockForUpdate()->first();

                if ($existing !== null) {
                    if (! ProvisioningPolicy::canProvisionExistingRole(
                        $existing->role,
                        $existing->access_status,
                        $role,
                        $existing->is_admin,
                    )) {
                        throw new RuntimeException('Existing account role cannot be reassigned by this workflow.');
                    }

                    $isActive = $existing->google_sub !== null;
                    $existing->forceFill([
                        'role' => $role,
                        'access_status' => $isActive ? 'active' : 'invited',
                        'confirmed_at' => $isActive ? ($existing->confirmed_at ?? now()) : $existing->confirmed_at,
                        'invited_by' => $invitedBy,
                        'invitation_sent_at' => now(),
                    ])->save();

                    return $existing->fresh();
                }

                return User::query()->create([
                    'id' => (string) Str::uuid(),
                    'email' => $email,
                    'role' => $role,
                    'access_status' => 'invited',
                    'is_admin' => false,
                    'invited_by' => $invitedBy,
                    'invitation_sent_at' => now(),
                ]);
            }, 3);
        });
    }

    private function normalizeEmail(string $email): string
    {
        return Str::lower(trim($email));
    }

    /** @template T @param callable(): T $operation @return T */
    private function retryAfterDuplicateInsert(callable $operation): mixed
    {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            try {
                return $operation();
            } catch (QueryException $exception) {
                if (! $this->isUniqueConstraintViolation($exception) || $attempt === 1) {
                    throw $exception;
                }
            }
        }

        throw new RuntimeException('Unable to resolve concurrent account provisioning.');
    }

    private function isUniqueConstraintViolation(QueryException $exception): bool
    {
        return in_array((string) $exception->getCode(), ['23000', '23505'], true)
            || ($exception->errorInfo[1] ?? null) === 1062;
    }
}
