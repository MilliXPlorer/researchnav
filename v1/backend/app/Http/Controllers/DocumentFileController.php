<?php

namespace App\Http\Controllers;

use App\Http\Requests\UploadDocumentRequest;
use App\Http\Resources\DocumentFileResource;
use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Policies\DocumentFilePolicy;
use App\Policies\ResearchDocumentPolicy;
use App\Services\AuditService;
use App\Services\DocumentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

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

    public function download(Request $request, ResearchDocument $researchDocument, DocumentFile $documentFile)
    {
        abort_unless($documentFile->research_document_id === $researchDocument->id, 404);
        $this->allowed((new DocumentFilePolicy)->view($this->actor($request), $documentFile));
        abort_unless(Storage::disk('researchnav_private')->exists($documentFile->file_path), 404);

        app(AuditService::class)->log($this->actor($request), 'DOCUMENT_DOWNLOADED', $documentFile, 'Downloaded a private research document.', $request);

        return Storage::disk('researchnav_private')->download($documentFile->file_path, $documentFile->original_filename, ['Content-Type' => $documentFile->mime_type]);
    }
}
