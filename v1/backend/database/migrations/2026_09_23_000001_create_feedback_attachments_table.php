<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('feedback_attachments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('feedback_comment_id');
            $table->unsignedBigInteger('research_document_id');
            $table->char('uploaded_by', 36);
            $table->string('original_filename', 255);
            $table->string('stored_filename', 255);
            $table->string('file_path', 512);
            $table->string('file_extension', 10);
            $table->string('mime_type', 128);
            $table->unsignedBigInteger('file_size');
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('uploaded_by')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->index(['research_document_id', 'feedback_comment_id'], 'feedback_attachments_lookup');
            $table->index('uploaded_by', 'feedback_attachments_uploader');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feedback_attachments');
    }
};
