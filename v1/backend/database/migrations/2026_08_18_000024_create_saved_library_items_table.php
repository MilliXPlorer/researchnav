<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saved_library_items', function (Blueprint $table): void {
            $table->id();
            $table->char('user_id', 36);
            $table->unsignedBigInteger('research_document_id');
            $table->timestamps(6);
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['user_id', 'research_document_id'], 'saved_library_user_document_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saved_library_items');
    }
};
