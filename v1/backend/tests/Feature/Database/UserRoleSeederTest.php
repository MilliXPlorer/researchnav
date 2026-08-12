<?php

namespace Tests\Feature\Database;

use App\Models\User;
use App\Models\UserRole;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserRoleSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_seeder_only_maintains_required_roles(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(8, UserRole::query()->count());
        $this->assertSame(0, User::query()->count());
    }
}
