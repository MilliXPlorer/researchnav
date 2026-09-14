<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('retention_logs', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id')->nullable();
            $table->char('performed_by', 36)->nullable();
            $table->string('action', 100);
            $table->text('remarks')->nullable();
            $table->dateTime('activity_date', 6);
            $table->timestamp('created_at', 6)->useCurrent();
            $table->foreign('research_document_id')->references('id')->on('research_documents')->nullOnDelete()->restrictOnUpdate();
            $table->foreign('performed_by')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();
            $table->index(['research_document_id', 'activity_date'], 'retention_log_document_date_idx');
            $table->index(['action', 'activity_date'], 'retention_log_action_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('retention_logs');
    }
};
