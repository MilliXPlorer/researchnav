<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_files', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('uploaded_by', 36);
            $table->enum('document_type', ['title_proposal', 'draft', 'chapter', 'revised_manuscript', 'final_manuscript', 'attachment']);
            $table->unsignedInteger('version_number');
            $table->string('original_filename', 500);
            $table->string('stored_filename', 500);
            $table->string('file_path', 1000);
            $table->string('file_extension', 50)->nullable();
            $table->string('mime_type', 255)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->boolean('is_current')->default(true);
            $table->dateTime('uploaded_at', 6);
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('uploaded_by')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id', 'document_type', 'version_number'], 'document_files_document_type_version_unique');
            $table->index(['research_document_id', 'document_type', 'is_current'], 'document_files_document_type_current_idx');
            $table->index('uploaded_by');
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE document_files ADD CONSTRAINT document_files_version_minimum CHECK (version_number >= 1)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('document_files');
    }
};
