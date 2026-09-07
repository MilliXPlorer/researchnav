<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('research_assignments')) {
            Schema::table('research_assignments', function (Blueprint $table): void {
                $table->char('user_id', 36)->change();
                $table->char('assigned_by', 36)->nullable()->change();
            });
        }

        if (Schema::hasTable('research_reviews')) {
            Schema::table('research_reviews', function (Blueprint $table): void {
                $table->char('reviewer_id', 36)->change();
            });
        }

        if (Schema::hasTable('monitoring_entries')) {
            Schema::table('monitoring_entries', function (Blueprint $table): void {
                $table->char('reviewer_id', 36)->nullable()->change();
                $table->char('verified_by', 36)->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('monitoring_entries')) {
            Schema::table('monitoring_entries', function (Blueprint $table): void {
                $table->unsignedBigInteger('reviewer_id')->nullable()->change();
                $table->unsignedBigInteger('verified_by')->nullable()->change();
            });
        }

        if (Schema::hasTable('research_reviews')) {
            Schema::table('research_reviews', function (Blueprint $table): void {
                $table->unsignedBigInteger('reviewer_id')->change();
            });
        }

        if (Schema::hasTable('research_assignments')) {
            Schema::table('research_assignments', function (Blueprint $table): void {
                $table->unsignedBigInteger('user_id')->change();
                $table->unsignedBigInteger('assigned_by')->nullable()->change();
            });
        }
    }
};
