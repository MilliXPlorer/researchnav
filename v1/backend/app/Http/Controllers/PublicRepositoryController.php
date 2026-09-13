<?php

namespace App\Http\Controllers;

use App\Http\Requests\PublicRepositorySimilarityRequest;
use App\Http\Resources\PublicRepositorySimilarityResource;
use App\Http\Resources\PublicResearchDocumentResource;
use App\Models\DocumentFile;
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
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use ZipArchive;

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
            'institute' => ['nullable', 'string', 'max:255'],
            'publication_year' => ['nullable', 'integer', 'between:1901,2155'],
            'year' => ['nullable', 'integer', 'between:1901,2155'],
            'year_from' => ['nullable', 'integer', 'between:1901,2155'],
            'year_to' => ['nullable', 'integer', 'between:1901,2155'],
            'per_page' => ['nullable', 'integer', 'between:1,1000'],
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
        $groupedFiles = $research->files()->current()->where('document_type', 'final_manuscript')->orderBy('file_order')->orderBy('original_filename')->get();
        $file = $groupedFiles->firstOrFail();
        $file->setRelation('researchDocument', $research);
        abort_unless((new DocumentFilePolicy)->view($actor, $file), 403);

        if (! $request->has('file') && ! $request->boolean('all')) {
            return $this->fileChooser($research, $groupedFiles);
        }

        if ($request->boolean('all')) {
            app(AuditService::class)->log($actor, 'CATALOG_DOCUMENT_DOWNLOADED', $file, 'Downloaded an archived catalog manuscript.', $request);
            $zipPath = tempnam(sys_get_temp_dir(), 'researchnav-zip-');
            $zip = new ZipArchive;
            abort_unless($zipPath !== false && $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true, 500);
            $folder = preg_replace('/[^A-Za-z0-9._ -]+/', ' ', $research->import_group_name ?: $research->title) ?: 'Manuscript';
            foreach ($groupedFiles as $groupedFile) {
                $contents = $supabase->isSupabasePath($groupedFile->file_path) ? $supabase->download($groupedFile->file_path) : file_get_contents($files->resolve($research, $groupedFile)['absolute_path']);
                $zip->addFromString($folder.'/'.$groupedFile->original_filename, $contents);
            }
            $zip->close();

            return response()->download($zipPath, $folder.'.zip', ['Content-Type' => 'application/zip'])->deleteFileAfterSend(true);
        }

        $selectedId = filter_var($request->query('file'), FILTER_VALIDATE_INT);
        $file = $selectedId === false ? null : $groupedFiles->firstWhere('id', $selectedId);
        abort_if($file === null, 404);
        $file->setRelation('researchDocument', $research);
        abort_unless((new DocumentFilePolicy)->view($actor, $file), 403);
        app(AuditService::class)->log($actor, 'CATALOG_DOCUMENT_DOWNLOADED', $file, 'Downloaded an archived catalog manuscript.', $request);

        if ($supabase->isSupabasePath($file->file_path)) {
            $contents = $supabase->download($file->file_path);
            $disposition = strtolower((string) $file->file_extension) === 'pdf' ? 'inline' : 'attachment';
            $filename = str_replace(['"', "\r", "\n"], '_', $file->original_filename);

            return response($contents, 200, [
                'Content-Type' => $file->mime_type,
                'Content-Disposition' => $disposition.'; filename="'.$filename.'"',
                'Cache-Control' => 'private, no-store',
                'X-Content-Type-Options' => 'nosniff',
            ]);
        }

        $resolved = $files->resolve($research, $file);
        $disposition = strtolower((string) $file->file_extension) === 'pdf' ? 'inline' : 'attachment';
        $filename = str_replace(['"', "\r", "\n"], '_', $file->original_filename);

        return response()->stream(function () use ($files, $resolved): void {
            $handle = $files->open($resolved);
            try {
                fpassthru($handle);
            } finally {
                fclose($handle);
            }
        }, 200, [
            'Content-Type' => $file->mime_type,
            'Content-Disposition' => $disposition.'; filename="'.$filename.'"',
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** @param Collection<int, DocumentFile> $files */
    private function fileChooser(ResearchDocument $research, Collection $files)
    {
        $heading = htmlspecialchars($research->title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $downloadUrl = htmlspecialchars(route('repository.download', ['researchDocument' => $research->id, 'all' => 1]), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $links = $files->map(function ($file) use ($research): string {
            $url = htmlspecialchars(route('repository.download', ['researchDocument' => $research->id, 'file' => $file->id]), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $name = htmlspecialchars($file->original_filename, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

            return '<li><a href="'.$url.'">'.$name.'</a></li>';
        })->implode('');
        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.$heading.'</title>'
            .'<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:4rem auto;padding:0 1.5rem;color:#17202a}h1{margin-bottom:.4rem}p{color:#52606d}ul{padding:0;list-style:none}li{margin:.75rem 0}a{display:block;padding:1rem;border:1px solid #ccd3da;border-radius:.5rem;color:#0645ad;text-decoration:none}a:hover,a:focus{border-color:#0645ad}.download{margin-top:2rem;background:#17202a;color:#fff;text-align:center}</style></head>'
            .'<body><main><h1>'.$heading.'</h1><p>Choose a PDF to open, or download the complete study as a ZIP archive.</p><ul>'.$links.'</ul><a class="download" href="'.$downloadUrl.'">Download all manuscripts (.zip)</a></main></body></html>';

        return response($html)->header('Cache-Control', 'private, no-store')->header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")->header('X-Content-Type-Options', 'nosniff');
    }
}
