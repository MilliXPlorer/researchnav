<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('similarity_results', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('source_research_id');
            $table->unsignedBigInteger('matched_research_id');
            $table->string('source_title', 500);
            $table->string('matched_title', 500);
            $table->decimal('tfidf_score', 8, 6)->nullable();
            $table->decimal('cosine_score', 8, 6)->default(0);
            $table->decimal('fasttext_score', 8, 6)->nullable();
            $table->decimal('final_similarity_score', 8, 6);
            $table->decimal('threshold', 8, 6)->default(0.700000);
            $table->boolean('is_flagged')->default(false);
            $table->longText('contextual_analysis')->nullable();
            $table->json('matched_terms')->nullable();
            $table->enum('analysis_type', ['title', 'document', 'search_retrieval']);
            $table->dateTime('analyzed_at', 6);
            $table->timestamps(6);
            $table->foreign('source_research_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('matched_research_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->index(['source_research_id', 'final_similarity_score'], 'similarity_results_source_score_idx');
            $table->index(['matched_research_id', 'final_similarity_score'], 'similarity_results_matched_score_idx');
            $table->index(['is_flagged', 'analyzed_at']);
            $table->index('analysis_type');
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_score_bounds CHECK (tfidf_score IS NULL OR (tfidf_score >= 0 AND tfidf_score <= 1))');
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_cosine_score_bounds CHECK (cosine_score >= 0 AND cosine_score <= 1)');
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_fasttext_score_bounds CHECK (fasttext_score IS NULL OR (fasttext_score >= 0 AND fasttext_score <= 1))');
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_final_score_bounds CHECK (final_similarity_score >= 0 AND final_similarity_score <= 1)');
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_threshold_bounds CHECK (threshold >= 0 AND threshold <= 1)');
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_distinct_documents CHECK (source_research_id <> matched_research_id)');
            DB::statement('ALTER TABLE similarity_results ADD CONSTRAINT similarity_results_flag_consistency CHECK (is_flagged = (final_similarity_score >= threshold))');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('similarity_results');
    }
};
