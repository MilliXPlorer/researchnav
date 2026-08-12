<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_roles', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 100)->unique();
            $table->string('slug', 100)->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // This is migration data, rather than seeder data, because the users migration relies on it.
        DB::table('user_roles')->insert([
            ['id' => 1, 'name' => 'Researcher', 'slug' => 'researcher', 'description' => 'Research repository contributor.', 'is_active' => true, 'created_at' => '2026-08-11 00:00:00', 'updated_at' => '2026-08-11 00:00:00'],
            ['id' => 2, 'name' => 'Research Instructor', 'slug' => 'research_instructor', 'description' => 'Research instruction and review staff.', 'is_active' => true, 'created_at' => '2026-08-11 00:00:00', 'updated_at' => '2026-08-11 00:00:00'],
            ['id' => 3, 'name' => 'Research Adviser', 'slug' => 'research_adviser', 'description' => 'Academic research adviser.', 'is_active' => true, 'created_at' => '2026-08-11 00:00:00', 'updated_at' => '2026-08-11 00:00:00'],
            ['id' => 4, 'name' => 'Research Office Personnel', 'slug' => 'research_office', 'description' => 'Research office operations personnel.', 'is_active' => true, 'created_at' => '2026-08-11 00:00:00', 'updated_at' => '2026-08-11 00:00:00'],
            ['id' => 5, 'name' => 'System Administrator', 'slug' => 'administrator', 'description' => 'ResearchNAV system administrator.', 'is_active' => true, 'created_at' => '2026-08-11 00:00:00', 'updated_at' => '2026-08-11 00:00:00'],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('user_roles');
    }
};
