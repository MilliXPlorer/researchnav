<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $addTitleWeight = ! Schema::hasColumn('similarity_results', 'title_weight');
        $addContentWeight = ! Schema::hasColumn('similarity_results', 'content_weight');
        $addOverallScore = ! Schema::hasColumn('similarity_results', 'overall_similarity_score');
        $addClassification = ! Schema::hasColumn('similarity_results', 'classification');
        $addOverallFlagged = ! Schema::hasColumn('similarity_results', 'overall_flagged');
        $addTitleAlert = ! Schema::hasColumn('similarity_results', 'title_match_alert');
        $addReviewRequired = ! Schema::hasColumn('similarity_results', 'adviser_review_required');
        $addFlagReason = ! Schema::hasColumn('similarity_results', 'flag_reason');

        Schema::table('similarity_results', function (Blueprint $table): void {
            $table->decimal('final_similarity_score', 14, 12)->nullable()->change();
            $table->decimal('cosine_score', 14, 12)->nullable()->change();
            $table->decimal('content_similarity_score', 14, 12)->nullable()->change();
            $table->decimal('title_similarity_score', 14, 12)->nullable()->change();
        });

        // MariaDB DDL is not transactional. Each addition is guarded so an
        // interrupted migration can resume without duplicating completed work.
        Schema::table('similarity_results', function (Blueprint $table) use ($addTitleWeight, $addContentWeight, $addOverallScore, $addClassification, $addOverallFlagged, $addTitleAlert, $addReviewRequired, $addFlagReason): void {
            if ($addTitleWeight) {
                $table->decimal('title_weight', 14, 12)->nullable()->after('title_similarity_score');
            }
            if ($addContentWeight) {
                $table->decimal('content_weight', 14, 12)->nullable()->after('content_similarity_score');
            }
            if ($addOverallScore) {
                $table->decimal('overall_similarity_score', 14, 12)->nullable()->after('final_similarity_score');
            }
            if ($addClassification) {
                $table->string('classification', 16)->nullable()->after('overall_similarity_score');
            }
            if ($addOverallFlagged) {
                $table->boolean('overall_flagged')->default(false)->after('classification');
            }
            if ($addTitleAlert) {
                $table->boolean('title_match_alert')->default(false)->after('overall_flagged');
            }
            if ($addReviewRequired) {
                $table->boolean('adviser_review_required')->default(false)->after('title_match_alert');
            }
            if ($addFlagReason) {
                $table->string('flag_reason', 32)->default('not_flagged')->after('adviser_review_required');
            }
        });

        if (! Schema::hasIndex('similarity_results', 'similarity_results_version_overall_score_idx')) {
            Schema::table('similarity_results', fn (Blueprint $table) => $table->index(['algorithm_version', 'overall_similarity_score'], 'similarity_results_version_overall_score_idx'));
        }
        if (! Schema::hasIndex('similarity_results', 'similarity_results_review_required_idx')) {
            Schema::table('similarity_results', fn (Blueprint $table) => $table->index(['adviser_review_required', 'analyzed_at'], 'similarity_results_review_required_idx'));
        }

        // Backfill only canonical decisions. Old component/final scores and the
        // old algorithm version remain untouched and are never relabelled as an
        // official weighted overall.
        DB::statement(<<<'SQL'
            UPDATE similarity_results
            SET overall_flagged = CASE WHEN is_flagged THEN 1 ELSE 0 END,
                title_match_alert = CASE WHEN title_similarity_score >= 0.900000000000 THEN 1 ELSE 0 END,
                adviser_review_required = CASE WHEN is_flagged OR title_similarity_score >= 0.900000000000 THEN 1 ELSE 0 END,
                flag_reason = CASE
                    WHEN is_flagged AND title_similarity_score >= 0.900000000000 THEN 'overall_and_title_match'
                    WHEN is_flagged THEN 'overall_high_similarity'
                    WHEN title_similarity_score >= 0.900000000000 THEN 'near_exact_title_match'
                    ELSE 'not_flagged'
                END
            WHERE algorithm_version IS NULL OR algorithm_version <> 'title-content-weighted-v1'
            SQL);

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            $constraints = [
                'similarity_results_weighted_weight_bounds' => 'CHECK ((title_weight IS NULL OR (title_weight >= 0 AND title_weight <= 1)) AND (content_weight IS NULL OR (content_weight >= 0 AND content_weight <= 1)))',
                'similarity_results_overall_score_bounds' => 'CHECK (overall_similarity_score IS NULL OR (overall_similarity_score >= 0 AND overall_similarity_score <= 1))',
                'similarity_results_weighted_classification_values' => "CHECK (classification IS NULL OR classification IN ('low', 'moderate', 'high'))",
                'similarity_results_weighted_reason_values' => "CHECK (flag_reason IN ('overall_high_similarity', 'near_exact_title_match', 'overall_and_title_match', 'not_flagged'))",
                'similarity_results_weighted_decision_consistency' => "CHECK (is_flagged = overall_flagged AND adviser_review_required = (overall_flagged OR title_match_alert) AND ((overall_flagged AND title_match_alert AND flag_reason = 'overall_and_title_match') OR (overall_flagged AND NOT title_match_alert AND flag_reason = 'overall_high_similarity') OR (NOT overall_flagged AND title_match_alert AND flag_reason = 'near_exact_title_match') OR (NOT overall_flagged AND NOT title_match_alert AND flag_reason = 'not_flagged')))",
                'similarity_results_current_weighted_consistency' => "CHECK (algorithm_version <> 'title-content-weighted-v1' OR (title_weight = 0.300000000000 AND content_weight = 0.700000000000 AND (((title_similarity_score IS NULL OR content_similarity_score IS NULL) AND overall_similarity_score IS NULL AND classification IS NULL) OR (title_similarity_score IS NOT NULL AND content_similarity_score IS NOT NULL AND overall_similarity_score IS NOT NULL AND classification IS NOT NULL))))",
            ];

            foreach ($constraints as $name => $definition) {
                if (! $this->hasConstraint($name)) {
                    DB::statement("ALTER TABLE similarity_results ADD CONSTRAINT {$name} {$definition}");
                }
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('similarity_results') && DB::table('similarity_results')
            ->where('algorithm_version', 'title-content-weighted-v1')->exists()) {
            throw new RuntimeException('Cannot roll back weighted similarity fields after weighted rows exist.');
        }

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            foreach ([
                'similarity_results_weighted_weight_bounds',
                'similarity_results_overall_score_bounds',
                'similarity_results_weighted_classification_values',
                'similarity_results_weighted_reason_values',
                'similarity_results_weighted_decision_consistency',
                'similarity_results_current_weighted_consistency',
            ] as $constraint) {
                if ($this->hasConstraint($constraint)) {
                    DB::statement("ALTER TABLE similarity_results DROP CONSTRAINT {$constraint}");
                }
            }
        }

        Schema::table('similarity_results', function (Blueprint $table): void {
            $table->dropIndex('similarity_results_version_overall_score_idx');
            $table->dropIndex('similarity_results_review_required_idx');
            $table->dropColumn([
                'title_weight', 'content_weight', 'overall_similarity_score', 'classification',
                'overall_flagged', 'title_match_alert', 'adviser_review_required', 'flag_reason',
            ]);
        });
    }

    private function hasConstraint(string $name): bool
    {
        return DB::table('information_schema.table_constraints')
            ->whereRaw('constraint_schema = database()')
            ->where('table_name', 'similarity_results')
            ->where('constraint_name', $name)
            ->exists();
    }
};
