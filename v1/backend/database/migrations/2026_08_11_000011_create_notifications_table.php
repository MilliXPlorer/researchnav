<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->uuidMorphs('notifiable');
            $table->unsignedBigInteger('research_document_id')->nullable();
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->foreign('research_document_id')->references('id')->on('research_documents')->nullOnDelete()->restrictOnUpdate();
            $table->index('research_document_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
