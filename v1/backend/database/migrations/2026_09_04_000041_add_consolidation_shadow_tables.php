<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('research_review_records', function (Blueprint $table): void {
            $table->id();
            $table->string('source_type', 50);
            $table->unsignedBigInteger('source_id');
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
            $table->longText('remarks')->nullable();
            $table->dateTime('requested_at', 6)->nullable();
            $table->dateTime('submitted_at', 6)->nullable();
            $table->dateTime('decided_at', 6)->nullable();
            $table->dateTime('resolved_at', 6)->nullable();
            $table->dateTime('validated_at', 6)->nullable();
            $table->timestamps(6);
            $table->unique(['source_type', 'source_id']);
            $table->index(['research_document_id', 'source_type', 'status'], 'rrr_document_type_status_idx');
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('file_id')->references('id')->on('document_files')->nullOnDelete();
            $table->foreign('similarity_result_id')->references('id')->on('similarity_results')->nullOnDelete();
        });

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
            $table->foreign('research_document_id')->references('id')->on('research_documents')->nullOnDelete();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('subject_user_id')->references('id')->on('users')->nullOnDelete();
        });

        DB::statement(<<<'SQL'
            INSERT INTO research_review_records
                (source_type, source_id, research_document_id, actor_id, file_id, status, sequence_number, remarks, requested_at, submitted_at, resolved_at, created_at, updated_at)
            SELECT 'revision', id, research_document_id, requested_by, document_file_id, revision_status, revision_number, revision_remarks, requested_at, submitted_at, resolved_at, created_at, updated_at
            FROM revisions
        SQL);
        DB::statement(<<<'SQL'
            INSERT INTO research_review_records
                (source_type, source_id, research_document_id, actor_id, similarity_result_id, status, remarks, validated_at, created_at, updated_at)
            SELECT 'title_validation', id, research_document_id, validated_by, similarity_result_id, validation_status, adviser_remarks, validated_at, created_at, updated_at
            FROM title_validations
        SQL);
        DB::statement(<<<'SQL'
            INSERT INTO research_review_records
                (source_type, source_id, research_document_id, actor_id, remarks, status, created_at, updated_at)
            SELECT 'feedback', id, research_document_id, user_id, comment, feedback_status, created_at, updated_at
            FROM feedback_comments
        SQL);
        DB::statement(<<<'SQL'
            INSERT INTO activity_logs
                (stream, source_id, research_document_id, actor_id, action, description, remarks, previous_status, new_status, monitoring_status, occurred_at, created_at, updated_at)
            SELECT 'research', id, research_document_id, performed_by, activity_type, NULL, remarks, previous_status, new_status, monitoring_status, activity_date, created_at, created_at
            FROM monitoring_logs
        SQL);
        DB::statement(<<<'SQL'
            INSERT INTO activity_logs
                (stream, source_id, actor_id, action, entity_type, entity_id, description, ip_address, user_agent, occurred_at, created_at, updated_at)
            SELECT 'audit', id, user_id, action, entity_type, entity_id, description, ip_address, user_agent, created_at, created_at, created_at
            FROM audit_logs
        SQL);
    }

    public function down(): void
    {
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('research_review_records');
    }
};
