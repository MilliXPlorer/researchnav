<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('research_authors', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('user_id', 36)->nullable();
            $table->string('author_name', 255);
            $table->unsignedInteger('author_order')->default(1);
            $table->boolean('is_corresponding_author')->default(false);
            $table->timestamps();
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id', 'author_order']);
            $table->unique(['research_document_id', 'author_name']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('research_authors');
    }
};
