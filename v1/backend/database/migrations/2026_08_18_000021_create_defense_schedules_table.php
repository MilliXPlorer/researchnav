<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('defense_schedules', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('created_by', 36);
            $table->dateTime('scheduled_at', 6);
            $table->string('room', 150)->nullable();
            $table->text('notes')->nullable();
            $table->enum('status', ['scheduled', 'completed', 'cancelled'])->default('scheduled');
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('created_by')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->index(['scheduled_at', 'status'], 'defense_schedule_at_status_idx');
            $table->index('research_document_id', 'defense_schedule_document_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('defense_schedules');
    }
};
