<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manuscript_search_documents', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->unsignedBigInteger('source_document_file_id')->nullable();
            $table->enum('source_kind', ['final_manuscript', 'canonical_import'])->nullable();
            $table->enum('source_extension', ['pdf', 'docx', 'doc'])->nullable();
            $table->char('source_sha256', 64)->nullable();
            $table->unsignedBigInteger('source_size_bytes')->nullable();
            $table->dateTime('source_file_updated_at', 6)->nullable();
            $table->longText('body_text')->nullable();
            $table->unsignedBigInteger('body_text_bytes')->nullable();
            $table->unsignedBigInteger('body_text_chars')->nullable();
            $table->enum('extraction_status', ['pending', 'ready', 'no_source', 'unsupported', 'failed'])->default('pending');
            $table->string('error_code', 100)->nullable();
            $table->string('extractor_version', 100)->nullable();
            $table->dateTime('last_attempted_at', 6)->nullable();
            $table->dateTime('indexed_at', 6)->nullable();
            $table->timestamps(6);

            $table->foreign('research_document_id')->references('id')->on('research_documents')->cascadeOnDelete()->restrictOnUpdate();
            // Derived text cannot outlive the file from which it was extracted.
            $table->foreign('source_document_file_id')->references('id')->on('document_files')->cascadeOnDelete()->restrictOnUpdate();
            $table->unique('research_document_id', 'manuscript_search_documents_research_document_unique');
            $table->unique('source_document_file_id', 'manuscript_search_documents_source_file_unique');
            $table->index('source_sha256', 'manuscript_search_documents_source_sha256_idx');
            $table->index(['extraction_status', 'last_attempted_at'], 'manuscript_search_documents_status_attempt_idx');
            $table->index('indexed_at', 'manuscript_search_documents_indexed_at_idx');
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE manuscript_search_documents ADD FULLTEXT manuscript_search_documents_body_text_fulltext (body_text)');
            DB::statement('ALTER TABLE manuscript_search_documents ADD CONSTRAINT manuscript_search_documents_body_text_measurements CHECK ((body_text IS NULL AND body_text_bytes IS NULL AND body_text_chars IS NULL) OR (body_text IS NOT NULL AND body_text_bytes IS NOT NULL AND body_text_chars IS NOT NULL))');
            DB::statement("ALTER TABLE manuscript_search_documents ADD CONSTRAINT manuscript_search_documents_ready_body_text CHECK (extraction_status <> 'ready' OR body_text IS NOT NULL)");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('manuscript_search_documents');
    }
};
