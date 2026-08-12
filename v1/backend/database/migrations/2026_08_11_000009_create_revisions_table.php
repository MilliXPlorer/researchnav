<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('revisions', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('requested_by', 36);
            $table->unsignedBigInteger('document_file_id')->nullable();
            $table->unsignedInteger('revision_number');
            $table->longText('revision_remarks');
            $table->enum('revision_status', ['requested', 'in_progress', 'resubmitted', 'under_review', 'accepted'])->default('requested');
            $table->dateTime('requested_at', 6);
            $table->dateTime('submitted_at', 6)->nullable();
            $table->dateTime('resolved_at', 6)->nullable();
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('requested_by')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('document_file_id')->references('id')->on('document_files')->nullOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id', 'revision_number']);
            $table->index(['research_document_id', 'revision_status']);
            $table->index('requested_by');
            $table->index('document_file_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('revisions');
    }
};
