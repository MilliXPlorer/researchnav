<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sdgs', function (Blueprint $table): void {
            $table->unsignedTinyInteger('id')->primary();
            $table->string('code', 10)->unique();
            $table->string('title', 160);
            $table->string('short_title', 80);
            $table->char('color_hex', 7);
        });

        DB::table('sdgs')->insert([
            ['id' => 1, 'code' => 'SDG 1', 'title' => 'No Poverty', 'short_title' => 'No Poverty', 'color_hex' => '#E5243B'],
            ['id' => 2, 'code' => 'SDG 2', 'title' => 'Zero Hunger', 'short_title' => 'Zero Hunger', 'color_hex' => '#DDA63A'],
            ['id' => 3, 'code' => 'SDG 3', 'title' => 'Good Health and Well-being', 'short_title' => 'Good Health', 'color_hex' => '#4C9F38'],
            ['id' => 4, 'code' => 'SDG 4', 'title' => 'Quality Education', 'short_title' => 'Quality Education', 'color_hex' => '#C5192D'],
            ['id' => 5, 'code' => 'SDG 5', 'title' => 'Gender Equality', 'short_title' => 'Gender Equality', 'color_hex' => '#FF3A21'],
            ['id' => 6, 'code' => 'SDG 6', 'title' => 'Clean Water and Sanitation', 'short_title' => 'Clean Water', 'color_hex' => '#26BDE2'],
            ['id' => 7, 'code' => 'SDG 7', 'title' => 'Affordable and Clean Energy', 'short_title' => 'Clean Energy', 'color_hex' => '#FCC30B'],
            ['id' => 8, 'code' => 'SDG 8', 'title' => 'Decent Work and Economic Growth', 'short_title' => 'Decent Work', 'color_hex' => '#A21942'],
            ['id' => 9, 'code' => 'SDG 9', 'title' => 'Industry, Innovation and Infrastructure', 'short_title' => 'Innovation', 'color_hex' => '#FD6925'],
            ['id' => 10, 'code' => 'SDG 10', 'title' => 'Reduced Inequalities', 'short_title' => 'Reduced Inequalities', 'color_hex' => '#DD1367'],
            ['id' => 11, 'code' => 'SDG 11', 'title' => 'Sustainable Cities and Communities', 'short_title' => 'Sustainable Cities', 'color_hex' => '#FD9D24'],
            ['id' => 12, 'code' => 'SDG 12', 'title' => 'Responsible Consumption and Production', 'short_title' => 'Responsible Consumption', 'color_hex' => '#BF8B2E'],
            ['id' => 13, 'code' => 'SDG 13', 'title' => 'Climate Action', 'short_title' => 'Climate Action', 'color_hex' => '#3F7E44'],
            ['id' => 14, 'code' => 'SDG 14', 'title' => 'Life Below Water', 'short_title' => 'Life Below Water', 'color_hex' => '#0A97D9'],
            ['id' => 15, 'code' => 'SDG 15', 'title' => 'Life on Land', 'short_title' => 'Life on Land', 'color_hex' => '#56C02B'],
            ['id' => 16, 'code' => 'SDG 16', 'title' => 'Peace, Justice and Strong Institutions', 'short_title' => 'Peace and Justice', 'color_hex' => '#00689D'],
            ['id' => 17, 'code' => 'SDG 17', 'title' => 'Partnerships for the Goals', 'short_title' => 'Partnerships', 'color_hex' => '#19486A'],
        ]);

        Schema::create('research_document_sdgs', function (Blueprint $table): void {
            $table->unsignedBigInteger('research_document_id');
            $table->unsignedTinyInteger('sdg_id');
            $table->primary(['research_document_id', 'sdg_id'], 'research_document_sdgs_primary');
            $table->foreign('research_document_id')->references('id')->on('research_documents')->cascadeOnDelete();
            $table->foreign('sdg_id')->references('id')->on('sdgs')->restrictOnDelete();
            $table->index(['sdg_id', 'research_document_id'], 'research_document_sdgs_lookup_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('research_document_sdgs');
        Schema::dropIfExists('sdgs');
    }
};
