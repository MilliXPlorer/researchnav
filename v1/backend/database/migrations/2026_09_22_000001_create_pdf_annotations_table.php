<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pdf_annotations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->unsignedBigInteger('document_file_id');
            $table->char('author_id', 36);
            $table->string('author_role', 50);
            $table->string('kind', 20)->default('comment');
            $table->longText('body')->nullable();
            $table->unsignedTinyInteger('anchor_schema_version')->default(1);
            $table->unsignedInteger('page_number');
            $table->mediumText('selected_text');
            $table->string('text_prefix', 256)->nullable();
            $table->string('text_suffix', 256)->nullable();
            $table->json('rects');
            $table->timestamps(6);

            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('document_file_id')->references('id')->on('document_files')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('author_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->index(['document_file_id', 'page_number', 'created_at'], 'pdf_annotations_file_page_created_idx');
            $table->index(['research_document_id', 'author_id'], 'pdf_annotations_research_author_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pdf_annotations');
    }
};
