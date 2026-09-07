<?php

namespace App\Http\Controllers;

use App\Http\Requests\PublicRepositorySimilarityRequest;
use App\Http\Resources\PublicRepositorySimilarityResource;
use App\Http\Resources\PublicResearchDocumentResource;
use App\Models\ResearchDocument;
use App\Policies\DocumentFilePolicy;
use App\Services\AuditService;
use App\Services\DomainAuthorization;
use App\Services\PrivateDocumentFileResolver;
use App\Services\PublicRepositoryService;
use App\Services\PublicRepositorySimilarityCapacityException;
use App\Services\PublicRepositorySimilarityCatalogChangedException;
use App\Services\PublicRepositorySimilarityService;
use App\Services\SimilarityProcessException;
use App\Services\SupabaseStorageService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class PublicRepositoryController extends Controller
{
    public function index(Request $request, PublicRepositoryService $service)
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'author' => ['nullable', 'string', 'max:200'],
            'keywords' => ['nullable', 'string', 'max:200'],
            'category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'category' => ['nullable', 'string', 'max:180'],
            'publication_year' => ['nullable', 'integer', 'between:1901,2155'],
            'year' => ['nullable', 'integer', 'between:1901,2155'],
            'year_from' => ['nullable', 'integer', 'between:1901,2155'],
            'year_to' => ['nullable', 'integer', 'between:1901,2155'],
            'sdg' => ['nullable', 'integer', 'between:1,17'],
            'per_page' => ['nullable', 'integer', 'between:1,50'],
        ]);
        if (isset($filters['year_from'], $filters['year_to']) && $filters['year_from'] > $filters['year_to']) {
            throw ValidationException::withMessages([
                'year_from' => ['The from year must not be later than the to year.'],
                'year_to' => ['The to year must not be earlier than the from year.'],
            ]);
        }

        return PublicResearchDocumentResource::collection($service->search($filters));
    }

    public function show(ResearchDocument $researchDocument, PublicRepositoryService $service)
    {
        return new PublicResearchDocumentResource($service->find($researchDocument->id));
    }

    public function similarity(PublicRepositorySimilarityRequest $request, PublicRepositorySimilarityService $service)
    {
        try {
            return PublicRepositorySimilarityResource::collection($service->compare($request->string('q')->toString()));
        } catch (PublicRepositorySimilarityCapacityException) {
            return response()->json(['error' => 'SIMILARITY_CAPACITY_EXCEEDED'], 503);
        } catch (PublicRepositorySimilarityCatalogChangedException) {
            return response()->json(['error' => 'SIMILARITY_CATALOG_CHANGED'], 409);
        } catch (SimilarityProcessException) {
            return response()->json(['error' => 'SIMILARITY_PROCESS_FAILED'], 502);
        }
    }

    public function download(Request $request, ResearchDocument $researchDocument, PublicRepositoryService $service, PrivateDocumentFileResolver $files, SupabaseStorageService $supabase)
    {
        $actor = $request->attributes->get('current_user');
        abort_unless($actor !== null && DomainAuthorization::isActiveAccount($actor), 403);
        $research = $service->find($researchDocument->id);
        $file = $research->files()->current()->where('document_type', 'final_manuscript')->latest('uploaded_at')->firstOrFail();
        $file->setRelation('researchDocument', $research);
        abort_unless((new DocumentFilePolicy)->view($actor, $file), 403);
        app(AuditService::class)->log($actor, 'CATALOG_DOCUMENT_DOWNLOADED', $file, 'Downloaded an archived catalog manuscript.', $request);

        if ($supabase->isSupabasePath($file->file_path)) {
            $contents = $supabase->download($file->file_path);

            return response()->streamDownload(
                fn () => print $contents,
                $file->original_filename,
                ['Content-Type' => $file->mime_type, 'Cache-Control' => 'private, no-store'],
            );
        }

        $resolved = $files->resolve($research, $file);

        return response()->streamDownload(function () use ($files, $resolved): void {
            $handle = $files->open($resolved);
            try {
                fpassthru($handle);
            } finally {
                fclose($handle);
            }
        }, $file->original_filename, ['Content-Type' => $file->mime_type]);
    }
}
