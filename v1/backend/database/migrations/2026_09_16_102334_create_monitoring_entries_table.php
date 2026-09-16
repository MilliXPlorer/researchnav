<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('monitoring_entries')) {
            return;
        }

        Schema::create('monitoring_entries', function (Blueprint $table): void {
            $table->id();

            $table->unsignedBigInteger('research_document_id');
            $table->char('reviewer_id', 36)->nullable();
            $table->string('reviewer_role', 100);
            $table->string('monitoring_stage', 50);
            $table->string('designation', 100)->nullable();

            $table->date('activity_date')->nullable();
            $table->text('activity')->nullable();
            $table->text('remarks')->nullable();

            $table->string('status', 50)->default('pending');
            $table->string('signature_status', 50)->default('unsigned');

            $table->char('verified_by', 36)->nullable();
            $table->timestamp('verified_at')->nullable();

            $table->timestamp('created_at')->nullable()->useCurrent();
            $table->timestamp('updated_at')->nullable()->useCurrent()->useCurrentOnUpdate();

            $table->index('research_document_id', 'idx_monitoring_research');
            $table->index('reviewer_id', 'idx_monitoring_reviewer');
            $table->index('monitoring_stage', 'idx_monitoring_stage');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('monitoring_entries');
    }
};