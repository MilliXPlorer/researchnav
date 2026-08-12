<?php

namespace App\Services;

use App\Models\ResearchDocument;
use Illuminate\Database\Eloquent\Builder;

class PublicRepositoryService
{
    /** @param array<string, mixed> $filters */
    public function search(array $filters)
    {
        $query = $this->publicScope()->with(['authors', 'category']);
        if ($term = $filters['q'] ?? null) {
            $like = $this->like($term);
            $query->where(fn (Builder $q) => $q->whereRaw("title LIKE ? ESCAPE '!'", [$like])
                ->orWhereRaw("abstract LIKE ? ESCAPE '!'", [$like])
                ->orWhereRaw("keywords LIKE ? ESCAPE '!'", [$like])
                ->orWhereHas('authors', fn (Builder $authors) => $authors->whereRaw("author_name LIKE ? ESCAPE '!'", [$like])));
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
        }

        return $query->orderByDesc('publication_year')->orderBy('title')->paginate(min((int) ($filters['per_page'] ?? 15), 50));
    }

    public function find(int $id): ResearchDocument
    {
        return $this->publicScope()->with(['authors', 'category'])->findOrFail($id);
    }

    private function publicScope(): Builder
    {
        return ResearchDocument::query()->whereIn('submission_status', ['approved', 'archived'])->where('visibility', 'public')->where('archive_status', 'archived');
    }

    private function like(string $value): string
    {
        return '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value).'%';
    }
}
