<?php

namespace App\Http\Controllers;

use App\Http\Requests\DeleteDocumentFileRequest;
use App\Http\Requests\UpdateDocumentFileRequest;
use App\Http\Requests\UploadDocumentRequest;
use App\Http\Resources\DocumentFileResource;
use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Policies\DocumentFilePolicy;
use App\Policies\ResearchDocumentPolicy;
use App\Services\AuditService;
use App\Services\DocumentService;
use App\Services\PrivateDocumentFileResolver;
use App\Services\SupabaseStorageService;
use Illuminate\Http\Request;

class DocumentFileController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument)
    {
        $this->allowed((new ResearchDocumentPolicy)->view($this->actor($request), $researchDocument));

        $files = $researchDocument->files()->latest('uploaded_at');
        $actor = $this->actor($request);
        if (! (new ResearchDocumentPolicy)->viewInternal($actor, $researchDocument) && $researchDocument->submission_status === 'archived') {
            $files->current();
        }

        $policy = new DocumentFilePolicy;

        return DocumentFileResource::collection(
            $files->get()->filter(fn (DocumentFile $file): bool => $policy->view($actor, $file))->values()
        );
    }

    public function store(UploadDocumentRequest $request, ResearchDocument $researchDocument, DocumentService $service)
    {
        $data = $request->validated();
        $this->allowed((new DocumentFilePolicy)->upload($this->actor($request), $researchDocument, $data['document_type']));

        return (new DocumentFileResource($service->upload($this->actor($request), $researchDocument, $data['file'], $data['document_type'], $request)))->response()->setStatusCode(201);
    }

    public function download(Request $request, ResearchDocument $researchDocument, DocumentFile $documentFile, PrivateDocumentFileResolver $files, SupabaseStorageService $supabase)
    {
        abort_unless($documentFile->research_document_id === $researchDocument->id, 404);
        $this->allowed((new DocumentFilePolicy)->view($this->actor($request), $documentFile));
        app(AuditService::class)->log($this->actor($request), 'DOCUMENT_DOWNLOADED', $documentFile, 'Downloaded a private research document.', $request);

        if ($supabase->isSupabasePath($documentFile->file_path)) {
            $contents = $supabase->download($documentFile->file_path);

            return response()->streamDownload(
                fn () => print $contents,
                $documentFile->original_filename,
                ['Content-Type' => $documentFile->mime_type, 'Cache-Control' => 'private, no-store'],
            );
        }

        $resolved = $files->resolve($researchDocument, $documentFile);

        return response()->streamDownload(function () use ($files, $resolved): void {
            $handle = $files->open($resolved);
            try {
                fpassthru($handle);
            } finally {
                fclose($handle);
            }
        }, $documentFile->original_filename, ['Content-Type' => $documentFile->mime_type]);
    }

    public function preview(Request $request, ResearchDocument $researchDocument, DocumentFile $documentFile, PrivateDocumentFileResolver $files, SupabaseStorageService $supabase)
    {
        abort_unless($documentFile->research_document_id === $researchDocument->id, 404);
        $this->allowed((new DocumentFilePolicy)->view($this->actor($request), $documentFile));
        abort_unless($documentFile->mime_type === 'application/pdf', 404);

        app(AuditService::class)->log($this->actor($request), 'DOCUMENT_PREVIEWED', $documentFile, 'Previewed a private PDF research document.', $request);

        if ($supabase->isSupabasePath($documentFile->file_path)) {
            return response($supabase->download($documentFile->file_path), 200, [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' => 'inline; filename="'.$documentFile->original_filename.'"',
                'Cache-Control' => 'private, no-store',
            ]);
        }

        $resolved = $files->resolve($researchDocument, $documentFile);
        abort_unless($files->isPdf($resolved), 404);

        return response()->stream(function () use ($files, $resolved): void {
            $handle = $files->open($resolved);
            try {
                fpassthru($handle);
            } finally {
                fclose($handle);
            }
        }, 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="'.$documentFile->original_filename.'"']);
    }

    public function update(UpdateDocumentFileRequest $request, ResearchDocument $researchDocument, DocumentFile $documentFile, DocumentService $service)
    {
        abort_unless($documentFile->research_document_id === $researchDocument->id, 404);
        $actor = $this->actor($request);
        $this->allowed((new DocumentFilePolicy)->manage($actor, $documentFile));

        return new DocumentFileResource($service->rename($actor, $documentFile, $request->validated()['original_filename'], $request));
    }

    public function destroy(DeleteDocumentFileRequest $request, ResearchDocument $researchDocument, DocumentFile $documentFile, DocumentService $service)
    {
        abort_unless($documentFile->research_document_id === $researchDocument->id, 404);
        $actor = $this->actor($request);
        $this->allowed((new DocumentFilePolicy)->manage($actor, $documentFile));
        $service->delete($actor, $documentFile, $request);

        return response()->noContent();
    }
}
