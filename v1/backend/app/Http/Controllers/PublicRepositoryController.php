<?php

namespace App\Http\Controllers;

use App\Http\Resources\PublicResearchDocumentResource;
use App\Models\ResearchDocument;
use App\Services\PublicRepositoryService;
use Illuminate\Http\Request;

class PublicRepositoryController extends Controller
{
    public function index(Request $request, PublicRepositoryService $service)
    {
        return PublicResearchDocumentResource::collection($service->search($request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'author' => ['nullable', 'string', 'max:200'],
            'keywords' => ['nullable', 'string', 'max:200'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'category' => ['nullable', 'string', 'max:180'],
            'publication_year' => ['nullable', 'integer', 'between:1901,2155'],
            'year' => ['nullable', 'integer', 'between:1901,2155'],
            'per_page' => ['nullable', 'integer', 'between:1,50'],
        ])));
    }

    public function show(ResearchDocument $researchDocument, PublicRepositoryService $service)
    {
        return new PublicResearchDocumentResource($service->find($researchDocument->id));
    }
}
