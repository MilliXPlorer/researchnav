<?php

namespace App\Services;

use App\Models\ResearchDocument;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Schema;

class PublicRepositoryService
{
    /** @param array<string, mixed> $filters */
    public function search(array $filters)
    {
        $query = $this->publicScope()->select('research_documents.*')->with(['authors', 'category'])->withExists(['files as has_downloadable_manuscript' => fn ($files) => $files->current()->where('document_type', 'final_manuscript')]);
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
        if (isset($filters['category_id'])) {
            $query->where('category_id', $filters['category_id']);
        }
        if ($category = $filters['category'] ?? null) {
            $query->whereHas('category', fn (Builder $categories) => $categories->where('slug', $category)->orWhere('name', $category));
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

        return $query->orderByDesc('research_documents.publication_year')->orderBy('research_documents.title')->orderBy('research_documents.id')->paginate(min((int) ($filters['per_page'] ?? 15), 50));
    }

    public function find(int $id): ResearchDocument
    {
        return $this->publicScope()->select('research_documents.*')->with(['authors', 'category'])->withExists(['files as has_downloadable_manuscript' => fn ($files) => $files->current()->where('document_type', 'final_manuscript')])->findOrFail($id);
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
