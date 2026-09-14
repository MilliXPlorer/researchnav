<?php

namespace App\Services;

use App\Models\MetadataReview;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MetadataReviewService
{
    public function __construct(private readonly AuditService $audit, private readonly ConsolidationShadowService $shadow, private readonly ConsolidatedReadAdapter $consolidated) {}

    public function standardsOverview(): array
    {
        if ($this->consolidated->enabled()) {
            $reviews = $this->consolidated->metadataReviews()->keyBy('research_document_id');

            return ResearchDocument::query()
                ->whereIn('submission_status', ['approved', 'archived'])
                ->with('category:id,name')
                ->orderByDesc('updated_at')
                ->get(['id', 'title', 'submission_status', 'archive_status', 'abstract', 'keywords', 'publication_year', 'category_id'])
                ->map(function (ResearchDocument $document) use ($reviews): array {
                    $document->setRelation('metadataReview', $reviews->get($document->id));

                    return [
                        'research_document_id' => $document->id,
                        'title' => $document->title,
                        'submission_status' => $document->submission_status,
                        'archive_status' => $document->archive_status,
                        'publication_year' => $document->publication_year,
                        'category' => $document->category?->name,
                        'metadata_review' => $document->metadataReview === null ? null : [
                            'id' => $document->metadataReview->id,
                            'title_complete' => $document->metadataReview->title_complete,
                            'abstract_complete' => $document->metadataReview->abstract_complete,
                            'authors_complete' => $document->metadataReview->authors_complete,
                            'keywords_complete' => $document->metadataReview->keywords_complete,
                            'category_complete' => $document->metadataReview->category_complete,
                            'notes' => $document->metadataReview->notes,
                            'review_status' => $document->metadataReview->review_status,
                        ],
                    ];
                })->values()->all();
        }

        return ResearchDocument::query()
            ->whereIn('submission_status', ['approved', 'archived'])
            ->with(['metadataReview', 'category:id,name'])
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'submission_status', 'archive_status', 'abstract', 'keywords', 'publication_year', 'category_id'])
            ->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'submission_status' => $document->submission_status,
                'archive_status' => $document->archive_status,
                'publication_year' => $document->publication_year,
                'category' => $document->category?->name,
                'metadata_completeness' => [
                    'title' => $document->title !== null && $document->title !== '',
                    'abstract' => $document->abstract !== null && $document->abstract !== '',
                    'keywords' => $document->keywords !== null && $document->keywords !== '',
                    'authors' => $document->authors()->exists(),
                    'category' => $document->category_id !== null,
                ],
                'metadata_review' => $document->metadataReview === null ? null : [
                    'id' => $document->metadataReview->id,
                    'title_complete' => $document->metadataReview->title_complete,
                    'abstract_complete' => $document->metadataReview->abstract_complete,
                    'authors_complete' => $document->metadataReview->authors_complete,
                    'keywords_complete' => $document->metadataReview->keywords_complete,
                    'category_complete' => $document->metadataReview->category_complete,
                    'notes' => $document->metadataReview->notes,
                    'review_status' => $document->metadataReview->review_status,
                ],
            ])
            ->all();
    }

    public function save(User $actor, ResearchDocument $document, array $data, ?Request $request = null): MetadataReview
    {
        return DB::transaction(function () use ($actor, $document, $data, $request): MetadataReview {
            $locked = ResearchDocument::query()->whereKey($document->id)->lockForUpdate()->firstOrFail();
            $review = MetadataReview::query()
                ->updateOrCreate(
                    ['research_document_id' => $locked->id],
                    [
                        'reviewed_by' => $actor->id,
                        'title_complete' => $data['title_complete'] ?? false,
                        'abstract_complete' => $data['abstract_complete'] ?? false,
                        'authors_complete' => $data['authors_complete'] ?? false,
                        'keywords_complete' => $data['keywords_complete'] ?? false,
                        'category_complete' => $data['category_complete'] ?? false,
                        'notes' => $data['notes'] ?? null,
                        'review_status' => $data['review_status'] ?? 'complete',
                    ],
                );
            $this->shadow->mirrorMetadataReview($review);
            $this->audit->log($actor, 'METADATA_REVIEWED', $review, "Metadata review marked [{$review->review_status}].", $request);

            return $review->load('researchDocument');
        });
    }

    public static function guardStatus(string $status): void
    {
        if (! in_array($status, MetadataReview::STATUSES, true)) {
            throw ValidationException::withMessages(['review_status' => ['The metadata review status is invalid.']]);
        }
    }
}
