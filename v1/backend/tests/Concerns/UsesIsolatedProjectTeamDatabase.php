<?php

namespace Tests\Concerns;

use App\Models\AuditLog;
use App\Services\AuditService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

trait UsesIsolatedProjectTeamDatabase
{
    use UsesIsolatedMonitoringDatabase {
        setUp as private setUpMonitoringFixtures;
    }

    protected function setUp(): void
    {
        $this->setUpMonitoringFixtures();
        // All additional fixture DDL/DML remains on the guarded :memory: PDO.
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        Schema::table('users', function (Blueprint $table): void {
            $table->string('student_employee_id')->nullable();
        });
        Schema::table('class_sections', function (Blueprint $table): void {
            $table->string('section_code')->nullable();
            $table->string('academic_year')->nullable();
            $table->boolean('is_active')->default(true);
        });
        Schema::table('research_authors', function (Blueprint $table): void {
            $table->boolean('is_corresponding_author')->default(false);
            $table->timestamps();
        });
        Schema::table('research_project_team_members', function (Blueprint $table): void {
            $table->unique(['research_document_id', 'defense_type', 'user_id'], 'fixture_team_stage_user_unique');
        });
        if ($this->canonicalMonitoringAssignments()) {
            Schema::table('research_assignments', function (Blueprint $table): void {
                $table->uuid('assigned_by')->nullable();
                $table->timestamp('assigned_at')->nullable();
                $table->timestamp('completed_at')->nullable();
            });
        }
        Schema::create('document_files', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
        });
        $this->mock(AuditService::class)->shouldReceive('log')->andReturn(new AuditLog);
    }
}
