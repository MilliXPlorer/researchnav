<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BootstrapAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_upserts_an_active_passwordless_administrator(): void
    {
        $this->artisan('admin:bootstrap admin@example.test')->assertSuccessful();
        $this->artisan('admin:bootstrap ADMIN@example.test')->assertSuccessful();

        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseHas('users', [
            'email' => 'admin@example.test',
            'role' => 'admin',
            'access_status' => 'active',
            'is_admin' => true,
        ]);
        $this->assertNotNull(User::query()->firstOrFail()->confirmed_at);
    }

    public function test_it_preserves_an_existing_admin_id_and_self_referential_invitation(): void
    {
        $admin = User::query()->create([
            'email' => 'admin@example.test',
            'role' => 'researcher',
            'access_status' => 'invited',
            'is_admin' => false,
        ]);
        $id = $admin->id;
        $admin->forceFill(['invited_by' => $admin->id])->save();

        $this->artisan('admin:bootstrap admin@example.test')->assertSuccessful();

        $admin->refresh();
        $this->assertSame($id, User::query()->where('email', 'admin@example.test')->value('id'));
        $this->assertSame($id, $admin->invited_by);
    }
}
