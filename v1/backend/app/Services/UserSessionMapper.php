<?php

namespace App\Services;

use App\Models\User;

class UserSessionMapper
{
    /** @return array{email: string, role: string, accessStatus: string, isAdmin: bool} */
    public static function map(User $user): array
    {
        return [
            'email' => $user->email,
            'role' => $user->role,
            'accessStatus' => $user->access_status,
            'isAdmin' => $user->is_admin,
        ];
    }
}
