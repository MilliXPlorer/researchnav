<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('feedback_comments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('user_id', 36);
            $table->unsignedBigInteger('document_file_id')->nullable();
            $table->longText('comment');
            $table->enum('feedback_type', ['comment', 'suggestion', 'revision_request', 'approval_remark', 'general_feedback'])->default('general_feedback');
            $table->enum('feedback_status', ['open', 'acknowledged', 'resolved'])->default('open');
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('document_file_id')->references('id')->on('document_files')->nullOnDelete()->restrictOnUpdate();
            $table->index(['research_document_id', 'feedback_status']);
            $table->index('user_id');
            $table->index('document_file_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feedback_comments');
    }
};
