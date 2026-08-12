<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $canonicalColumns = [
            'role_id', 'student_employee_id', 'first_name', 'middle_name', 'last_name', 'password',
            'account_status', 'email_verified_at', 'remember_token', 'deleted_at',
        ];

        $legacyRoleMap = [
            'admin' => 'administrator',
            'researcher' => 'researcher',
            'adviser' => 'research_adviser',
            'instructor' => 'research_instructor',
            'panel' => 'research_office',
            'statistician' => 'research_office',
            'coordinator' => 'research_office',
            'librarian' => 'research_office',
            'research-office' => 'research_office',
            'academics' => 'research_office',
        ];

        if (! DB::connection()->pretending()) {
            if (Schema::hasTable('users') && collect($canonicalColumns)->contains(fn (string $column): bool => Schema::hasColumn('users', $column))) {
                throw new RuntimeException('Canonical user fields are partially or already present; refusing to rerun this migration.');
            }

            if (DB::table('users')->whereNull('role')->exists()) {
                throw new RuntimeException('A legacy user has no role; canonical role backfill cannot continue.');
            }

            $unknownRoles = DB::table('users')->distinct()->pluck('role')->diff(array_keys($legacyRoleMap));
            if ($unknownRoles->isNotEmpty()) {
                throw new RuntimeException('Unknown legacy user role(s): '.$unknownRoles->implode(', '));
            }

            $roleIds = DB::table('user_roles')->pluck('id', 'slug');
            $missingCanonicalRoles = collect($legacyRoleMap)->unique()->diff($roleIds->keys());
            if ($missingCanonicalRoles->isNotEmpty()) {
                throw new RuntimeException('Required canonical role(s) are missing: '.$missingCanonicalRoles->implode(', '));
            }
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedBigInteger('role_id')->nullable()->after('id');
            $table->string('student_employee_id', 100)->nullable()->after('email');
            $table->string('first_name', 100)->nullable()->after('student_employee_id');
            $table->string('middle_name', 100)->nullable()->after('first_name');
            $table->string('last_name', 100)->nullable()->after('middle_name');
            $table->string('password')->nullable()->after('last_name');
            $table->enum('account_status', ['active', 'inactive', 'suspended', 'pending'])->default('pending')->after('access_status');
            $table->timestamp('email_verified_at')->nullable()->after('account_status');
            $table->rememberToken();
            $table->softDeletes();
        });

        if (DB::connection()->pretending()) {
            return;
        }

        foreach ($legacyRoleMap as $legacyRole => $canonicalRole) {
            DB::table('users')->where('role', $legacyRole)->update(['role_id' => $roleIds[$canonicalRole]]);
        }

        DB::table('users')->where('access_status', 'active')->update(['account_status' => 'active']);
        DB::table('users')->whereIn('access_status', ['invited', 'blocked'])->update(['account_status' => 'pending']);

        if (DB::table('users')->whereNull('role_id')->exists()) {
            throw new RuntimeException('User role backfill failed; no canonical role may remain null.');
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedBigInteger('role_id')->nullable(false)->change();
            $table->foreign('role_id')->references('id')->on('user_roles')->restrictOnDelete()->restrictOnUpdate();
            $table->index('role_id');
            $table->index('account_status');
            $table->index('student_employee_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropForeign(['role_id']);
            $table->dropIndex(['role_id']);
            $table->dropIndex(['account_status']);
            $table->dropIndex(['student_employee_id']);
            $table->dropColumn([
                'role_id', 'student_employee_id', 'first_name', 'middle_name', 'last_name',
                'password', 'account_status', 'email_verified_at', 'remember_token', 'deleted_at',
            ]);
        });
    }
};
