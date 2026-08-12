<?php

namespace App\Services;

class ProvisioningPolicy
{
    public static function canProvisionExistingRole(
        string $existingRole,
        string $accessStatus,
        string $provisionedRole,
        bool $isAdmin,
    ): bool {
        if ($isAdmin || $accessStatus === 'active') {
            return false;
        }

        return $provisionedRole === 'coordinator'
            ? in_array($existingRole, ['researcher', 'coordinator'], true)
            : in_array($existingRole, ['researcher', 'instructor'], true);
    }
}
