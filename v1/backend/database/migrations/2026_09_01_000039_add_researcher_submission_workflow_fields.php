<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('research_documents', 'submission_reference')) {
            Schema::table('research_documents', function (Blueprint $table): void {
                $table->string('submission_reference', 40)->nullable()->after('submitted_by');
            });
        }

        // Existing records predate stable references. Keep their identifiers
        // deterministic while new submissions receive an opaque reference.
        DB::table('research_documents')->whereNull('submission_reference')->chunkById(500, function (Collection $researches): void {
            $researches->each(function (object $research): void {
                DB::table('research_documents')->where('id', $research->id)->whereNull('submission_reference')->update([
                    'submission_reference' => 'RN-LEGACY-'.str_pad((string) $research->id, 8, '0', STR_PAD_LEFT),
                ]);
            });
        });

        if (DB::table('research_documents')->whereNull('submission_reference')->exists()) {
            throw new RuntimeException('Submission reference backfill did not complete.');
        }
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->string('submission_reference', 40)->nullable(false)->change();
        });
        if (! Schema::hasIndex('research_documents', 'research_documents_submission_reference_unique')) {
            Schema::table('research_documents', function (Blueprint $table): void {
                $table->unique('submission_reference');
            });
        }
        if (! Schema::hasColumn('feedback_comments', 'researcher_acknowledged_at')) {
            Schema::table('feedback_comments', fn (Blueprint $table) => $table->dateTime('researcher_acknowledged_at', 6)->nullable()->after('feedback_status'));
        }
        if (! Schema::hasColumn('feedback_comments', 'researcher_addressed_at')) {
            Schema::table('feedback_comments', fn (Blueprint $table) => $table->dateTime('researcher_addressed_at', 6)->nullable()->after('researcher_acknowledged_at'));
        }
        if (! Schema::hasColumn('feedback_comments', 'researcher_action_remarks')) {
            Schema::table('feedback_comments', fn (Blueprint $table) => $table->longText('researcher_action_remarks')->nullable()->after('researcher_addressed_at'));
        }
    }

    public function down(): void
    {
        $feedbackColumns = array_filter(['researcher_acknowledged_at', 'researcher_addressed_at', 'researcher_action_remarks'], fn (string $column): bool => Schema::hasColumn('feedback_comments', $column));
        if ($feedbackColumns !== []) {
            Schema::table('feedback_comments', fn (Blueprint $table) => $table->dropColumn($feedbackColumns));
        }

        if (Schema::hasIndex('research_documents', 'research_documents_submission_reference_unique')) {
            Schema::table('research_documents', fn (Blueprint $table) => $table->dropUnique('research_documents_submission_reference_unique'));
        }
        if (Schema::hasColumn('research_documents', 'submission_reference')) {
            Schema::table('research_documents', fn (Blueprint $table) => $table->dropColumn('submission_reference'));
        }
    }
};
