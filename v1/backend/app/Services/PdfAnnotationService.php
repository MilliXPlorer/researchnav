<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\PdfAnnotation;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Policies\PdfAnnotationPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PdfAnnotationService
{
    public function __construct(
        private readonly AuditService $audit,
        private readonly PrivateDocumentFileResolver $files,
    ) {}

    public function create(User $actor, ResearchDocument $research, DocumentFile $file, array $data, ?Request $request = null): PdfAnnotation
    {
        return DB::transaction(function () use ($actor, $research, $file, $data, $request): PdfAnnotation {
            $actor = User::query()->whereKey($actor->id)->lockForUpdate()->firstOrFail();
            $research = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $file = DocumentFile::query()->whereKey($file->id)->lockForUpdate()->firstOrFail();
            if ((int) $file->research_document_id !== (int) $research->id) {
                abort(404);
            }
            if (! (new PdfAnnotationPolicy)->create($actor, $research)) {
                throw ValidationException::withMessages(['authorization' => ['The actor cannot annotate this research document.']]);
            }
            if ($file->mime_type !== 'application/pdf') {
                throw ValidationException::withMessages(['document_file_id' => ['Inline annotations are available for PDF files only.']]);
            }
            $resolved = $this->files->resolve($research, $file);
            if (! $this->files->isPdf($resolved)) {
                throw ValidationException::withMessages(['document_file_id' => ['The selected file is not a valid PDF.']]);
            }

            $anchor = $data['anchor'];
            $annotation = PdfAnnotation::query()->create([
                'research_document_id' => $research->id,
                'document_file_id' => $file->id,
                'author_id' => $actor->id,
                'author_role' => $actor->role,
                'kind' => $data['kind'],
                'body' => isset($data['body']) ? trim($data['body']) : null,
                'anchor_schema_version' => $anchor['schema_version'],
                'page_number' => $anchor['page_number'],
                'selected_text' => trim($anchor['exact']),
                'text_prefix' => isset($anchor['prefix']) ? trim($anchor['prefix']) : null,
                'text_suffix' => isset($anchor['suffix']) ? trim($anchor['suffix']) : null,
                'rects' => $anchor['rects'],
            ]);
            $this->audit->log($actor, 'PDF_ANNOTATION_CREATED', $annotation, 'Added a confidential annotation to a private PDF.', $request);

            return $annotation->load(['author', 'documentFile']);
        });
    }
}
