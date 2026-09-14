<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $insertIgnore = DB::getDriverName() === 'sqlite' ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
        if (! Schema::hasTable('research_review_records')) {
            Schema::create('research_review_records', function (Blueprint $table): void {
                $table->id();
                $table->string('source_type', 50);
                $table->unsignedBigInteger('source_id');
                $table->string('review_type', 50)->nullable();
                $table->unsignedBigInteger('research_document_id');
                $table->char('actor_id', 36)->nullable();
                $table->unsignedBigInteger('file_id')->nullable();
                $table->unsignedBigInteger('similarity_result_id')->nullable();
                $table->string('status', 50)->nullable();
                $table->unsignedInteger('sequence_number')->nullable();
                $table->unsignedTinyInteger('originality')->nullable();
                $table->unsignedTinyInteger('methodology')->nullable();
                $table->unsignedTinyInteger('clarity')->nullable();
                $table->boolean('design_fit')->nullable();
                $table->boolean('sample_size')->nullable();
                $table->boolean('instrument_validity')->nullable();
                $table->boolean('analysis_plan')->nullable();
                $table->boolean('title_complete')->nullable();
                $table->boolean('abstract_complete')->nullable();
                $table->boolean('authors_complete')->nullable();
                $table->boolean('keywords_complete')->nullable();
                $table->boolean('category_complete')->nullable();
                $table->boolean('format_compliant')->nullable();
                $table->boolean('attachments_compliant')->nullable();
                $table->boolean('consent_forms_compliant')->nullable();
                $table->text('notes')->nullable();
                $table->string('feedback_type', 50)->nullable();
                $table->longText('remarks')->nullable();
                $table->longText('researcher_action_remarks')->nullable();
                $table->dateTime('requested_at', 6)->nullable();
                $table->dateTime('submitted_at', 6)->nullable();
                $table->dateTime('decided_at', 6)->nullable();
                $table->dateTime('resolved_at', 6)->nullable();
                $table->dateTime('validated_at', 6)->nullable();
                $table->dateTime('signed_off_at', 6)->nullable();
                $table->dateTime('researcher_acknowledged_at', 6)->nullable();
                $table->dateTime('researcher_addressed_at', 6)->nullable();
                $table->timestamps(6);
                $table->unique(['source_type', 'source_id']);
                $table->index(['review_type', 'research_document_id', 'status'], 'rrr_type_document_status_idx');
            });
        }
        if (! Schema::hasTable('activity_logs')) {
            Schema::create('activity_logs', function (Blueprint $table): void {
                $table->id();
                $table->string('stream', 20);
                $table->unsignedBigInteger('source_id');
                $table->unsignedBigInteger('research_document_id')->nullable();
                $table->char('actor_id', 36)->nullable();
                $table->char('subject_user_id', 36)->nullable();
                $table->string('action', 100);
                $table->string('entity_type', 150)->nullable();
                $table->string('entity_id', 100)->nullable();
                $table->longText('description')->nullable();
                $table->longText('remarks')->nullable();
                $table->string('previous_status', 100)->nullable();
                $table->string('new_status', 100)->nullable();
                $table->string('monitoring_status', 100)->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->text('user_agent')->nullable();
                $table->dateTime('occurred_at', 6);
                $table->timestamps(6);
                $table->unique(['stream', 'source_id']);
                $table->index(['stream', 'research_document_id', 'occurred_at'], 'activity_stream_document_date_idx');
                $table->index(['stream', 'actor_id', 'occurred_at'], 'activity_stream_actor_date_idx');
                $table->index(['stream', 'action', 'occurred_at'], 'activity_stream_action_date_idx');
            });
        }

        DB::statement("{$insertIgnore} INTO research_review_records (source_type, source_id, review_type, research_document_id, actor_id, file_id, status, sequence_number, remarks, requested_at, submitted_at, resolved_at, created_at, updated_at) SELECT 'revision', id, 'revision', research_document_id, requested_by, document_file_id, revision_status, revision_number, revision_remarks, requested_at, submitted_at, resolved_at, created_at, updated_at FROM revisions");
        DB::statement("{$insertIgnore} INTO research_review_records (source_type, source_id, review_type, research_document_id, actor_id, similarity_result_id, status, remarks, validated_at, created_at, updated_at) SELECT 'title_validation', id, 'title_validation', research_document_id, validated_by, similarity_result_id, validation_status, adviser_remarks, validated_at, created_at, updated_at FROM title_validations");
        DB::statement("{$insertIgnore} INTO research_review_records (source_type, source_id, review_type, research_document_id, actor_id, file_id, status, feedback_type, remarks, researcher_acknowledged_at, researcher_addressed_at, researcher_action_remarks, created_at, updated_at) SELECT 'feedback', id, 'feedback', research_document_id, user_id, document_file_id, feedback_status, feedback_type, comment, researcher_acknowledged_at, researcher_addressed_at, researcher_action_remarks, created_at, updated_at FROM feedback_comments");
        DB::statement("{$insertIgnore} INTO research_review_records (source_type, source_id, review_type, research_document_id, actor_id, status, originality, methodology, clarity, remarks, submitted_at, created_at, updated_at) SELECT 'evaluation', id, 'evaluation', research_document_id, panelist_id, 'submitted', originality, methodology, clarity, comments, submitted_at, created_at, updated_at FROM evaluations");
        DB::statement("{$insertIgnore} INTO research_review_records (source_type, source_id, review_type, research_document_id, actor_id, status, design_fit, sample_size, instrument_validity, analysis_plan, remarks, signed_off_at, created_at, updated_at) SELECT 'methodology_review', id, 'methodology_review', research_document_id, statistician_id, review_status, design_fit, sample_size, instrument_validity, analysis_plan, remarks, signed_off_at, created_at, updated_at FROM methodology_reviews");
        DB::statement("{$insertIgnore} INTO research_review_records (source_type, source_id, review_type, research_document_id, actor_id, status, format_compliant, attachments_compliant, consent_forms_compliant, remarks, decided_at, created_at, updated_at) SELECT 'compliance_review', id, 'compliance_review', research_document_id, reviewed_by, review_status, format_compliant, attachments_compliant, consent_forms_compliant, remarks, decided_at, created_at, updated_at FROM compliance_reviews");
        DB::statement("{$insertIgnore} INTO research_review_records (source_type, source_id, review_type, research_document_id, actor_id, status, title_complete, abstract_complete, authors_complete, keywords_complete, category_complete, notes, created_at, updated_at) SELECT 'metadata_review', id, 'metadata_review', research_document_id, reviewed_by, review_status, title_complete, abstract_complete, authors_complete, keywords_complete, category_complete, notes, created_at, updated_at FROM metadata_reviews");
        DB::statement("{$insertIgnore} INTO activity_logs (stream, source_id, research_document_id, actor_id, action, remarks, previous_status, new_status, monitoring_status, occurred_at, created_at, updated_at) SELECT 'research', id, research_document_id, performed_by, activity_type, remarks, previous_status, new_status, monitoring_status, activity_date, created_at, created_at FROM monitoring_logs");
        DB::statement("{$insertIgnore} INTO activity_logs (stream, source_id, actor_id, action, entity_type, entity_id, description, ip_address, user_agent, occurred_at, created_at, updated_at) SELECT 'audit', id, user_id, action, entity_type, entity_id, description, ip_address, user_agent, created_at, created_at, created_at FROM audit_logs");

        // The v2 cutover drops source tables only on the MariaDB deployment. SQLite
        // test databases retain them because the existing contract tests exercise
        // the typed models independently.
        if (DB::getDriverName() !== 'sqlite') {
            foreach (['title_validations', 'revisions', 'evaluations', 'methodology_reviews', 'compliance_reviews', 'metadata_reviews', 'monitoring_logs', 'retention_logs', 'privacy_logs', 'feedback_comments'] as $table) {
                Schema::dropIfExists($table);
            }
        }
    }

    public function down(): void
    {
        throw new RuntimeException('The v2 finalization migration is irreversible; restore researchnav_db backup to roll back.');
    }
};
