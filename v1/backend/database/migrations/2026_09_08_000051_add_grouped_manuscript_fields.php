<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->string('import_group_name', 500)->nullable()->after('import_source_filename');
        });
        Schema::table('document_files', function (Blueprint $table): void {
            $table->string('relative_path', 1000)->nullable()->after('original_filename');
            $table->unsignedInteger('file_order')->default(1)->after('relative_path');
            $table->char('content_sha256', 64)->nullable()->after('file_size');
            $table->index(['research_document_id', 'file_order'], 'document_files_research_order_idx');
        });
    }

    public function down(): void
    {
        Schema::table('document_files', function (Blueprint $table): void {
            $table->dropIndex('document_files_research_order_idx');
            $table->dropColumn(['relative_path', 'file_order', 'content_sha256']);
        });
        Schema::table('research_documents', fn (Blueprint $table) => $table->dropColumn('import_group_name'));
    }
};
