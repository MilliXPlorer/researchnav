<?php

namespace App\Http\Controllers;

use App\Http\Requests\OfficeRepositoryIndexRequest;
use App\Http\Requests\OfficeRepositoryUpdateRequest;
use App\Http\Resources\OfficeRepositoryDetailResource;
use App\Http\Resources\OfficeRepositoryItemResource;
use App\Models\ResearchDocument;
use App\Services\OfficeRepositoryService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class OfficeRepositoryController extends DomainController
{
    public function index(OfficeRepositoryIndexRequest $request): JsonResponse
    {
        $input = $request->validated();
        $bucket = $input['bucket'] ?? 'ongoing';
        $query = $bucket === 'recycle'
            ? ResearchDocument::onlyTrashed()
            : ResearchDocument::query();
        $query->with('authors');

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

        return OfficeRepositoryItemResource::collection(
            $query->paginate($input['per_page'] ?? 25)->appends($request->query()),
        )->additional(['schema_version' => 1])->response()->header('Cache-Control', 'private, no-store');
    }

    public function show(string $researchDocument): JsonResponse
    {
        $document = $this->documentDetail($researchDocument);

        return $this->detailResponse($document);
    }

    public function update(OfficeRepositoryUpdateRequest $request, string $researchDocument, OfficeRepositoryService $repository): JsonResponse
    {
        ResearchDocument::withTrashed()->findOrFail($researchDocument);
        $document = $repository->update($this->actor($request), (int) $researchDocument, $request->validated(), $request);
        if ($document === null) {
            return response()->json(['error' => 'REPOSITORY_RECORD_TRASHED'], 409);
        }

        return $this->detailResponse($document->load($this->detailRelations()));
    }

    public function destroy(OfficeRepositoryUpdateRequest $request, string $researchDocument, OfficeRepositoryService $repository): JsonResponse|Response
    {
        ResearchDocument::withTrashed()->findOrFail($researchDocument);
        if (! $repository->delete($this->actor($request), (int) $researchDocument, $request)) {
            return response()->json(['error' => 'REPOSITORY_RECORD_TRASHED'], 409);
        }

        return response()->noContent();
    }

    public function restore(OfficeRepositoryUpdateRequest $request, string $researchDocument, OfficeRepositoryService $repository): JsonResponse
    {
        ResearchDocument::withTrashed()->findOrFail($researchDocument);
        $document = $repository->restore($this->actor($request), (int) $researchDocument, $request);
        if ($document === null) {
            return response()->json(['error' => 'REPOSITORY_RECORD_NOT_TRASHED'], 409);
        }

        return $this->detailResponse($document->load($this->detailRelations()));
    }

    private function documentDetail(string $id): ResearchDocument
    {
        return ResearchDocument::withTrashed()->with($this->detailRelations())->findOrFail($id);
    }

    /** @return list<string> */
    private function detailRelations(): array
    {
        return ['category', 'sdgs', 'authors', 'files'];
    }

    private function detailResponse(ResearchDocument $document): JsonResponse
    {
        return (new OfficeRepositoryDetailResource($document))
            ->additional(['schema_version' => 1])
            ->response()
            ->header('Cache-Control', 'private, no-store');
    }

    private function escapedLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
    }
}
