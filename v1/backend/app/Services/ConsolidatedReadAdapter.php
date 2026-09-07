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
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ConsolidatedReadAdapter
{
    public function enabled(): bool
    {
        return (bool) config('researchnav.consolidation.read_shadow', false);
    }

    /** @return Collection<int, object> */
    public function reviewsForDocument(int $documentId, ?string $reviewType = null): Collection
    {
        $query = DB::table('research_review_records')
            ->where('research_document_id', $documentId)
            ->orderByDesc('created_at');
        if ($reviewType !== null) {
            $query->where('review_type', $reviewType);
        }

        return $query->get();
    }

    /** @return Collection<int, object> */
    public function activityForDocument(int $documentId, string $stream = 'research'): Collection
    {
        return DB::table('activity_logs')
            ->where('research_document_id', $documentId)
            ->where('stream', $stream)
            ->orderByDesc('occurred_at')
            ->get();
    }

    /** @return Collection<int, MonitoringLog> */
    public function monitoringLogsForDocument(int $documentId): Collection
    {
        $rows = $this->activityForDocument($documentId);
        $actors = User::query()
            ->whereIn('id', $rows->pluck('actor_id')->filter()->unique())
            ->get()
            ->keyBy('id');

        return $rows->map(function (object $row) use ($actors): MonitoringLog {
            $log = new MonitoringLog;
            $log->forceFill([
                'id' => $row->source_id,
                'research_document_id' => $row->research_document_id,
                'performed_by' => $row->actor_id,
                'activity_type' => $row->action,
                'remarks' => $row->remarks,
                'previous_status' => $row->previous_status,
                'new_status' => $row->new_status,
                'monitoring_status' => $row->monitoring_status,
                'activity_date' => $row->occurred_at,
            ]);
            $log->exists = true;
            $log->setRelation('performedBy', $row->actor_id === null ? null : $actors->get($row->actor_id));

            return $log;
        });
    }

    /** @return Collection<int, TitleValidation> */
    public function titleValidationsForDocument(int $documentId): Collection
    {
        $rows = $this->reviewsForDocument($documentId, 'title_validation');
        $actors = User::query()->whereIn('id', $rows->pluck('actor_id')->filter()->unique())->get()->keyBy('id');
        $similarity = SimilarityResult::query()->whereIn('id', $rows->pluck('similarity_result_id')->filter()->unique())->get()->keyBy('id');

        return $rows->map(function (object $row) use ($actors, $similarity): TitleValidation {
            $validation = new TitleValidation;
            $validation->forceFill([
                'id' => $row->source_id,
                'research_document_id' => $row->research_document_id,
                'similarity_result_id' => $row->similarity_result_id,
                'validated_by' => $row->actor_id,
                'validation_status' => $row->status,
                'adviser_remarks' => $row->remarks,
                'validated_at' => $row->validated_at,
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
            ]);
            $validation->exists = true;
            $validation->setRelation('validator', $row->actor_id === null ? null : $actors->get($row->actor_id));
            $validation->setRelation('similarityResult', $row->similarity_result_id === null ? null : $similarity->get($row->similarity_result_id));

            return $validation;
        });
    }

    /** @return Collection<int, FeedbackComment> */
    public function feedbackForDocument(int $documentId): Collection
    {
        $rows = $this->reviewsForDocument($documentId, 'feedback');
        $users = User::query()->whereIn('id', $rows->pluck('actor_id')->filter()->unique())->get()->keyBy('id');

        return $rows->map(function (object $row) use ($users): FeedbackComment {
            $feedback = new FeedbackComment;
            $feedback->forceFill([
                'id' => $row->source_id,
                'research_document_id' => $row->research_document_id,
                'user_id' => $row->actor_id,
                'document_file_id' => $row->file_id,
                'comment' => $row->remarks,
                'feedback_type' => $row->feedback_type,
                'feedback_status' => $row->status,
                'researcher_acknowledged_at' => $row->researcher_acknowledged_at,
                'researcher_addressed_at' => $row->researcher_addressed_at,
                'researcher_action_remarks' => $row->researcher_action_remarks,
                'created_at' => $row->created_at,
            ]);
            $feedback->exists = true;
            $feedback->setRelation('user', $row->actor_id === null ? null : $users->get($row->actor_id));

            return $feedback;
        });
    }

    /** @return Collection<int, Revision> */
    public function revisionsForDocument(int $documentId): Collection
    {
        return $this->reviewsForDocument($documentId, 'revision')
            ->map(function (object $row): Revision {
                $revision = new Revision;
                $revision->forceFill([
                    'id' => $row->source_id,
                    'research_document_id' => $row->research_document_id,
                    'requested_by' => $row->actor_id,
                    'document_file_id' => $row->file_id,
                    'revision_number' => $row->sequence_number,
                    'revision_remarks' => $row->remarks,
                    'revision_status' => $row->status,
                    'requested_at' => $row->requested_at,
                    'submitted_at' => $row->submitted_at,
                    'resolved_at' => $row->resolved_at,
                    'created_at' => $row->created_at,
                    'updated_at' => $row->updated_at,
                ]);
                $revision->exists = true;

                return $revision;
            });
    }

    /** @return Collection<int, AuditLog> */
    public function auditLogs(array $filters): Collection
    {
        $query = DB::table('activity_logs')
            ->where('stream', 'audit')
            ->orderByDesc('occurred_at')
            ->orderByDesc('source_id');
        if (($action = $filters['action'] ?? null) !== null) {
            $query->where('action', $action);
        }
        if (($actorId = $filters['actor_id'] ?? null) !== null) {
            $query->where('actor_id', $actorId);
        }
        if (($from = $filters['created_from'] ?? null) !== null) {
            $query->whereDate('occurred_at', '>=', $from);
        }
        if (($to = $filters['created_to'] ?? null) !== null) {
            $query->whereDate('occurred_at', '<=', $to);
        }

        $rows = $query->get();
        $users = User::query()->whereIn('id', $rows->pluck('actor_id')->filter()->unique())->get()->keyBy('id');

        return $rows->map(function (object $row) use ($users): AuditLog {
            $log = new AuditLog;
            $log->forceFill([
                'id' => $row->source_id,
                'user_id' => $row->actor_id,
                'action' => $row->action,
                'entity_type' => $row->entity_type,
                'entity_id' => $row->entity_id,
                'description' => $row->description,
                'created_at' => $row->occurred_at,
            ]);
            $log->exists = true;
            $log->setRelation('user', $row->actor_id === null ? null : $users->get($row->actor_id));

            return $log;
        });
    }

    /** @return Collection<int, Evaluation> */
    public function evaluationsForPanelist(string $panelistId): Collection
    {
        return DB::table('research_review_records')
            ->where('review_type', 'evaluation')
            ->where('actor_id', $panelistId)
            ->orderByDesc('submitted_at')
            ->get()
            ->map(function (object $row): Evaluation {
                $evaluation = new Evaluation;
                $evaluation->forceFill([
                    'id' => $row->source_id,
                    'research_document_id' => $row->research_document_id,
                    'panelist_id' => $row->actor_id,
                    'originality' => $row->originality,
                    'methodology' => $row->methodology,
                    'clarity' => $row->clarity,
                    'comments' => $row->remarks,
                    'submitted_at' => $row->submitted_at,
                ]);
                $evaluation->exists = true;

                return $evaluation;
            });
    }

    /** @return Collection<int, MethodologyReview> */
    public function methodologyReviewsForStatistician(string $statisticianId): Collection
    {
        return DB::table('research_review_records')
            ->where('review_type', 'methodology_review')
            ->where('actor_id', $statisticianId)
            ->orderByDesc('updated_at')
            ->get()
            ->map(function (object $row): MethodologyReview {
                $review = new MethodologyReview;
                $review->forceFill([
                    'id' => $row->source_id,
                    'research_document_id' => $row->research_document_id,
                    'statistician_id' => $row->actor_id,
                    'design_fit' => $row->design_fit,
                    'sample_size' => $row->sample_size,
                    'instrument_validity' => $row->instrument_validity,
                    'analysis_plan' => $row->analysis_plan,
                    'remarks' => $row->remarks,
                    'review_status' => $row->status,
                    'signed_off_at' => $row->signed_off_at,
                    'created_at' => $row->created_at,
                    'updated_at' => $row->updated_at,
                ]);
                $review->exists = true;

                return $review;
            });
    }

    public function complianceReviews(): Collection
    {
        return $this->hydrateSingleDocumentReviews('compliance_review', ComplianceReview::class);
    }

    public function metadataReviews(): Collection
    {
        return $this->hydrateSingleDocumentReviews('metadata_review', MetadataReview::class);
    }

    private function hydrateSingleDocumentReviews(string $type, string $modelClass): Collection
    {
        $rows = DB::table('research_review_records')->where('review_type', $type)->orderByDesc('updated_at')->get();

        return $rows->map(function (object $row) use ($modelClass): object {
            $review = new $modelClass;
            $values = [
                'id' => $row->source_id,
                'research_document_id' => $row->research_document_id,
                'review_status' => $row->status,
                'remarks' => $row->remarks,
                'created_at' => $row->created_at,
                'updated_at' => $row->updated_at,
            ];
            if ($modelClass === ComplianceReview::class) {
                $values += [
                    'reviewed_by' => $row->actor_id,
                    'format_compliant' => $row->format_compliant,
                    'attachments_compliant' => $row->attachments_compliant,
                    'consent_forms_compliant' => $row->consent_forms_compliant,
                    'decided_at' => $row->decided_at,
                ];
            } else {
                $values += [
                    'reviewed_by' => $row->actor_id,
                    'title_complete' => $row->title_complete,
                    'abstract_complete' => $row->abstract_complete,
                    'authors_complete' => $row->authors_complete,
                    'keywords_complete' => $row->keywords_complete,
                    'category_complete' => $row->category_complete,
                    'notes' => $row->notes,
                ];
            }
            $review->forceFill($values);
            $review->exists = true;

            return $review;
        });
    }
}
