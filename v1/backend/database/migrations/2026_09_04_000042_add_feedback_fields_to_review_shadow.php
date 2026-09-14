<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('research_review_records', function (Blueprint $table): void {
            $table->string('review_type', 50)->nullable()->after('source_type');
            $table->string('feedback_type', 50)->nullable();
            $table->dateTime('researcher_acknowledged_at', 6)->nullable();
            $table->dateTime('researcher_addressed_at', 6)->nullable();
            $table->longText('researcher_action_remarks')->nullable();
            $table->index(['review_type', 'research_document_id', 'status'], 'rrr_review_type_status_idx');
        });

        DB::table('research_review_records')
            ->where('source_type', 'revision')
            ->update(['review_type' => 'revision']);
        DB::table('research_review_records')
            ->where('source_type', 'title_validation')
            ->update(['review_type' => 'title_validation']);
        DB::table('research_review_records')
            ->where('source_type', 'feedback')
            ->update(['review_type' => 'feedback']);
    }

    public function down(): void
    {
        Schema::table('research_review_records', function (Blueprint $table): void {
            $table->dropIndex('rrr_review_type_status_idx');
            $table->dropColumn([
                'review_type',
                'feedback_type',
                'researcher_acknowledged_at',
                'researcher_addressed_at',
                'researcher_action_remarks',
            ]);
        });
    }
};
