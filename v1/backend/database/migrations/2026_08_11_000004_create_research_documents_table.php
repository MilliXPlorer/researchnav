<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $isSqlite = DB::connection()->getDriverName() === 'sqlite';

        Schema::create('research_documents', function (Blueprint $table) use ($isSqlite): void {
            $table->id();
            $table->char('submitted_by', 36);
            $table->unsignedBigInteger('category_id')->nullable();
            $table->string('title', 500);
            $table->string('normalized_title', 500)->nullable();
            $table->longText('abstract')->nullable();
            $table->text('keywords')->nullable();
            $isSqlite ? $table->unsignedSmallInteger('publication_year')->nullable() : $table->year('publication_year')->nullable();
            $table->enum('research_stage', ['title_proposal', 'ongoing', 'completed']);
            $table->enum('submission_status', ['draft', 'submitted', 'under_review', 'revision_required', 'approved', 'archived'])->default('draft');
            $table->enum('archive_status', ['not_archived', 'pending_archiving', 'archived'])->default('not_archived');
            $table->enum('visibility', ['private', 'registered_only', 'public'])->default('private');
            $table->dateTime('submitted_at', 6)->nullable();
            $table->dateTime('approved_at', 6)->nullable();
            $table->dateTime('archived_at', 6)->nullable();
            $table->timestamps(6);
            $table->softDeletes('deleted_at', 6);
            $table->foreign('submitted_by')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('category_id')->references('id')->on('categories')->restrictOnDelete()->restrictOnUpdate();
            $table->index(['submitted_by', 'submission_status'], 'research_documents_submitter_status_idx');
            $table->index(['category_id', 'publication_year'], 'research_documents_category_year_idx');
            $table->index(['research_stage', 'submission_status', 'archive_status'], 'research_documents_stage_status_archive_idx');
            $table->index(['visibility', 'submission_status'], 'research_documents_visibility_status_idx');
            $table->index('normalized_title');
            $table->index('title', 'rd_title_idx');
            $table->index('category_id', 'rd_category_idx');
            $table->index('publication_year', 'rd_year_idx');
            $table->index('research_stage', 'rd_stage_idx');
            $table->index('submission_status', 'rd_submission_status_idx');
            $table->index('archive_status', 'rd_archive_status_idx');
            $table->index('visibility', 'rd_visibility_idx');
            $table->index('submitted_by', 'rd_submitted_by_idx');
            $table->index('submitted_at', 'rd_submitted_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('research_documents');
    }
};
