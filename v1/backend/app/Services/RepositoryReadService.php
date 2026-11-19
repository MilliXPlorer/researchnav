<?php

namespace App\Services;

use App\Models\ResearchDocument;
use Illuminate\Database\Eloquent\Builder;

class RepositoryReadService
{
    public function query(Builder $query, array $input, string $bucket): Builder
    {
        $query->select([
            'id', 'submission_reference', 'title', 'publication_year', 'institute', 'research_stage',
            'submission_status', 'archive_status', 'visibility', 'updated_at', 'deleted_at',
        ])->with('authors:id,research_document_id,author_name,author_order');

        if ($bucket === 'ongoing') {
            $query->where('archive_status', '!=', 'archived');
        } elseif ($bucket === 'archived') {
            $query->where('archive_status', 'archived');
        }

        if (($search = $input['search'] ?? null) !== null && $search !== '') {
            $like = '%'.$this->escapedLike($search).'%';
            $query->where(function (Builder $query) use ($like): void {
                $query->whereRaw("title LIKE ? ESCAPE '!'", [$like])
                    ->orWhereRaw("submission_reference LIKE ? ESCAPE '!'", [$like])
                    ->orWhereHas('authors', fn (Builder $authors) => $authors->whereRaw("author_name LIKE ? ESCAPE '!'", [$like]));
            });
        }
        if (($institute = $input['institute'] ?? null) !== null) {
            $query->where('institute', $institute);
        }
        if (($visibility = $input['visibility'] ?? null) !== null) {
            $query->where('visibility', $visibility);
        }
        if (($year = $input['publication_year'] ?? null) !== null) {
            $query->where('publication_year', $year);
        }

        if (($sort = $input['sort'] ?? null) !== null) {
            $direction = $input['direction'] ?? 'asc';
            $query->orderBy($sort, $direction)->orderBy('id', $direction);
        } elseif ($bucket === 'recycle') {
            $query->orderByDesc('deleted_at')->orderByDesc('id');
        } else {
            $query->orderByDesc('updated_at')->orderByDesc('id');
        }

        return $query;
    }

    public function summary(?string $institute = null): array
    {
        $active = fn () => ResearchDocument::query()->when($institute !== null, fn ($query) => $query->where('institute', $institute));
        $trashed = ResearchDocument::onlyTrashed()->when($institute !== null, fn ($query) => $query->where('institute', $institute));

        return [
            'all' => $active()->count(),
            'ongoing' => $active()->where('archive_status', '!=', 'archived')->count(),
            'archived' => $active()->where('archive_status', 'archived')->count(),
            'recycle' => $trashed->count(),
        ];
    }

    public function years(?string $institute = null): array
    {
        return ResearchDocument::withTrashed()
            ->when($institute !== null, fn ($query) => $query->where('institute', $institute))
            ->whereNotNull('publication_year')
            ->distinct()->orderByDesc('publication_year')->pluck('publication_year')->all();
    }

    private function escapedLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
    }
}
