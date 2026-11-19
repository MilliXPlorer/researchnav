<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\FeedbackComment;
use App\Models\MonitoringLog;
use App\Models\Revision;
use App\Services\AuditService;
use App\Services\ConsolidationShadowService;
use App\Services\MonitoringService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class FeedbackRevisionSeparationTest extends TestCase
{
    private const OFFICE = '00000000-0000-4000-8000-000000000001';

    private const OUTSIDER = '00000000-0000-4000-8000-000000000002';

    protected function setUp(): void
    {
        parent::setUp();

        // Dedicated disposable schema fixtures: no RefreshDatabase or migrations,
        // and no connection to the configured application database.
        config([
            'database.default' => 'ar02_testing',
            'database.connections.ar02_testing' => [
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
            $table->string('submission_status');
            $table->softDeletes();
            $table->timestamps();
        });
        Schema::create('research_assignments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->uuid('user_id');
            $table->string('assignment_role');
            $table->string('status');
        });
        Schema::create('document_files', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->string('relative_path')->nullable();
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
            $table->timestamp('researcher_acknowledged_at')->nullable();
            $table->timestamp('researcher_addressed_at')->nullable();
            $table->text('researcher_action_remarks')->nullable();
            $table->timestamps();
        });
        Schema::create('feedback_attachments', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('feedback_comment_id');
            $table->unsignedBigInteger('research_document_id');
            $table->string('original_filename');
            $table->string('file_extension');
            $table->string('mime_type');
            $table->unsignedInteger('file_size');
        });

        DB::table('user_roles')->insert([
            ['id' => 1, 'slug' => 'research_office'],
            ['id' => 2, 'slug' => 'researcher'],
        ]);
        DB::table('users')->insert([
            ['id' => self::OFFICE, 'role_id' => 1, 'role' => 'research-office', 'email' => 'office@example.test'],
            ['id' => self::OUTSIDER, 'role_id' => 2, 'role' => 'researcher', 'email' => 'outsider@example.test'],
        ]);
        DB::table('research_documents')->insert([
            'id' => 7, 'title' => 'Isolated AR-02 fixture', 'submission_status' => 'under_review',
        ]);
        DB::table('document_files')->insert(['id' => 9, 'research_document_id' => 7, 'relative_path' => 'Chapter 3']);

        // Keep audit/monitoring persistence outside this record-separation test.
        $this->mock(AuditService::class)->shouldReceive('log')->andReturn(new AuditLog);
        $this->mock(MonitoringService::class)->shouldReceive('log')->andReturn(new MonitoringLog);
        $shadow = $this->mock(ConsolidationShadowService::class);
        $shadow->shouldReceive('mirrorFeedback')->andReturnNull();
        $shadow->shouldReceive('mirrorRevision')->andReturnNull();
    }

    protected function tearDown(): void
    {
        DB::purge('ar02_testing');
        parent::tearDown();
    }

    #[DataProvider('feedbackTypes')]
    public function test_feedback_creation_never_creates_a_formal_revision(string $type): void
    {
        $response = $this->withSession(['user_id' => self::OFFICE])->postJson('/api/research/7/feedback', [
            'comment' => 'A feedback-only note.', 'feedback_type' => $type, 'document_file_id' => 9,
        ], ['Origin' => 'http://localhost:5173']);

        $response->assertCreated()->assertJsonPath('data.feedback_type', $type)
            ->assertJsonPath('data.feedback_status', 'open')->assertJsonPath('data.document_file_id', 9);
        $this->assertSame(1, FeedbackComment::count());
        $this->assertSame(0, Revision::count());
        $this->assertSame('under_review', DB::table('research_documents')->where('id', 7)->value('submission_status'));
        $this->assertNull((new Revision)->resolveRouteBinding($response->json('data.id')));
    }

    public static function feedbackTypes(): array
    {
        return array_map(fn (string $type): array => [$type], FeedbackComment::FEEDBACK_TYPES);
    }

    public function test_formal_revision_creation_is_actionable_and_excluded_from_feedback(): void
    {
        // Deliberately omit the optional file ID: AR-03's file alias is separate.
        $response = $this->withSession(['user_id' => self::OFFICE])->postJson('/api/research/7/revisions', [
            'revision_remarks' => 'A formal workflow revision.',
        ], ['Origin' => 'http://localhost:5173']);

        $response->assertCreated()->assertJsonPath('data.revision_status', 'requested');
        $this->assertSame(1, Revision::count());
        $this->assertSame(0, FeedbackComment::count());
        $this->assertSame('revision_required', DB::table('research_documents')->where('id', 7)->value('submission_status'));
        $this->assertNull((new FeedbackComment)->resolveRouteBinding($response->json('data.id')));
    }

    public function test_historical_lifecycles_remain_readable_and_disjoint_without_rewriting_rows(): void
    {
        $feedbackIds = [];
        foreach (FeedbackComment::FEEDBACK_STATUSES as $status) {
            $feedbackIds[] = $this->historicalReview($status);
        }
        $revisionIds = [];
        foreach (Revision::STATUSES as $status) {
            $revisionIds[] = $this->historicalReview($status);
        }
        $ordinaryId = $this->historicalReview('open', 'comment');
        $before = DB::table('research_reviews')->orderBy('id')->get()->toJson();
        DB::table('feedback_attachments')->insert([
            'feedback_comment_id' => $feedbackIds[0], 'research_document_id' => 7,
            'original_filename' => 'fixture.pdf', 'file_extension' => 'pdf', 'mime_type' => 'application/pdf', 'file_size' => 100,
        ]);

        $this->assertSame([...$feedbackIds, $ordinaryId], FeedbackComment::orderBy('id')->pluck('id')->all());
        $this->assertSame($revisionIds, Revision::orderBy('id')->pluck('id')->all());
        $this->assertSame(Revision::STATUSES, Revision::orderBy('id')->pluck('status')->all());
        $this->assertSame([], array_intersect(FeedbackComment::pluck('id')->all(), Revision::pluck('id')->all()));
        $note = FeedbackComment::with(['documentFile', 'attachment'])->findOrFail($feedbackIds[0]);
        $this->assertSame(9, $note->document_file_id);
        $this->assertSame('Chapter 3', $note->documentFile->relative_path);
        $this->assertSame('fixture.pdf', $note->attachment->original_filename);
        $this->assertSame($before, DB::table('research_reviews')->orderBy('id')->get()->toJson());

        $this->withSession(['user_id' => self::OFFICE])->getJson('/api/research/7/feedback')->assertOk()->assertJsonCount(4, 'data');
        $this->getJson('/api/research/7/revisions')->assertOk()->assertJsonCount(5, 'data');
        $this->patchJson('/api/research/7/feedback/'.$revisionIds[0], ['feedback_status' => 'resolved'], ['Origin' => 'http://localhost:5173'])->assertNotFound();
    }

    public function test_unrelated_researcher_cannot_read_or_create_either_kind(): void
    {
        $this->withSession(['user_id' => self::OUTSIDER]);
        $this->getJson('/api/research/7/feedback')->assertForbidden();
        $this->getJson('/api/research/7/revisions')->assertForbidden();
        $this->postJson('/api/research/7/feedback', ['comment' => 'Denied.', 'feedback_type' => 'revision_request'], ['Origin' => 'http://localhost:5173'])->assertForbidden();
        $this->postJson('/api/research/7/revisions', ['revision_remarks' => 'Denied.'], ['Origin' => 'http://localhost:5173'])->assertForbidden();
        $this->assertSame(0, DB::table('research_reviews')->count());
    }

    public function test_resolving_a_feedback_only_revision_note_cannot_resolve_a_formal_revision(): void
    {
        $noteId = $this->historicalReview('open');
        $revisionId = $this->historicalReview('requested');

        $this->withSession(['user_id' => self::OFFICE])->patchJson('/api/research/7/feedback/'.$noteId, [
            'feedback_status' => 'resolved',
        ], ['Origin' => 'http://localhost:5173'])->assertOk()->assertJsonPath('data.feedback_status', 'resolved');

        $this->assertSame([$noteId], FeedbackComment::pluck('id')->all());
        $this->assertSame([$revisionId], Revision::pluck('id')->all());
        $this->assertSame('requested', Revision::findOrFail($revisionId)->revision_status);
    }

    private function historicalReview(string $status, string $type = 'revision_request'): int
    {
        return DB::table('research_reviews')->insertGetId([
            'research_document_id' => 7, 'document_file_id' => 9, 'reviewer_id' => self::OFFICE,
            'reviewer_role' => 'research-office', 'review_type' => $type, 'status' => $status,
            'remarks' => 'Historical fixture.', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
