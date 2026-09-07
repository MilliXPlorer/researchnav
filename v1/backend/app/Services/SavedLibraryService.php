<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\SavedLibraryItem;
use App\Models\SimilarityResult;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SavedLibraryService
{
    public function __construct(private readonly AuditService $audit) {}

    public function list(User $user): array
    {
        return SavedLibraryItem::query()
            ->where('user_id', $user->id)
            ->with(['researchDocument:id,title,publication_year,research_stage,submission_status,archive_status,visibility'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (SavedLibraryItem $item) => [
                'id' => $item->id,
                'research_document_id' => $item->research_document_id,
                'title' => $item->researchDocument?->title,
                'publication_year' => $item->researchDocument?->publication_year,
                'saved_at' => $item->created_at?->toISOString(),
            ])
            ->all();
    }

    public function save(User $user, array $data, ?Request $request = null): SavedLibraryItem
    {
        return DB::transaction(function () use ($user, $data, $request): SavedLibraryItem {
            $document = ResearchDocument::query()->whereKey($data['research_document_id'])->lockForUpdate()->firstOrFail();
            if ($document->submission_status !== 'archived' || $document->archive_status !== 'archived') {
                throw ValidationException::withMessages(['research_document_id' => ['Only archived repository records can be saved.']]);
            }
            $item = SavedLibraryItem::query()->firstOrCreate([
                'user_id' => $user->id,
                'research_document_id' => $document->id,
            ]);
            if ($item->wasRecentlyCreated) {
                $this->audit->log($user, 'LIBRARY_ITEM_SAVED', $item, 'Saved a repository record to the personal library.', $request);
            }

            return $item;
        });
    }

    public function remove(User $user, SavedLibraryItem $item, ?Request $request = null): void
    {
        DB::transaction(function () use ($user, $item, $request): void {
            $locked = SavedLibraryItem::query()->whereKey($item->id)->lockForUpdate()->firstOrFail();
            if ($locked->user_id !== $user->id && ! DomainAuthorization::isActiveAdministrator($user)) {
                throw ValidationException::withMessages(['authorization' => ['The item does not belong to this account.']]);
            }
            $locked->delete();
            $this->audit->log($user, 'LIBRARY_ITEM_REMOVED', $locked, 'Removed a repository record from the personal library.', $request);
        });
    }

    public function recommendations(User $user, int $limit = 10): array
    {
        $savedDocumentIds = SavedLibraryItem::query()
            ->where('user_id', $user->id)
            ->pluck('research_document_id')
            ->all();
        if ($savedDocumentIds === []) {
            return [];
        }

        return SimilarityResult::query()
            ->latestPerPair()
            ->whereIn('source_research_id', $savedDocumentIds)
            ->whereNotIn('matched_research_id', $savedDocumentIds)
            ->with(['matchedResearch:id,title,publication_year,submission_status,archive_status,visibility'])
            ->whereHas('matchedResearch', fn ($documents) => $documents
                ->where('submission_status', 'archived')
                ->where('archive_status', 'archived'))
            ->orderByRaw('CASE WHEN overall_similarity_score IS NULL THEN 1 ELSE 0 END')
            ->orderByDesc('overall_similarity_score')
            ->orderByDesc('title_similarity_score')
            ->orderBy('matched_research_id')
            ->limit($limit)
            ->get()
            ->map(fn (SimilarityResult $result) => [
                'research_document_id' => $result->matched_research_id,
                'title' => $result->matchedResearch?->title,
                'publication_year' => $result->matchedResearch?->publication_year,
                'overall_similarity_score' => $result->overall_similarity_score,
                'classification' => $result->classification,
                'adviser_review_required' => $result->adviser_review_required,
            ])
            ->all();
    }
}
