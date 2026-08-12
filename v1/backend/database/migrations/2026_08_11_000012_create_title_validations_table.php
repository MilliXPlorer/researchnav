<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('title_validations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->unsignedBigInteger('similarity_result_id')->nullable();
            $table->char('validated_by', 36);
            $table->enum('validation_status', ['pending', 'approved', 'revision_required', 'rejected'])->default('pending');
            $table->longText('adviser_remarks')->nullable();
            $table->dateTime('validated_at', 6)->nullable();
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('similarity_result_id')->references('id')->on('similarity_results')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('validated_by')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->index(['research_document_id', 'validation_status']);
            $table->index('similarity_result_id');
            $table->index('validated_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('title_validations');
    }
};
