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

        return $existingRole === 'researcher' || $existingRole === $provisionedRole;
    }
}
