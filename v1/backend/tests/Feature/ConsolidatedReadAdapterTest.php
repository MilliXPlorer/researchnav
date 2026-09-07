<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\ComplianceReview;
use App\Models\Evaluation;
use App\Models\FeedbackComment;
use App\Models\MetadataReview;
use App\Models\MethodologyReview;
use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\Revision;
use App\Models\TitleValidation;
use App\Models\User;
use App\Services\ConsolidatedReadAdapter;
use App\Services\ConsolidationShadowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ConsolidatedReadAdapterTest extends TestCase
{
    use RefreshDatabase;

    public function test_shadow_reads_are_explicitly_disabled_by_default(): void
    {
        $this->assertFalse((new ConsolidatedReadAdapter)->enabled());
    }

    public function test_shadow_reads_filter_by_document_and_stream_type(): void
    {
        $research = ResearchDocument::factory()->create();
        $actor = User::factory()->create();
        DB::table('research_review_records')->insert([
            'source_type' => 'title_validation',
            'review_type' => 'title_validation',
            'source_id' => 90,
            'research_document_id' => $research->id,
            'actor_id' => $actor->id,
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('activity_logs')->insert([
            'stream' => 'research',
            'source_id' => 90,
            'research_document_id' => $research->id,
            'actor_id' => $actor->id,
            'action' => 'TEST_ACTIVITY',
            'occurred_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $adapter = new ConsolidatedReadAdapter;
        $this->assertCount(1, $adapter->reviewsForDocument($research->id, 'title_validation'));
        $this->assertCount(1, $adapter->activityForDocument($research->id));
        $this->assertCount(0, $adapter->reviewsForDocument($research->id, 'feedback'));
    }

    public function test_shadow_activity_reads_preserve_monitoring_resource_shape(): void
    {
        $research = ResearchDocument::factory()->create();
        $actor = User::factory()->create();
        $source = MonitoringLog::query()->create([
            'research_document_id' => $research->id,
            'performed_by' => $actor->id,
            'activity_type' => 'REVIEWED',
            'remarks' => 'Reviewed record.',
            'activity_date' => now(),
        ]);
        DB::table('activity_logs')->insert([
            'stream' => 'research',
            'source_id' => $source->id,
            'research_document_id' => $research->id,
            'actor_id' => $actor->id,
            'action' => $source->activity_type,
            'remarks' => $source->remarks,
            'occurred_at' => $source->activity_date,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $log = (new ConsolidatedReadAdapter)->monitoringLogsForDocument($research->id)->first();
        $this->assertSame($source->id, $log?->id);
        $this->assertSame('REVIEWED', $log?->activity_type);
        $this->assertSame($actor->id, $log?->performedBy?->id);
    }

    public function test_shadow_title_validation_reads_preserve_model_shape(): void
    {
        $research = ResearchDocument::factory()->create();
        $actor = User::factory()->create();
        $source = TitleValidation::query()->create([
            'research_document_id' => $research->id,
            'validated_by' => $actor->id,
            'validation_status' => 'pending',
            'adviser_remarks' => 'Awaiting decision.',
        ]);
        DB::table('research_review_records')->insert([
            'source_type' => 'title_validation', 'review_type' => 'title_validation',
            'source_id' => $source->id, 'research_document_id' => $research->id,
            'actor_id' => $actor->id, 'status' => 'pending', 'remarks' => 'Awaiting decision.',
            'created_at' => $source->created_at, 'updated_at' => $source->updated_at,
        ]);

        $validation = (new ConsolidatedReadAdapter)->titleValidationsForDocument($research->id)->first();
        $this->assertSame($source->id, $validation?->id);
        $this->assertSame('pending', $validation?->validation_status);
        $this->assertSame($actor->id, $validation?->validator?->id);
    }

    public function test_shadow_feedback_and_revision_reads_preserve_model_shapes(): void
    {
        $research = ResearchDocument::factory()->create();
        $actor = User::factory()->create();
        $feedback = FeedbackComment::query()->create([
            'research_document_id' => $research->id,
            'user_id' => $actor->id,
            'comment' => 'Please clarify the scope.',
            'feedback_type' => 'suggestion',
            'feedback_status' => 'open',
        ]);
        $revision = Revision::query()->create([
            'research_document_id' => $research->id,
            'requested_by' => $actor->id,
            'revision_number' => 1,
            'revision_remarks' => 'Address the comment.',
            'revision_status' => 'requested',
            'requested_at' => now(),
        ]);
        $now = now();
        DB::table('research_review_records')->insert([
            'source_type' => 'feedback', 'review_type' => 'feedback', 'source_id' => $feedback->id,
            'research_document_id' => $research->id, 'actor_id' => $actor->id, 'status' => 'open',
            'feedback_type' => 'suggestion', 'remarks' => 'Please clarify the scope.',
            'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('research_review_records')->insert([
            'source_type' => 'revision', 'review_type' => 'revision', 'source_id' => $revision->id,
            'research_document_id' => $research->id, 'actor_id' => $actor->id, 'status' => 'requested',
            'sequence_number' => 1, 'remarks' => 'Address the comment.', 'requested_at' => $now,
            'created_at' => $now, 'updated_at' => $now,
        ]);

        $adapter = new ConsolidatedReadAdapter;
        $this->assertSame('Please clarify the scope.', $adapter->feedbackForDocument($research->id)->first()?->comment);
        $this->assertSame('suggestion', $adapter->feedbackForDocument($research->id)->first()?->feedback_type);
        $this->assertSame('Address the comment.', $adapter->revisionsForDocument($research->id)->first()?->revision_remarks);
        $this->assertSame(1, $adapter->revisionsForDocument($research->id)->first()?->revision_number);
    }

    public function test_shadow_audit_reads_preserve_model_shape_and_filters(): void
    {
        $actor = User::factory()->create();
        $source = AuditLog::query()->create([
            'user_id' => $actor->id,
            'action' => 'TEST_AUDIT',
            'entity_type' => 'App\\Models\\User',
            'entity_id' => $actor->id,
            'description' => 'Audit test.',
        ]);
        DB::table('activity_logs')->insert([
            'stream' => 'audit', 'source_id' => $source->id, 'actor_id' => $actor->id,
            'action' => $source->action, 'entity_type' => $source->entity_type,
            'entity_id' => $source->entity_id, 'description' => $source->description,
            'occurred_at' => $source->created_at, 'created_at' => $source->created_at,
            'updated_at' => $source->created_at,
        ]);

        $log = (new ConsolidatedReadAdapter)->auditLogs(['action' => 'TEST_AUDIT'])->first();
        $this->assertSame($source->id, $log?->id);
        $this->assertSame('TEST_AUDIT', $log?->action);
        $this->assertSame($actor->id, $log?->user?->id);
    }

    public function test_shadow_evaluation_reads_preserve_panel_history_shape(): void
    {
        $research = ResearchDocument::factory()->create();
        $panelist = User::factory()->create();
        $source = Evaluation::query()->create([
            'research_document_id' => $research->id,
            'panelist_id' => $panelist->id,
            'originality' => 5,
            'methodology' => 4,
            'clarity' => 5,
            'comments' => 'Strong proposal.',
            'submitted_at' => now(),
        ]);
        DB::table('research_review_records')->insert([
            'source_type' => 'evaluation', 'review_type' => 'evaluation', 'source_id' => $source->id,
            'research_document_id' => $research->id, 'actor_id' => $panelist->id, 'status' => 'submitted',
            'originality' => 5, 'methodology' => 4, 'clarity' => 5, 'remarks' => 'Strong proposal.',
            'submitted_at' => $source->submitted_at, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $evaluation = (new ConsolidatedReadAdapter)->evaluationsForPanelist($panelist->id)->first();
        $this->assertSame($source->id, $evaluation?->id);
        $this->assertSame(5, $evaluation?->originality);
        $this->assertSame('Strong proposal.', $evaluation?->comments);
    }

    public function test_shadow_read_flag_can_be_enabled_for_controlled_validation(): void
    {
        config()->set('researchnav.consolidation.read_shadow', true);

        $this->assertTrue((new ConsolidatedReadAdapter)->enabled());
    }

    public function test_flag_enabled_monitoring_and_validation_endpoints_use_shadow_rows(): void
    {
        config()->set('researchnav.consolidation.read_shadow', true);
        $owner = User::factory()->create();
        $research = ResearchDocument::factory()->create(['submitted_by' => $owner->id]);
        $monitoring = MonitoringLog::query()->create([
            'research_document_id' => $research->id,
            'performed_by' => $owner->id,
            'activity_type' => 'SHADOW_ENDPOINT_ACTIVITY',
            'remarks' => 'Visible through the shadow endpoint.',
            'activity_date' => now(),
        ]);
        app(ConsolidationShadowService::class)->mirrorMonitoring($monitoring);
        $validation = TitleValidation::query()->create([
            'research_document_id' => $research->id,
            'validated_by' => $owner->id,
            'validation_status' => 'pending',
            'adviser_remarks' => 'Shadow endpoint validation.',
        ]);
        app(ConsolidationShadowService::class)->mirrorTitleValidation($validation);

        $this->withSession(['user_id' => $owner->id])
            ->getJson('/api/research/'.$research->id.'/monitoring')
            ->assertOk()
            ->assertJsonPath('data.0.activity_type', 'SHADOW_ENDPOINT_ACTIVITY')
            ->assertJsonPath('data.0.performed_by', null);
        $this->withSession(['user_id' => $owner->id])
            ->getJson('/api/research/'.$research->id.'/validation')
            ->assertOk()
            ->assertJsonPath('data.0.validation_status', 'pending')
            ->assertJsonPath('data.0.validated_by', null);
    }

    public function test_shadow_methodology_reads_preserve_statistician_shape(): void
    {
        $research = ResearchDocument::factory()->create();
        $statistician = User::factory()->create();
        $source = MethodologyReview::query()->create([
            'research_document_id' => $research->id,
            'statistician_id' => $statistician->id,
            'design_fit' => true,
            'sample_size' => false,
            'review_status' => 'in_progress',
            'remarks' => 'Check the sample size.',
        ]);
        DB::table('research_review_records')->insert([
            'source_type' => 'methodology_review', 'review_type' => 'methodology_review', 'source_id' => $source->id,
            'research_document_id' => $research->id, 'actor_id' => $statistician->id, 'status' => 'in_progress',
            'design_fit' => true, 'sample_size' => false, 'remarks' => 'Check the sample size.',
            'created_at' => $source->created_at, 'updated_at' => $source->updated_at,
        ]);

        $review = (new ConsolidatedReadAdapter)->methodologyReviewsForStatistician($statistician->id)->first();
        $this->assertSame($source->id, $review?->id);
        $this->assertTrue((bool) $review?->design_fit);
        $this->assertSame('Check the sample size.', $review?->remarks);
    }

    public function test_shadow_specialist_review_collections_allow_empty_review_rows(): void
    {
        $this->assertCount(0, (new ConsolidatedReadAdapter)->complianceReviews());
        $this->assertCount(0, (new ConsolidatedReadAdapter)->metadataReviews());

        $this->assertInstanceOf(ComplianceReview::class, new ComplianceReview);
        $this->assertInstanceOf(MetadataReview::class, new MetadataReview);
    }
}
