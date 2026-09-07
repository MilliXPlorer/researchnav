<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('similarity_results')
            || Schema::hasIndex('similarity_results', 'similarity_results_latest_pair_idx')) {
            return;
        }

        // MariaDB DDL is non-transactional; the named-index guard makes a
        // partially completed deploy safe to resume.
        Schema::table('similarity_results', fn (Blueprint $table) => $table->index(
            ['source_research_id', 'matched_research_id', 'id'],
            'similarity_results_latest_pair_idx',
        ));
    }

    public function down(): void
    {
        // Preserve this additive performance index during rollback. Dropping it
        // is unnecessary for schema compatibility and may disrupt live reads.
    }
};
