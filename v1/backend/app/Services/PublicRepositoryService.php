<?php

namespace App\Services;

use App\Models\ResearchDocument;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Schema;

class PublicRepositoryService
{
    public function __construct(
        private readonly PublicManuscriptAvailability $manuscripts,
    ) {}

    /** @param array<string, mixed> $filters */
    public function search(array $filters)
    {
        $query = $this->publicScope()->select('research_documents.*')->with(['authors', 'sdgs', 'files' => fn ($files) => $files->select(['id', 'research_document_id', 'document_type', 'is_current', 'stored_filename', 'file_path'])->current()->where('document_type', 'final_manuscript')]);
        if ($term = $filters['q'] ?? null) {
            $like = $this->like($term);
            $metadataMatch = fn (Builder $q) => $q->whereRaw("research_documents.title LIKE ? ESCAPE '!'", [$like])
                ->orWhereRaw("research_documents.abstract LIKE ? ESCAPE '!'", [$like])
                ->orWhereRaw("research_documents.keywords LIKE ? ESCAPE '!'", [$like])
                ->orWhereHas('authors', fn (Builder $authors) => $authors->whereRaw("author_name LIKE ? ESCAPE '!'", [$like]));

            if (! Schema::hasTable('manuscript_search_documents')) {
                $query->where($metadataMatch);
            } else {
                $query->leftJoin('manuscript_search_documents as manuscript_search', function ($join): void {
                    $join->on('manuscript_search.research_document_id', '=', 'research_documents.id')
                        ->where('manuscript_search.extraction_status', '=', 'ready');
                });
            }

            if (Schema::hasTable('manuscript_search_documents') && $this->usesMariaDbFullText()) {
                $match = 'MATCH(manuscript_search.body_text) AGAINST (? IN NATURAL LANGUAGE MODE)';
                $query->where(fn (Builder $q) => $metadataMatch($q)->orWhereRaw($match, [$term]))
                    ->orderByRaw("CASE WHEN {$match} > 0 THEN 1 ELSE 0 END DESC", [$term])
                    ->orderByRaw("{$match} DESC", [$term]);
            } elseif (Schema::hasTable('manuscript_search_documents')) {
                $bodyMatch = "manuscript_search.body_text LIKE ? ESCAPE '!'";
                $query->where(fn (Builder $q) => $metadataMatch($q)->orWhereRaw($bodyMatch, [$like]))
                    ->orderByRaw("CASE WHEN {$bodyMatch} THEN 1 ELSE 0 END DESC", [$like]);
            }
        }
        if ($author = $filters['author'] ?? null) {
            $like = $this->like($author);
            $query->whereHas('authors', fn (Builder $authors) => $authors->whereRaw("author_name LIKE ? ESCAPE '!'", [$like]));
        }
        if ($keywords = $filters['keywords'] ?? null) {
            $query->whereRaw("keywords LIKE ? ESCAPE '!'", [$this->like($keywords)]);
        }
        if ($institute = $filters['institute'] ?? null) {
            $query->where('institute', $institute);
        }
        foreach ($filters['sdg_ids'] ?? [] as $sdgId) {
            $query->whereHas('sdgs', fn (Builder $sdgs) => $sdgs->where('sdgs.id', $sdgId));
        }
        if ($year = $filters['publication_year'] ?? $filters['year'] ?? null) {
            $query->where('publication_year', $year);
        } else {
            if ($yearFrom = $filters['year_from'] ?? null) {
                $query->where('publication_year', '>=', $yearFrom);
            }
            if ($yearTo = $filters['year_to'] ?? null) {
                $query->where('publication_year', '<=', $yearTo);
            }
        }

        $results = $query
            ->orderByDesc('research_documents.publication_year')
            ->orderBy('research_documents.title')
            ->orderBy('research_documents.id')
            ->paginate(min((int) ($filters['per_page'] ?? 15), 1000))
            ->appends($filters);
        $results->getCollection()->each(fn (ResearchDocument $research) => $this->setDownloadAvailability($research));

        return $results;
    }

    public function find(int $id): ResearchDocument
    {
        $research = $this->publicScope()->select('research_documents.*')->with(['authors', 'sdgs', 'files'])->findOrFail($id);
        $this->setDownloadAvailability($research);

        return $research;
    }

    /** @return list<int> */
    public function years(): array
    {
        return $this->publicScope()
            ->whereNotNull('publication_year')
            ->distinct()
            ->orderByDesc('publication_year')
            ->pluck('publication_year')
            ->map(fn ($year): int => (int) $year)
            ->values()
            ->all();
    }

    private function setDownloadAvailability(ResearchDocument $research): void
    {
        if (! $research->relationLoaded('files')) {
            $research->load('files');
        }
        $research->has_downloadable_manuscript = $this->manuscripts->hasAvailableFile($research);
    }

    private function publicScope(): Builder
    {
        return ResearchDocument::query()
            ->whereIn('submission_status', ['approved', 'archived'])
            ->where('visibility', 'public')
            ->where('archive_status', 'archived');
    }

    private function like(string $value): string
    {
        return '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value).'%';
    }

    private function usesMariaDbFullText(): bool
    {
        return in_array(ResearchDocument::query()->getConnection()->getDriverName(), ['mysql', 'mariadb'], true);
    }
}
