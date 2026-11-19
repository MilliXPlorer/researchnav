<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\FeedbackComment;
use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\Revision;
use App\Models\User;
use App\Services\AuditService;
use App\Services\ConsolidationShadowService;
use App\Services\MonitoringService;
use App\Services\RevisionService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RevisionCanonicalContractTest extends TestCase
{
    private const ORIGIN = ['Origin' => 'http://localhost:5173'];

    protected function setUp(): void
    {
        parent::setUp();

        // Explicit, disposable connection. No migrations, application records,
        // or manuscript files are used by these HTTP/service contract tests.
        config([
            'database.default' => 'ar03_testing',
            'database.connections.ar03_testing' => [
                'driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '',
                'foreign_key_constraints' => true,
            ],
            'researchnav.allowed_origins' => ['http://localhost:5173'],
            'researchnav.consolidation.read_shadow' => false,
        ]);
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());

        Schema::create('user_roles', function (Blueprint $table): void {
            $table->id();
            $table->string('slug');
            $table->boolean('is_active')->default(true);
        });
        Schema::create('users', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('role_id');
            $table->string('role');
            $table->string('account_status')->default('active');
            $table->string('access_status')->default('active');
            $table->boolean('is_admin')->default(false);
            $table->string('email');
            $table->string('first_name')->default('Fixture');
            $table->string('last_name')->default('Account');
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('research_documents', function (Blueprint $table): void {
            $table->id();
            $table->uuid('submitted_by')->nullable();
            $table->unsignedBigInteger('section_id')->nullable();
            $table->string('title');
            $table->string('submission_reference')->nullable();
            $table->string('submission_status');
            $table->timestamp('submitted_at')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('class_section_members', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('class_section_id');
            $table->unsignedBigInteger('research_document_id');
            $table->uuid('user_id');
        });
        Schema::create('research_assignments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->uuid('user_id');
            $table->string('assignment_role');
            $table->string('assignment_scope')->default('research');
            $table->unsignedBigInteger('defense_id')->nullable();
            $table->string('status');
        });
        Schema::create('document_files', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->string('relative_path')->nullable();
            $table->string('document_type')->default('chapter');
            $table->boolean('is_current')->default(true);
            $table->timestamp('uploaded_at')->nullable();
        });
        Schema::create('research_reviews', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->unsignedBigInteger('document_file_id')->nullable();
            $table->uuid('reviewer_id');
            $table->string('reviewer_role');
            $table->string('review_type');
            $table->text('remarks')->nullable();
            $table->text('required_action')->nullable();
            $table->string('status');
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
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

        DB::table('user_roles')->insert([
            ['id' => 1, 'slug' => 'research_office', 'is_active' => true],
            ['id' => 2, 'slug' => 'researcher', 'is_active' => true],
            ['id' => 3, 'slug' => 'research_adviser', 'is_active' => true],
            ['id' => 4, 'slug' => 'research_panelist', 'is_active' => true],
            ['id' => 5, 'slug' => 'librarian', 'is_active' => true],
            ['id' => 6, 'slug' => 'research_panelist', 'is_active' => false],
        ]);
        $this->user(1, 'research-office', 1);
        $this->user(2, 'researcher', 2);
        $this->user(3, 'researcher', 2);
        DB::table('research_documents')->insert([
            ['id' => 7, 'submitted_by' => $this->id(2), 'section_id' => 4, 'title' => 'Canonical fixture', 'submission_status' => 'under_review'],
            ['id' => 8, 'submitted_by' => null, 'section_id' => null, 'title' => 'Other fixture', 'submission_status' => 'under_review'],
        ]);
        DB::table('class_section_members')->insert([
            'class_section_id' => 4, 'research_document_id' => 7, 'user_id' => $this->id(2),
        ]);
        DB::table('document_files')->insert([
            ['id' => 9, 'research_document_id' => 7, 'relative_path' => 'Chapter 3'],
            ['id' => 10, 'research_document_id' => 8, 'relative_path' => 'Chapter 3'],
        ]);

        // Actual database notification channel is exercised; only unrelated
        // audit/monitoring/shadow persistence is mocked.
        $this->mock(AuditService::class)->shouldReceive('log')->andReturn(new AuditLog);
        $this->mock(MonitoringService::class)->shouldReceive('log')->andReturn(new MonitoringLog);
        $this->mock(ConsolidationShadowService::class)->shouldReceive('mirrorRevision')->andReturnNull();
    }

    protected function tearDown(): void
    {
        DB::purge('ar03_testing');
        parent::tearDown();
    }

    public function test_file_linked_request_and_retrieval_use_the_canonical_column_and_preserve_ar02(): void
    {
        $revisionId = $this->requestRevision();
        $revision = Revision::with('documentFile')->findOrFail($revisionId);
        $this->assertSame(9, $revision->document_file_id);
        $this->assertSame(9, $revision->documentFile->id);
        $this->assertSame(7, $revision->documentFile->research_document_id);
        $this->assertArrayNotHasKey('file_id', $revision->getAttributes());
        $this->assertSame(9, DB::table('research_reviews')->where('id', $revisionId)->value('document_file_id'));
        $this->assertSame('requested', $revision->revision_status);
        $this->getJson('/api/research/7/revisions')->assertOk()
            ->assertJsonPath('data.0.document_file_id', 9)->assertJsonPath('data.0.revision_status', 'requested');
        $this->assertSame(0, FeedbackComment::count());

        $noteId = DB::table('research_reviews')->insertGetId([
            'research_document_id' => 7, 'document_file_id' => 9, 'reviewer_id' => $this->id(1),
            'reviewer_role' => 'research-office', 'review_type' => 'revision_request', 'status' => 'resolved',
            'remarks' => 'A historical feedback-only note.', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertSame([$revisionId], Revision::pluck('id')->all());
        $this->assertSame([$noteId], FeedbackComment::pluck('id')->all());
        $this->assertNull((new FeedbackComment)->resolveRouteBinding($revisionId));
        $this->assertNull((new Revision)->resolveRouteBinding($noteId));
    }

    public function test_cross_project_and_missing_file_ids_are_rejected_without_creating_a_revision(): void
    {
        $this->withSession(['user_id' => $this->id(1)]);
        foreach ([10, 999] as $fileId) {
            $this->postJson('/api/research/7/revisions', [
                'document_file_id' => $fileId, 'revision_remarks' => 'Must be rejected.',
            ], self::ORIGIN)->assertUnprocessable()->assertJsonValidationErrors('document_file_id');
        }
        $this->assertSame(0, Revision::count());
        $this->assertSame('under_review', ResearchDocument::findOrFail(7)->submission_status);
    }

    public function test_service_also_rejects_a_cross_project_file(): void
    {
        try {
            app(RevisionService::class)->request(User::findOrFail($this->id(1)), ResearchDocument::findOrFail(7), [
                'document_file_id' => 10, 'revision_remarks' => 'Must be rejected.',
            ]);
            $this->fail('The service accepted another project\'s file.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('document_file_id', $exception->errors());
        }
        $this->assertSame(0, Revision::count());
    }

    public function test_resubmission_uses_canonical_assignment_statuses_and_only_notifies_authorized_recipients(): void
    {
        $eligible = [
            $this->user(11, 'adviser', 3),
            $this->user(12, 'panel', 4),
            $this->user(13, 'librarian', 5),
        ];
        foreach (['active', 'accepted', 'confirmed'] as $index => $status) {
            $this->assignment($eligible[$index], $status);
        }
        $this->assignment($eligible[0], 'accepted'); // Duplicate assignment, one notification.
        foreach (['inactive', 'revoked', 'declined', 'rejected', 'requested', 'pending', 'completed'] as $index => $status) {
            $this->assignment($this->user(20 + $index, 'panel', 4), $status);
        }
        $this->assignment($this->user(31, 'panel', 4, ['account_status' => 'inactive']), 'active');
        $this->assignment($this->user(32, 'panel', 4, ['deleted_at' => now()]), 'active');
        $this->assignment($this->user(33, 'panel', 6), 'active'); // Disabled role definition.
        $this->assignment($this->user(34, 'researcher', 2), 'active', 7, 'panel'); // Stale role.
        $this->assignment($this->user(35, 'panel', 4), 'active', 8); // Another project.
        $this->user(36, 'panel', 4); // No assignment.

        $revisionId = $this->requestRevision();
        $this->withSession(['user_id' => $this->id(2)]);
        $this->patchJson('/api/research/7/revisions/'.$revisionId.'/resubmit', [], self::ORIGIN)
            ->assertUnprocessable()->assertJsonValidationErrors('revised_manuscript');
        $this->assertSame('requested', Revision::findOrFail($revisionId)->revision_status);
        $this->addRevisedFile($revisionId);
        $this->patchJson('/api/research/7/revisions/'.$revisionId.'/resubmit', [], self::ORIGIN)
            ->assertOk()->assertJsonPath('data.revision_status', 'resubmitted')->assertJsonPath('data.document_file_id', 9);
        $this->assertSame('under_review', ResearchDocument::findOrFail(7)->submission_status);
        $this->assertSame(0, FeedbackComment::count());

        $notifications = DB::table('notifications')->get()->filter(fn ($row) => json_decode($row->data, true)['event'] === 'REVISION_RESUBMITTED');
        $expected = array_map(fn (User $user): string => $user->id, $eligible);
        $actual = $notifications->pluck('notifiable_id')->all();
        sort($expected);
        sort($actual);
        $this->assertSame($expected, $actual);
        foreach ($notifications as $row) {
            $payload = json_decode($row->data, true);
            $this->assertSame(7, $row->research_document_id);
            $this->assertSame(7, $payload['research_document_id']);
            $this->assertSame('/research/7', $payload['action_url']);
        }

        $this->patchJson('/api/research/7/revisions/'.$revisionId.'/resubmit', [], self::ORIGIN)->assertUnprocessable();
        $this->assertSame(3, DB::table('notifications')->get()->filter(fn ($row) => json_decode($row->data, true)['event'] === 'REVISION_RESUBMITTED')->count());
    }

    public function test_unrelated_researcher_cannot_create_or_resubmit_and_remarks_are_validated(): void
    {
        $this->withSession(['user_id' => $this->id(3)])->postJson('/api/research/7/revisions', [
            'document_file_id' => 9, 'revision_remarks' => 'Not authorized.',
        ], self::ORIGIN)->assertForbidden();
        $this->withSession(['user_id' => $this->id(1)])->postJson('/api/research/7/revisions', [
            'document_file_id' => 9,
        ], self::ORIGIN)->assertUnprocessable()->assertJsonValidationErrors('revision_remarks');
        $revisionId = $this->requestRevision();
        $this->addRevisedFile($revisionId);
        $this->withSession(['user_id' => $this->id(3)])->patchJson('/api/research/7/revisions/'.$revisionId.'/resubmit', [], self::ORIGIN)->assertForbidden();
        $this->assertSame('requested', Revision::findOrFail($revisionId)->revision_status);
    }

    #[DataProvider('legacyAssignmentSchemas')]
    public function test_legacy_boolean_assignment_notifications_remain_supported(bool $hasStatus): void
    {
        Schema::drop('research_assignments');
        Schema::create('research_review_assignments', function (Blueprint $table) use ($hasStatus): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->uuid('reviewer_id');
            $table->string('review_role');
            $table->boolean('is_active');
            if ($hasStatus) {
                $table->string('status');
            }
        });
        $active = $this->user(11, 'adviser', 3);
        $inactive = $this->user(12, 'adviser', 3);
        DB::table('research_review_assignments')->insert([
            ['research_document_id' => 7, 'reviewer_id' => $active->id, 'review_role' => 'adviser', 'is_active' => true]
            + ($hasStatus ? ['status' => 'accepted'] : []),
            ['research_document_id' => 7, 'reviewer_id' => $inactive->id, 'review_role' => 'adviser', 'is_active' => false]
            + ($hasStatus ? ['status' => 'inactive'] : []),
        ]);
        if ($hasStatus) {
            $revoked = $this->user(13, 'adviser', 3);
            DB::table('research_review_assignments')->insert([
                'research_document_id' => 7, 'reviewer_id' => $revoked->id, 'review_role' => 'adviser',
                'is_active' => true, 'status' => 'revoked',
            ]);
        }
        $revisionId = $this->requestRevision();
        $this->addRevisedFile($revisionId);
        $this->withSession(['user_id' => $this->id(2)])->patchJson('/api/research/7/revisions/'.$revisionId.'/resubmit', [], self::ORIGIN)->assertOk();

        $notifications = DB::table('notifications')->get()->filter(fn ($row) => json_decode($row->data, true)['event'] === 'REVISION_RESUBMITTED');
        $this->assertSame([$active->id], $notifications->pluck('notifiable_id')->all());
    }

    public static function legacyAssignmentSchemas(): array
    {
        return [[false], [true]];
    }

    #[DataProvider('fileStorageContracts')]
    public function test_file_mapping_preserves_each_supported_storage_contract(string $storage, string $column): void
    {
        if ($storage !== 'research_reviews') {
            Schema::drop('research_reviews');
            Schema::create($storage, function (Blueprint $table) use ($storage, $column): void {
                $table->id();
                $table->unsignedBigInteger('research_document_id');
                $table->unsignedBigInteger($column)->nullable();
                if ($storage === 'research_review_records') {
                    $table->unsignedBigInteger('source_id');
                    $table->string('review_type');
                }
            });
            DB::table($storage)->insert([
                'id' => 55, 'research_document_id' => 7, $column => 9,
            ] + ($storage === 'research_review_records' ? ['source_id' => 55, 'review_type' => 'revision'] : []));
            $revision = Revision::with('documentFile')->findOrFail(55);
        } else {
            $revision = Revision::with('documentFile')->findOrFail($this->requestRevision());
        }
        $this->assertSame($column, Revision::column('document_file_id'));
        $this->assertSame(9, $revision->document_file_id);
        $this->assertSame(9, $revision->documentFile->id);
        $revision->document_file_id = null;
        $this->assertArrayHasKey($column, $revision->getAttributes());
        $this->assertNull($revision->getAttributes()[$column]);
        if ($column === 'document_file_id') {
            $this->assertArrayNotHasKey('file_id', $revision->getAttributes());
        }
    }

    public static function fileStorageContracts(): array
    {
        return [
            ['research_reviews', 'document_file_id'],
            ['revisions', 'document_file_id'],
            ['research_review_records', 'file_id'],
        ];
    }

    private function requestRevision(): int
    {
        $response = $this->withSession(['user_id' => $this->id(1)])->postJson('/api/research/7/revisions', [
            'document_file_id' => 9, 'revision_remarks' => 'Please revise the linked component.',
        ], self::ORIGIN);
        $response->assertCreated()->assertJsonPath('data.document_file_id', 9);

        return $response->json('data.id');
    }

    private function addRevisedFile(int $revisionId): void
    {
        DB::table('document_files')->insert([
            'id' => 11, 'research_document_id' => 7, 'relative_path' => 'Chapter 3',
            'document_type' => 'revised_manuscript', 'is_current' => true,
            'uploaded_at' => Revision::findOrFail($revisionId)->requested_at->copy()->addSecond(),
        ]);
    }

    private function assignment(User $user, string $status, int $researchId = 7, ?string $role = null): void
    {
        DB::table('research_assignments')->insert([
            'research_document_id' => $researchId, 'user_id' => $user->id,
            'assignment_role' => $role ?? $user->role, 'status' => $status,
        ]);
    }

    private function user(int $number, string $role, int $roleId, array $overrides = []): User
    {
        DB::table('users')->insert(array_merge([
            'id' => $this->id($number), 'role' => $role, 'role_id' => $roleId, 'email' => 'fixture'.$number.'@example.test',
        ], $overrides));

        return User::withTrashed()->findOrFail($this->id($number));
    }

    private function id(int $number): string
    {
        return sprintf('00000000-0000-4000-8000-%012d', $number);
    }
}
