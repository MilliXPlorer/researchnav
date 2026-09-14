<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('research_review_assignments', function (Blueprint $table): void {
            $table->enum('review_role', ['adviser', 'instructor', 'panel', 'research-office', 'statistician', 'librarian', 'research_editor'])->change();
        });
    }

    public function down(): void
    {
        Schema::table('research_review_assignments', function (Blueprint $table): void {
            $table->enum('review_role', ['adviser', 'instructor', 'panel', 'statistician'])->change();
        });
    }
};
