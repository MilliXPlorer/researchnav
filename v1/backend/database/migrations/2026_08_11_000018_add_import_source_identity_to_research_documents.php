<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->char('import_source_sha256', 64)->nullable()->unique('research_documents_import_source_sha256_unique');
            $table->string('import_source_filename', 500)->nullable()->index('research_documents_import_source_filename_idx');
        });
    }

    public function down(): void
    {
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->dropUnique('research_documents_import_source_sha256_unique');
            $table->dropIndex('research_documents_import_source_filename_idx');
            $table->dropColumn(['import_source_sha256', 'import_source_filename']);
        });
    }
};
