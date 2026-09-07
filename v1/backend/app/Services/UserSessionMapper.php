<?php

namespace App\Services;

use App\Models\User;

class UserSessionMapper
{
    /** @return array{email: string, role: string, accessStatus: string, isAdmin: bool, firstName: ?string, middleName: ?string, lastName: ?string, studentEmployeeId: ?string, displayName: string, profilePhotoUrl: ?string} */
    public static function map(User $user, bool $includePrivateProfile = false): array
    {
        $names = array_values(array_filter([
            self::clean($user->first_name),
            self::clean($user->middle_name),
            self::clean($user->last_name),
        ], fn (?string $name): bool => $name !== null));

        return [
            'email' => $user->email,
            'role' => $user->roleDefinition?->slug === 'research_editor' ? 'research_editor' : $user->role,
            'accessStatus' => $user->access_status,
            'isAdmin' => $user->is_admin,
            'firstName' => self::clean($user->first_name),
            'middleName' => self::clean($user->middle_name),
            'lastName' => self::clean($user->last_name),
            'studentEmployeeId' => $includePrivateProfile ? self::clean($user->student_employee_id) : null,
            'displayName' => $names === [] ? $user->email : implode(' ', $names),
            'profilePhotoUrl' => $user->profile_photo_version
                ? '/api/profile/photo/'.$user->profile_photo_version
                : null,
        ];
    }

    private static function clean(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }
}
