<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        foreach ([
            ['name' => 'Statistician', 'slug' => 'statistician', 'description' => 'Statistical research review personnel.'],
            ['name' => 'Librarian', 'slug' => 'librarian', 'description' => 'Research repository and archive personnel.'],
            ['name' => 'Research Panelist', 'slug' => 'research_panelist', 'description' => 'Assigned research panel reviewer.'],
        ] as $role) {
            DB::table('user_roles')->updateOrInsert(
                ['slug' => $role['slug']],
                $role + ['is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            );
        }

        foreach (['statistician' => 'statistician', 'librarian' => 'librarian', 'panel' => 'research_panelist'] as $legacy => $canonical) {
            DB::table('users')->where('role', $legacy)->update([
                'role_id' => DB::table('user_roles')->where('slug', $canonical)->value('id'),
            ]);
        }
    }

    public function down(): void
    {
        $officeRoleId = DB::table('user_roles')->where('slug', 'research_office')->value('id');
        DB::table('users')->whereIn('role', ['statistician', 'librarian', 'panel'])->update(['role_id' => $officeRoleId]);
        DB::table('user_roles')->whereIn('slug', ['statistician', 'librarian', 'research_panelist'])->delete();
    }
};
