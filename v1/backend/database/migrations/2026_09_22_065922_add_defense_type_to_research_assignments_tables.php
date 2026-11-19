<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("
                ALTER TABLE research_project_team_members
                MODIFY team_role ENUM(
                    'researcher',
                    'adviser',
                    'research_office_representative',
                    'chair',
                    'panel_member'
                ) NOT NULL
            ");
        }

        Schema::table('research_project_team_members', function (Blueprint $table): void {
            $table->dropUnique('project_team_document_user_unique');

            if (! Schema::hasColumn('research_project_team_members', 'defense_type')) {
                $table->enum('defense_type', ['proposal', 'final'])
                    ->default('proposal')
                    ->after('research_document_id');
            }

            $table->unique(
                ['research_document_id', 'defense_type', 'user_id'],
                'project_team_document_defense_user_unique'
            );

            $table->index(
                ['research_document_id', 'defense_type', 'team_role'],
                'project_team_document_defense_role_idx'
            );
        });

        if (! Schema::hasTable('research_review_assignments')) {
            return;
        }

        Schema::table('research_review_assignments', function (Blueprint $table): void {
            $table->dropUnique('research_review_assignment_unique');

            $table->enum('defense_type', ['proposal', 'final'])
                ->default('proposal')
                ->after('research_document_id');

            $table->unique(
                ['research_document_id', 'defense_type', 'reviewer_id', 'review_role'],
                'research_review_assignment_defense_unique'
            );

            $table->index(
                ['research_document_id', 'defense_type', 'is_active'],
                'review_assignment_document_defense_active_idx'
            );
        });
    }

    public function down(): void
    {
        DB::table('research_project_team_members')
            ->where('team_role', 'researcher')
            ->delete();

        Schema::table('research_project_team_members', function (Blueprint $table): void {
            $table->dropUnique('project_team_document_defense_user_unique');
            $table->dropIndex('project_team_document_defense_role_idx');

            $table->dropColumn('defense_type');

            $table->unique(
                ['research_document_id', 'user_id'],
                'project_team_document_user_unique'
            );
        });

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("
                ALTER TABLE research_project_team_members
                MODIFY team_role ENUM(
                    'adviser',
                    'research_office_representative',
                    'chair',
                    'panel_member'
                ) NOT NULL
            ");
        }

        if (! Schema::hasTable('research_review_assignments')) {
            return;
        }

        Schema::table('research_review_assignments', function (Blueprint $table): void {
            $table->dropUnique('research_review_assignment_defense_unique');
            $table->dropIndex('review_assignment_document_defense_active_idx');

            $table->dropColumn('defense_type');

            $table->unique(
                ['research_document_id', 'reviewer_id', 'review_role'],
                'research_review_assignment_unique'
            );
        });
    }
};