<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('monitoring_logs', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('performed_by', 36)->nullable();
            $table->string('activity_type', 100);
            $table->longText('remarks')->nullable();
            $table->string('previous_status', 100)->nullable();
            $table->string('new_status', 100)->nullable();
            $table->string('monitoring_status', 100)->nullable();
            $table->dateTime('activity_date', 6);
            $table->timestamp('created_at', 6)->useCurrent();
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('performed_by')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();
            $table->index(['research_document_id', 'activity_date']);
            $table->index(['performed_by', 'activity_date']);
            $table->index(['activity_type', 'activity_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monitoring_logs');
    }
};
