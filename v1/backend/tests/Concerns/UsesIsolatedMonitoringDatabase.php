<?php

namespace Tests\Concerns;

use App\Models\MonitoringLog;
use App\Models\User;
use App\Services\MonitoringService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/** Disposable schema fixtures only; never runs migrations or accesses MariaDB. */
trait UsesIsolatedMonitoringDatabase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'database.default' => 'ar04_testing',
            'database.connections.ar04_testing' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => true],
            'researchnav.allowed_origins' => ['http://localhost:5173'],
            'session.driver' => 'array',
        ]);
        // These checks precede every fixture DDL/DML statement.
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        DB::connection()->getPdo()->sqliteCreateFunction('CONCAT_WS', fn ($separator, ...$parts) => implode($separator, array_filter($parts, fn ($part) => $part !== null)));
        Storage::fake('researchnav_private');
        $this->mock(MonitoringService::class)->shouldReceive('log')->andReturn(new MonitoringLog);

        Schema::create('user_roles', function (Blueprint $table): void {
            $table->id();
            $table->string('slug');
            $table->boolean('is_active')->default(true);
        });
        Schema::create('users', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('role_id')->nullable();
            $table->string('role')->nullable();
            $table->string('email');
            $table->string('first_name')->nullable();
            $table->string('middle_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('account_status')->default('active');
            $table->string('access_status')->default('active');
            $table->boolean('is_admin')->default(false);
            $table->softDeletes();
            $table->timestamps();
        });
        foreach (User::LEGACY_ROLES as $role) {
            DB::table('user_roles')->insertOrIgnore(['slug' => User::canonicalSlugForLegacyRole($role), 'is_active' => true]);
        }
        Schema::create('categories', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug');
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('class_sections', function (Blueprint $table): void {
            $table->id();
            $table->uuid('instructor_id');
            $table->string('name');
            $table->timestamps();
        });
        Schema::create('research_documents', function (Blueprint $table): void {
            $table->id();
            $table->uuid('submitted_by')->nullable();
            $table->unsignedBigInteger('section_id')->nullable();
            $table->unsignedBigInteger('category_id')->nullable();
            foreach (['title', 'normalized_title', 'submission_reference', 'research_stage', 'submission_status', 'archive_status', 'visibility', 'institute'] as $column) {
                $table->string($column)->nullable();
            }
            $table->text('abstract')->nullable();
            $table->text('keywords')->nullable();
            $table->unsignedInteger('publication_year')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('research_authors', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->uuid('user_id')->nullable();
            $table->string('author_name');
            $table->unsignedInteger('author_order')->default(1);
        });
        Schema::create('class_section_members', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('class_section_id');
            $table->unsignedBigInteger('research_document_id')->nullable();
            $table->uuid('user_id');
            $table->timestamps();
        });
        Schema::create('research_project_team_members', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->string('defense_type')->default('proposal');
            $table->uuid('user_id');
            $table->string('team_role');
            $table->unsignedInteger('position')->nullable();
            $table->uuid('assigned_by')->nullable();
            $table->timestamps();
        });
        if ($this->canonicalMonitoringAssignments()) {
            Schema::create('research_assignments', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('research_document_id');
                $table->uuid('user_id');
                $table->string('assignment_role');
                $table->string('designation')->nullable();
                $table->string('assignment_scope')->default('research');
                $table->unsignedBigInteger('defense_id')->nullable();
                $table->string('status')->default('active');
                $table->timestamps();
            });
        } else {
            Schema::create('research_review_assignments', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('research_document_id');
                $table->uuid('reviewer_id');
                $table->string('review_role');
                $table->string('defense_type')->default('proposal');
                $table->boolean('is_active')->default(true);
                $table->string('status')->default('active');
                $table->string('designation')->nullable();
                $table->uuid('assigned_by')->nullable();
                $table->timestamps();
            });
        }
        Schema::create('monitoring_entries', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->uuid('reviewer_id');
            $table->string('reviewer_role');
            $table->string('monitoring_stage');
            $table->string('designation');
            $table->date('activity_date')->nullable();
            $table->text('activity');
            $table->text('remarks')->nullable();
            $table->string('status');
            $table->string('signature_status');
            $table->uuid('verified_by')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
        });
        Schema::create('notifications', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->string('notifiable_type');
            $table->uuid('notifiable_id');
            $table->unsignedBigInteger('research_document_id')->nullable();
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    protected function canonicalMonitoringAssignments(): bool
    {
        return false;
    }

    protected function tearDown(): void
    {
        DB::purge('ar04_testing');
        parent::tearDown();
    }
}
