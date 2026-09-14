<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('manuscript_search_documents')) {
            (require database_path('migrations/2026_08_26_000033_create_manuscript_search_documents_table.php'))->up();
        }
    }

    public function down(): void
    {
        // This migration repairs drift and must not remove a pre-existing table.
    }
};
