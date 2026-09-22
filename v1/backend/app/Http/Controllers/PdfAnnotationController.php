<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePdfAnnotationRequest;
use App\Http\Resources\PdfAnnotationResource;
use App\Models\DocumentFile;
use App\Models\PdfAnnotation;
use App\Models\ResearchDocument;
use App\Policies\DocumentFilePolicy;
use App\Policies\PdfAnnotationPolicy;
use App\Services\PdfAnnotationService;
use Illuminate\Http\Request;

class PdfAnnotationController extends DomainController
{
    public function index(Request $request, ResearchDocument $researchDocument, DocumentFile $documentFile)
    {
        abort_unless((int) $documentFile->research_document_id === (int) $researchDocument->id, 404);
        abort_unless($documentFile->mime_type === 'application/pdf', 404);
        $actor = $this->actor($request);
        $policy = new PdfAnnotationPolicy;
        $this->allowed((new DocumentFilePolicy)->view($actor, $documentFile));
        $this->allowed($policy->view($actor, $researchDocument));

        $query = PdfAnnotation::query()
            ->where('research_document_id', $researchDocument->id)
            ->where('document_file_id', $documentFile->id)
            ->with(['author', 'documentFile'])
            ->orderBy('page_number')
            ->orderBy('created_at');
        if (! $policy->viewConsolidated($actor, $researchDocument)) {
            $query->where('author_id', $actor->id);
        }

        return PdfAnnotationResource::collection($query->get())
            ->response()
            ->header('Cache-Control', 'private, no-store');
    }

    public function store(StorePdfAnnotationRequest $request, ResearchDocument $researchDocument, DocumentFile $documentFile, PdfAnnotationService $service)
    {
        abort_unless((int) $documentFile->research_document_id === (int) $researchDocument->id, 404);
        $this->allowed((new DocumentFilePolicy)->view($this->actor($request), $documentFile));
        $this->allowed((new PdfAnnotationPolicy)->create($this->actor($request), $researchDocument));

        return (new PdfAnnotationResource($service->create(
            $this->actor($request),
            $researchDocument,
            $documentFile,
            $request->validated(),
            $request,
        )))->response()->setStatusCode(201)->header('Cache-Control', 'private, no-store');
    }
}
