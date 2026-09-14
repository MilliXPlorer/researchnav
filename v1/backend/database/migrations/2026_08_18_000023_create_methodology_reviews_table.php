<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('methodology_reviews', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('statistician_id', 36);
            $table->boolean('design_fit')->nullable();
            $table->boolean('sample_size')->nullable();
            $table->boolean('instrument_validity')->nullable();
            $table->boolean('analysis_plan')->nullable();
            $table->text('remarks')->nullable();
            $table->enum('review_status', ['pending', 'in_progress', 'signed_off', 'returned_for_clarification'])->default('pending');
            $table->dateTime('signed_off_at', 6)->nullable();
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('statistician_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id', 'statistician_id'], 'methodology_review_document_statistician_unique');
            $table->index(['statistician_id', 'review_status'], 'methodology_review_statistician_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('methodology_reviews');
    }
};
