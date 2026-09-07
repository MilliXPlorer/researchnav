<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('class_section_members', function (Blueprint $table): void {
            if (! Schema::hasColumn('class_section_members', 'research_document_id')) {
                $table->unsignedBigInteger('research_document_id')->nullable()->after('class_section_id');
            }
            $table->index('class_section_id', 'class_section_members_section_idx');
            $table->dropUnique('class_section_members_section_user_unique');
            $table->foreign('research_document_id')->references('id')->on('research_documents')->cascadeOnDelete()->restrictOnUpdate();
            $table->unique(['class_section_id', 'research_document_id', 'user_id'], 'section_document_user_unique');
            $table->index(['research_document_id', 'user_id'], 'section_document_user_idx');
        });
    }

    public function down(): void
    {
        Schema::table('class_section_members', function (Blueprint $table): void {
            $table->dropIndex('section_document_user_idx');
            $table->dropForeign(['research_document_id']);
            $table->dropUnique('section_document_user_unique');
            $table->dropIndex('class_section_members_section_idx');
            $table->unique(['class_section_id', 'user_id'], 'class_section_members_section_user_unique');
            $table->dropColumn('research_document_id');
        });
    }
};
