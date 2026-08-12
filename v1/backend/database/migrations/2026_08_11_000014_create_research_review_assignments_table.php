<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('research_review_assignments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('reviewer_id', 36);
            $table->char('assigned_by', 36);
            $table->enum('review_role', ['adviser', 'instructor']);
            $table->boolean('is_active')->default(true);
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('reviewer_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('assigned_by')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id', 'reviewer_id', 'review_role'], 'research_review_assignment_unique');
            $table->index(['research_document_id', 'is_active'], 'review_assignment_document_active_idx');
            $table->index(['reviewer_id', 'is_active'], 'review_assignment_reviewer_active_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('research_review_assignments');
    }
};
