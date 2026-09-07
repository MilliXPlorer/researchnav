<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('similarity_results', function (Blueprint $table): void {
            $table->decimal('title_similarity_score', 8, 6)->nullable()->after('tfidf_score');
            $table->decimal('content_similarity_score', 8, 6)->nullable()->after('title_similarity_score');
            $table->enum('score_status', ['scored', 'content_unavailable'])->default('scored')->after('content_similarity_score');
            $table->string('algorithm_version', 100)->default('title-tfidf-cosine-v1')->after('analysis_type');
            $table->char('source_content_sha256', 64)->nullable()->after('algorithm_version');
            $table->char('matched_content_sha256', 64)->nullable()->after('source_content_sha256');
            $table->index(['source_research_id', 'score_status', 'final_similarity_score'], 'similarity_results_source_status_score_idx');
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_title_score_bounds CHECK (title_similarity_score IS NULL OR (title_similarity_score >= 0 AND title_similarity_score <= 1))');
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_content_score_bounds CHECK (content_similarity_score IS NULL OR (content_similarity_score >= 0 AND content_similarity_score <= 1))');
        }
    }

    public function down(): void
    {
        Schema::table('similarity_results', function (Blueprint $table): void {
            $table->dropIndex('similarity_results_source_status_score_idx');
            $table->dropColumn([
                'title_similarity_score',
                'content_similarity_score',
                'score_status',
                'algorithm_version',
                'source_content_sha256',
                'matched_content_sha256',
            ]);
        });
    }
};
