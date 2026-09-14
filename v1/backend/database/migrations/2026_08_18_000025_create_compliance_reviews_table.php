<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('compliance_reviews', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('reviewed_by', 36)->nullable();
            $table->boolean('format_compliant')->nullable();
            $table->boolean('attachments_compliant')->nullable();
            $table->boolean('consent_forms_compliant')->nullable();
            $table->text('remarks')->nullable();
            $table->enum('review_status', ['pending', 'endorsed', 'returned'])->default('pending');
            $table->dateTime('decided_at', 6)->nullable();
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('reviewed_by')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id'], 'compliance_review_document_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('compliance_reviews');
    }
};
