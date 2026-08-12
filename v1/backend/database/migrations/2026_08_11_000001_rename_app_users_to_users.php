<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->pretending()) {
            Schema::rename('app_users', 'users');

            return;
        }

        if (Schema::hasTable('users')) {
            throw new RuntimeException(Schema::hasTable('app_users')
                ? 'Both users and app_users exist; refusing an ambiguous user-table adoption.'
                : 'The users table already exists while app_users is absent; refusing an ambiguous user-table adoption.');
        }

        if (! Schema::hasTable('app_users')) {
            throw new RuntimeException('The historical app_users table is required before it can be adopted.');
        }

        Schema::rename('app_users', 'users');
    }

    public function down(): void
    {
        if (DB::connection()->pretending()) {
            Schema::rename('users', 'app_users');

            return;
        }

        if (Schema::hasTable('app_users')) {
            throw new RuntimeException(Schema::hasTable('users')
                ? 'Both users and app_users exist; refusing an ambiguous user-table rollback.'
                : 'The app_users table already exists while users is absent; refusing an ambiguous user-table rollback.');
        }

        if (! Schema::hasTable('users')) {
            throw new RuntimeException('The users table is required before it can be restored to app_users.');
        }

        Schema::rename('users', 'app_users');
    }
};
