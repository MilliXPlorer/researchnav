<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metadata_reviews', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('reviewed_by', 36)->nullable();
            $table->boolean('title_complete')->default(false);
            $table->boolean('abstract_complete')->default(false);
            $table->boolean('authors_complete')->default(false);
            $table->boolean('keywords_complete')->default(false);
            $table->boolean('category_complete')->default(false);
            $table->text('notes')->nullable();
            $table->enum('review_status', ['pending', 'complete', 'needs_correction'])->default('pending');
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id'], 'metadata_review_document_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metadata_reviews');
    }
};
