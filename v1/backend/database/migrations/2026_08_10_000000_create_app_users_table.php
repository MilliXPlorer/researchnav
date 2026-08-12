<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $isSqlite = DB::connection()->getDriverName() === 'sqlite';

        Schema::create('app_users', function (Blueprint $table) use ($isSqlite): void {
            $table->char('id', 36)->primary();
            $table->string('email', 254)->unique();
            // Google subjects are opaque identifiers, so their comparison must remain case-sensitive.
            $googleSubject = $table->string('google_sub')->nullable()->unique();
            if (! $isSqlite) {
                $googleSubject->collation('utf8mb4_bin');
            }
            $table->enum('role', [
                'admin', 'researcher', 'adviser', 'instructor', 'panel',
                'statistician', 'coordinator', 'librarian', 'research-office', 'academics',
            ]);
            $table->enum('access_status', ['active', 'invited', 'blocked'])->default('blocked');
            $table->boolean('is_admin')->default(false);
            $table->char('invited_by', 36)->nullable();
            $table->dateTime('invitation_sent_at', 6)->nullable();
            $table->dateTime('confirmed_at', 6)->nullable();
            $table->dateTime('last_login_at', 6)->nullable();
            $table->dateTime('created_at', 6);
            $table->dateTime('updated_at', 6);

            $table->index('role');
            $table->index('access_status');
            $table->foreign('invited_by')->references('id')->on('app_users')->restrictOnDelete()->restrictOnUpdate();
        });

        if (! $isSqlite) {
            DB::statement("ALTER TABLE app_users
                ADD CONSTRAINT app_users_email_normalized CHECK (BINARY email = BINARY LOWER(email)),
                ADD CONSTRAINT app_users_admin_consistency CHECK ((role = 'admin' AND is_admin = 1) OR (role <> 'admin' AND is_admin = 0))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('app_users');
    }
};
