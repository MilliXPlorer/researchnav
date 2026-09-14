<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('defense_evaluations')) {
            Schema::table('defense_evaluations', fn (Blueprint $table) => $table->char('evaluator_id', 36)->change());
        }
        if (Schema::hasTable('defenses')) {
            Schema::table('defenses', fn (Blueprint $table) => $table->char('created_by', 36)->nullable()->change());
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('defense_evaluations')) {
            Schema::table('defense_evaluations', fn (Blueprint $table) => $table->unsignedBigInteger('evaluator_id')->change());
        }
        if (Schema::hasTable('defenses')) {
            Schema::table('defenses', fn (Blueprint $table) => $table->unsignedBigInteger('created_by')->nullable()->change());
        }
    }
};
