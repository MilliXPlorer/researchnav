<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pending_private_file_deletions', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            // This is private operational state. It is never serialized or logged.
            $table->string('storage_path', 1000);
            $table->unsignedInteger('attempts')->default(0);
            $table->dateTime('last_attempted_at', 6)->nullable();
            $table->timestamps(6);

            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->unique('storage_path');
            $table->index(['created_at', 'id'], 'pending_private_file_deletions_retry_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_private_file_deletions');
    }
};
