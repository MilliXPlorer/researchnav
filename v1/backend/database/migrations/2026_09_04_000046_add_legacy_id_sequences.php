<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('legacy_id_sequences')) {
            Schema::create('legacy_id_sequences', function (Blueprint $table): void {
                $table->string('source_type', 50)->primary();
                $table->unsignedBigInteger('next_id');
            });
        }

        foreach (['revision', 'title_validation', 'feedback', 'evaluation', 'methodology_review', 'compliance_review', 'metadata_review'] as $type) {
            $next = ((int) DB::table('research_review_records')->where('source_type', $type)->max('source_id')) + 1;
            DB::table('legacy_id_sequences')->updateOrInsert(['source_type' => $type], ['next_id' => $next]);
        }
        foreach (['research', 'audit', 'retention', 'privacy'] as $stream) {
            $next = ((int) DB::table('activity_logs')->where('stream', $stream)->max('source_id')) + 1;
            DB::table('legacy_id_sequences')->updateOrInsert(['source_type' => $stream], ['next_id' => $next]);
        }

        if (DB::getDriverName() !== 'sqlite' && ! Schema::hasTable('revisions')) {
            Schema::dropIfExists('audit_logs');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('legacy_id_sequences');
    }
};
