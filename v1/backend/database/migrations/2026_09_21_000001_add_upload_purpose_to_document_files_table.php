<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('document_files', function (Blueprint $table): void {
            $table->string('upload_purpose', 40)->default('initial_submission')->after('document_type');
        });

        DB::table('document_files')->where('document_type', 'revised_manuscript')->update(['upload_purpose' => 'revision']);
        DB::table('document_files')->where('document_type', 'final_manuscript')->update(['upload_purpose' => 'final_revision']);
    }

    public function down(): void
    {
        Schema::table('document_files', function (Blueprint $table): void {
            $table->dropColumn('upload_purpose');
        });
    }
};
