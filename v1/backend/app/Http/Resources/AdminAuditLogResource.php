<?php

namespace App\Http\Resources;

use App\Models\AuditLog;
use App\Models\Category;
use App\Models\DocumentFile;
use App\Models\FeedbackComment;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\Revision;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminAuditLogResource extends JsonResource
{
    /** @var array<class-string, string> */
    private const SUBJECT_TYPES = [
        User::class => 'user',
        Category::class => 'category',
        ResearchDocument::class => 'research_document',
        DocumentFile::class => 'document_file',
        FeedbackComment::class => 'feedback_comment',
        Revision::class => 'revision',
        TitleValidation::class => 'title_validation',
        ReviewAssignment::class => 'review_assignment',
        SimilarityResult::class => 'similarity_result',
    ];

    public function toArray(Request $request): array
    {
        /** @var AuditLog $log */
        $log = $this->resource;
        $subjectType = is_string($log->entity_type) ? (self::SUBJECT_TYPES[$log->entity_type] ?? null) : null;

        return [
            'id' => $log->getRouteKey(),
            'action' => $log->action,
            'actor' => $log->user === null ? null : ['id' => $log->user->id, 'email' => $log->user->email],
            'subject' => $subjectType === null || $log->entity_id === null
                ? null
                : ['type' => $subjectType, 'id' => $log->entity_id],
            'description' => $log->description,
            'created_at' => $log->created_at?->toISOString(),
        ];
    }
}
