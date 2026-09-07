<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->unsignedBigInteger('section_id')->nullable()->after('category_id');
            $table->foreign('section_id')->references('id')->on('class_sections')->nullOnDelete()->restrictOnUpdate();
            $table->index(['section_id', 'research_stage'], 'rd_section_stage_idx');
        });
    }

    public function down(): void
    {
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->dropForeign(['section_id']);
            $table->dropIndex('rd_section_stage_idx');
            $table->dropColumn('section_id');
        });
    }
};
