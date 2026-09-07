<?php

namespace App\Http\Controllers;

use App\Exceptions\ApiValidationException;
use App\Models\Category;
use App\Models\SavedLibraryItem;
use App\Services\SavedLibraryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

class AcademicsController extends DomainController
{
    public function library(Request $request, SavedLibraryService $library): JsonResponse
    {
        return response()
            ->json(['data' => $library->list($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function saveLibraryItem(Request $request, SavedLibraryService $library): JsonResponse
    {
        $input = $this->validated($request, [
            'research_document_id' => ['required', 'integer', 'exists:research_documents,id'],
        ]);
        $item = $library->save($this->actor($request), $input, $request);

        return response()->json(['data' => $this->payload($item)], 201);
    }

    public function removeLibraryItem(Request $request, SavedLibraryItem $savedLibraryItem, SavedLibraryService $library): Response
    {
        $library->remove($this->actor($request), $savedLibraryItem, $request);

        return response()->noContent();
    }

    public function recommendations(Request $request, SavedLibraryService $library): JsonResponse
    {
        return response()
            ->json(['data' => $library->recommendations($this->actor($request)), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    public function categories(): JsonResponse
    {
        $categories = Category::query()
            ->where('is_active', true)
            ->orderBy('name')
            ->get()
            ->map(fn (Category $category) => [
                'id' => $category->id,
                'name' => $category->name,
                'slug' => $category->slug,
                'records_count' => $category->researchDocuments()
                    ->whereIn('submission_status', ['approved', 'archived'])
                    ->where('archive_status', 'archived')
                    ->where('visibility', 'public')
                    ->count(),
            ]);

        return response()
            ->json(['data' => $categories->values()->all(), 'schema_version' => 1])
            ->header('Cache-Control', 'private, no-store');
    }

    private function payload(SavedLibraryItem $item): array
    {
        return [
            'id' => $item->id,
            'research_document_id' => $item->research_document_id,
            'title' => $item->researchDocument?->title,
            'publication_year' => $item->researchDocument?->publication_year,
            'saved_at' => $item->created_at?->toISOString(),
        ];
    }

    /** @param array<string, array<int, string>> $rules @return array<string, string> */
    private function validated(Request $request, array $rules): array
    {
        $validator = Validator::make($request->json()->all(), $rules);
        if ($validator->fails()) {
            throw new ApiValidationException($validator->errors()->toArray());
        }

        return $validator->validated();
    }
}
