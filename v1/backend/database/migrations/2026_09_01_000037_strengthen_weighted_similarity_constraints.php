<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const CURRENT_VERSION = 'title-content-weighted-v1';

    public function up(): void
    {
        if (! in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        // 000036 was already applied. Replace only its incomplete current-policy
        // check; all rows and all historical constraints remain untouched.
        if ($this->hasConstraint('similarity_results_current_weighted_consistency')) {
            DB::statement('ALTER TABLE similarity_results DROP CONSTRAINT similarity_results_current_weighted_consistency');
        }

        $version = self::CURRENT_VERSION;
        $constraints = [
            'similarity_results_current_weighted_formula' => "CHECK (algorithm_version <> '{$version}' OR (title_weight = 0.300000000000 AND content_weight = 0.700000000000 AND (overall_similarity_score IS NULL OR (title_similarity_score IS NOT NULL AND content_similarity_score IS NOT NULL AND overall_similarity_score = TRUNCATE((title_similarity_score * title_weight) + (content_similarity_score * content_weight), 12)))))",
            'similarity_results_current_weighted_status' => "CHECK (algorithm_version <> '{$version}' OR ((score_status = 'scored' AND title_similarity_score IS NOT NULL AND content_similarity_score IS NOT NULL AND overall_similarity_score IS NOT NULL AND tfidf_score IS NOT NULL AND final_similarity_score = overall_similarity_score AND cosine_score = overall_similarity_score AND classification IS NOT NULL) OR (score_status = 'content_unavailable' AND content_similarity_score IS NULL AND overall_similarity_score IS NULL AND tfidf_score IS NULL AND final_similarity_score IS NULL AND cosine_score IS NULL AND classification IS NULL)))",
            'similarity_results_current_weighted_classification' => "CHECK (algorithm_version <> '{$version}' OR (classification IS NULL OR classification = CASE WHEN overall_similarity_score >= 0.700000000000 THEN 'high' WHEN overall_similarity_score >= 0.400000000000 THEN 'moderate' ELSE 'low' END))",
            'similarity_results_current_weighted_flags' => "CHECK (algorithm_version <> '{$version}' OR (((overall_similarity_score IS NULL AND NOT overall_flagged) OR (overall_similarity_score IS NOT NULL AND overall_flagged = (overall_similarity_score >= 0.700000000000))) AND ((title_similarity_score IS NULL AND NOT title_match_alert) OR (title_similarity_score IS NOT NULL AND title_match_alert = (title_similarity_score >= 0.900000000000)))))",
            'similarity_results_current_weighted_reasons' => "CHECK (algorithm_version <> '{$version}' OR ((overall_flagged AND title_match_alert AND adviser_review_required AND flag_reason = 'overall_and_title_match') OR (overall_flagged AND NOT title_match_alert AND adviser_review_required AND flag_reason = 'overall_high_similarity') OR (NOT overall_flagged AND title_match_alert AND adviser_review_required AND flag_reason = 'near_exact_title_match') OR (NOT overall_flagged AND NOT title_match_alert AND NOT adviser_review_required AND flag_reason = 'not_flagged')))",
        ];

        foreach ($constraints as $name => $definition) {
            if (! $this->hasConstraint($name)) {
                DB::statement("ALTER TABLE similarity_results ADD CONSTRAINT {$name} {$definition}");
            }
        }
    }

    public function down(): void
    {
        if (! in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        foreach ([
            'similarity_results_current_weighted_formula',
            'similarity_results_current_weighted_status',
            'similarity_results_current_weighted_classification',
            'similarity_results_current_weighted_flags',
            'similarity_results_current_weighted_reasons',
        ] as $constraint) {
            if ($this->hasConstraint($constraint)) {
                DB::statement("ALTER TABLE similarity_results DROP CONSTRAINT {$constraint}");
            }
        }

        // Restore precisely the predecessor check from 000036 so rolling this
        // migration back restores the prior contract rather than weakening it.
        $name = 'similarity_results_current_weighted_consistency';
        if (! $this->hasConstraint($name)) {
            $version = self::CURRENT_VERSION;
            $definition = "CHECK (algorithm_version <> '{$version}' OR (title_weight = 0.300000000000 AND content_weight = 0.700000000000 AND (((title_similarity_score IS NULL OR content_similarity_score IS NULL) AND overall_similarity_score IS NULL AND classification IS NULL) OR (title_similarity_score IS NOT NULL AND content_similarity_score IS NOT NULL AND overall_similarity_score IS NOT NULL AND classification IS NOT NULL))))";
            DB::statement("ALTER TABLE similarity_results ADD CONSTRAINT {$name} {$definition}");
        }
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
