<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ComplianceReview;
use App\Models\Evaluation;
use App\Models\FeedbackComment;
use App\Models\MetadataReview;
use App\Models\MethodologyReview;
use App\Models\MonitoringLog;
use App\Models\Revision;
use App\Models\TitleValidation;
use Illuminate\Support\Facades\DB;

class ConsolidationShadowService
{
    public function mirrorMonitoring(MonitoringLog $log): void
    {
        if ($log->usesConsolidatedStorage()) {
            return;
        }
        DB::table('activity_logs')->updateOrInsert(
            ['stream' => 'research', 'source_id' => $log->id],
            [
                'research_document_id' => $log->research_document_id,
                'actor_id' => $log->performed_by,
                'action' => $log->activity_type,
                'remarks' => $log->remarks,
                'previous_status' => $log->previous_status,
                'new_status' => $log->new_status,
                'monitoring_status' => $log->monitoring_status,
                'occurred_at' => $log->activity_date,
                'created_at' => $log->created_at ?? now(),
                'updated_at' => $log->created_at ?? now(),
            ],
        );
    }

    public function mirrorAudit(AuditLog $log): void
    {
        if ($log->usesConsolidatedStorage()) {
            return;
        }
        DB::table('activity_logs')->updateOrInsert(
            ['stream' => 'audit', 'source_id' => $log->id],
            [
                'actor_id' => $log->user_id,
                'action' => $log->action,
                'entity_type' => $log->entity_type,
                'entity_id' => $log->entity_id,
                'description' => $log->description,
                'ip_address' => $log->ip_address,
                'user_agent' => $log->user_agent,
                'occurred_at' => $log->created_at ?? now(),
                'created_at' => $log->created_at ?? now(),
                'updated_at' => $log->created_at ?? now(),
            ],
        );
    }

    public function mirrorRevision(Revision $revision): void
    {
        if ($revision->usesConsolidatedStorage() || $revision->usesFinalStorage()) {
            return;
        }
        DB::table('research_review_records')->updateOrInsert(
            ['source_type' => 'revision', 'source_id' => $revision->id],
            [
                'review_type' => 'revision',
                'research_document_id' => $revision->research_document_id,
                'actor_id' => $revision->requested_by,
                'file_id' => $revision->document_file_id,
                'status' => $revision->revision_status,
                'sequence_number' => $revision->revision_number,
                'remarks' => $revision->revision_remarks,
                'requested_at' => $revision->requested_at,
                'submitted_at' => $revision->submitted_at,
                'resolved_at' => $revision->resolved_at,
                'created_at' => $revision->created_at ?? now(),
                'updated_at' => $revision->updated_at ?? now(),
            ],
        );
    }

    public function mirrorTitleValidation(TitleValidation $validation): void
    {
        if ($validation->usesConsolidatedStorage() || $validation->usesFinalStorage()) {
            return;
        }
        DB::table('research_review_records')->updateOrInsert(
            ['source_type' => 'title_validation', 'source_id' => $validation->id],
            [
                'review_type' => 'title_validation',
                'research_document_id' => $validation->research_document_id,
                'actor_id' => $validation->validated_by,
                'similarity_result_id' => $validation->similarity_result_id,
                'status' => $validation->validation_status,
                'remarks' => $validation->adviser_remarks,
                'validated_at' => $validation->validated_at,
                'created_at' => $validation->created_at ?? now(),
                'updated_at' => $validation->updated_at ?? now(),
            ],
        );
    }

    public function mirrorFeedback(FeedbackComment $feedback): void
    {
        if ($feedback->usesConsolidatedStorage() || $feedback->usesFinalStorage()) {
            return;
        }
        DB::table('research_review_records')->updateOrInsert(
            ['source_type' => 'feedback', 'source_id' => $feedback->id],
            [
                'review_type' => 'feedback',
                'research_document_id' => $feedback->research_document_id,
                'actor_id' => $feedback->user_id,
                'file_id' => $feedback->document_file_id,
                'status' => $feedback->feedback_status,
                'feedback_type' => $feedback->feedback_type,
                'remarks' => $feedback->comment,
                'researcher_acknowledged_at' => $feedback->researcher_acknowledged_at,
                'researcher_addressed_at' => $feedback->researcher_addressed_at,
                'researcher_action_remarks' => $feedback->researcher_action_remarks,
                'created_at' => $feedback->created_at ?? now(),
                'updated_at' => $feedback->updated_at ?? now(),
            ],
        );
    }

    public function mirrorEvaluation(Evaluation $evaluation): void
    {
        if ($evaluation->usesConsolidatedStorage()) {
            return;
        }
        DB::table('research_review_records')->updateOrInsert(
            ['source_type' => 'evaluation', 'source_id' => $evaluation->id],
            [
                'review_type' => 'evaluation', 'research_document_id' => $evaluation->research_document_id,
                'actor_id' => $evaluation->panelist_id, 'status' => 'submitted',
                'originality' => $evaluation->originality, 'methodology' => $evaluation->methodology,
                'clarity' => $evaluation->clarity, 'remarks' => $evaluation->comments,
                'submitted_at' => $evaluation->submitted_at, 'created_at' => $evaluation->created_at ?? now(),
                'updated_at' => $evaluation->updated_at ?? now(),
            ],
        );
    }

    public function mirrorMethodologyReview(MethodologyReview $review): void
    {
        if ($review->usesConsolidatedStorage() || $review->usesFinalStorage()) {
            return;
        }
        DB::table('research_review_records')->updateOrInsert(
            ['source_type' => 'methodology_review', 'source_id' => $review->id],
            [
                'review_type' => 'methodology_review', 'research_document_id' => $review->research_document_id,
                'actor_id' => $review->statistician_id, 'status' => $review->review_status,
                'design_fit' => $review->design_fit, 'sample_size' => $review->sample_size,
                'instrument_validity' => $review->instrument_validity, 'analysis_plan' => $review->analysis_plan,
                'remarks' => $review->remarks, 'signed_off_at' => $review->signed_off_at,
                'created_at' => $review->created_at ?? now(), 'updated_at' => $review->updated_at ?? now(),
            ],
        );
    }

    public function mirrorComplianceReview(ComplianceReview $review): void
    {
        if ($review->usesConsolidatedStorage()) {
            return;
        }
        DB::table('research_review_records')->updateOrInsert(
            ['source_type' => 'compliance_review', 'source_id' => $review->id],
            [
                'review_type' => 'compliance_review', 'research_document_id' => $review->research_document_id,
                'actor_id' => $review->reviewed_by, 'status' => $review->review_status,
                'format_compliant' => $review->format_compliant, 'attachments_compliant' => $review->attachments_compliant,
                'consent_forms_compliant' => $review->consent_forms_compliant, 'remarks' => $review->remarks,
                'decided_at' => $review->decided_at, 'created_at' => $review->created_at ?? now(),
                'updated_at' => $review->updated_at ?? now(),
            ],
        );
    }

    public function mirrorMetadataReview(MetadataReview $review): void
    {
        if ($review->usesConsolidatedStorage()) {
            return;
        }
        DB::table('research_review_records')->updateOrInsert(
            ['source_type' => 'metadata_review', 'source_id' => $review->id],
            [
                'review_type' => 'metadata_review', 'research_document_id' => $review->research_document_id,
                'actor_id' => $review->reviewed_by, 'status' => $review->review_status,
                'title_complete' => $review->title_complete, 'abstract_complete' => $review->abstract_complete,
                'authors_complete' => $review->authors_complete, 'keywords_complete' => $review->keywords_complete,
                'category_complete' => $review->category_complete, 'notes' => $review->notes,
                'created_at' => $review->created_at ?? now(), 'updated_at' => $review->updated_at ?? now(),
            ],
        );
    }
}
