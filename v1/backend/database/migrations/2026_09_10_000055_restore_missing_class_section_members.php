<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('class_section_members')) {
            return;
        }

        Schema::create('class_section_members', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('class_section_id');
            $table->unsignedBigInteger('research_document_id')->nullable();
            $table->char('user_id', 36);
            $table->timestamps(6);
            $table->foreign('class_section_id')->references('id')->on('class_sections')->cascadeOnDelete()->restrictOnUpdate();
            $table->foreign('research_document_id')->references('id')->on('research_documents')->cascadeOnDelete()->restrictOnUpdate();
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['class_section_id', 'research_document_id', 'user_id'], 'section_document_user_unique');
            $table->index('class_section_id', 'class_section_members_section_idx');
            $table->index('user_id', 'class_section_members_user_idx');
            $table->index(['research_document_id', 'user_id'], 'section_document_user_idx');
        });
    }

    public function down(): void
    {
        // This repair migration must not remove a table that may predate it.
    }
};
