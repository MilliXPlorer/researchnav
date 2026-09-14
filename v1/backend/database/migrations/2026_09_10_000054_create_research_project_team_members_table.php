<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('research_project_team_members', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('user_id', 36);
            $table->enum('team_role', ['adviser', 'research_office_representative', 'chair', 'panel_member']);
            $table->unsignedSmallInteger('position')->nullable();
            $table->char('assigned_by', 36);
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->cascadeOnDelete()->restrictOnUpdate();
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('assigned_by')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id', 'user_id'], 'project_team_document_user_unique');
            $table->index(['research_document_id', 'team_role'], 'project_team_document_role_idx');
            $table->index(['user_id', 'team_role'], 'project_team_user_role_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('research_project_team_members');
    }
};
