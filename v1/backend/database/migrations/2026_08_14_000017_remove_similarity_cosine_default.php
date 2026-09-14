<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('similarity_results', function (Blueprint $table): void {
            $table->decimal('cosine_score', 8, 6)->change();
        });
    }

    public function down(): void
    {
        Schema::table('similarity_results', function (Blueprint $table): void {
            $table->decimal('cosine_score', 8, 6)->default(0)->change();
        });
    }
};
