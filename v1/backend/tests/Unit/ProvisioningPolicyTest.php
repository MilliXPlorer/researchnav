<?php

namespace Tests\Unit;

use App\Services\ProvisioningPolicy;
use PHPUnit\Framework\TestCase;

class ProvisioningPolicyTest extends TestCase
{
    public function test_only_blocked_or_invited_researcher_or_matching_role_can_be_reprovisioned(): void
    {
        $this->assertTrue(ProvisioningPolicy::canProvisionExistingRole('researcher', 'blocked', 'coordinator', false));
        $this->assertTrue(ProvisioningPolicy::canProvisionExistingRole('instructor', 'invited', 'instructor', false));
        $this->assertFalse(ProvisioningPolicy::canProvisionExistingRole('coordinator', 'blocked', 'instructor', false));
        $this->assertFalse(ProvisioningPolicy::canProvisionExistingRole('researcher', 'active', 'coordinator', false));
        $this->assertFalse(ProvisioningPolicy::canProvisionExistingRole('researcher', 'blocked', 'coordinator', true));
    }
}
