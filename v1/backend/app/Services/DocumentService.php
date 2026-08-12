<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DocumentService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring) {}

    public function upload(User $actor, ResearchDocument $research, UploadedFile $upload, string $documentType, ?Request $request = null): DocumentFile
    {
        $path = null;

        try {
            return DB::transaction(function () use ($actor, $research, $upload, $documentType, &$path, $request): DocumentFile {
                // Lock the parent before calculating a version so concurrent uploads serialize.
                $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
                $actor = $this->currentActor($actor);
                if (! $this->canUpload($actor, $locked, $documentType)) {
                    throw ValidationException::withMessages(['authorization' => ['The actor cannot upload this document in the current research status.']]);
                }
                $extension = $this->extensionForMime((string) $upload->getMimeType());
                if ($extension === null) {
                    throw ValidationException::withMessages(['file' => ['The uploaded file type is not supported.']]);
                }
                $filename = Str::uuid()->toString().'.'.$extension;
                $path = 'research/'.$locked->id.'/'.$filename;
                Storage::disk('researchnav_private')->putFileAs('research/'.$locked->id, $upload, $filename);
                $version = ((int) DocumentFile::query()->where('research_document_id', $locked->id)->where('document_type', $documentType)->lockForUpdate()->max('version_number')) + 1;
                DocumentFile::query()->where('research_document_id', $locked->id)->where('document_type', $documentType)->where('is_current', true)->update(['is_current' => false]);
                $file = DocumentFile::query()->create([
                    'research_document_id' => $locked->id, 'uploaded_by' => $actor->id, 'document_type' => $documentType,
                    'version_number' => $version, 'original_filename' => $this->safeOriginalFilename($upload->getClientOriginalName()), 'stored_filename' => $filename,
                    'file_path' => $path, 'file_extension' => $extension, 'mime_type' => $upload->getMimeType(),
                    'file_size' => $upload->getSize(), 'is_current' => true, 'uploaded_at' => now(),
                ]);
                $this->monitoring->log($locked, 'DOCUMENT_UPLOADED', $actor, "Uploaded {$documentType} version {$version}.", null, null, 'open');
                $this->audit->log($actor, 'DOCUMENT_UPLOADED', $file, 'Uploaded a private research document.', $request);

                return $file;
            });
        } catch (\Throwable $exception) {
            if ($path !== null) {
                Storage::disk('researchnav_private')->delete($path);
            }
            throw $exception;
        }
    }

    private function extensionForMime(string $mime): ?string
    {
        return match ($mime) {
            'application/pdf' => 'pdf',
            'application/msword' => 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            default => null,
        };
    }

    private function safeOriginalFilename(string $filename): string
    {
        $name = preg_replace('/[^\pL\pN._ -]+/u', '_', basename($filename)) ?? '';
        $name = trim($name, " .\t\r\n");

        return Str::limit($name !== '' ? $name : 'document', 500, '');
    }

    private function canUpload(User $actor, ResearchDocument $research, string $documentType): bool
    {
        return ($research->submitted_by === $actor->id && in_array($research->submission_status, ['draft', 'revision_required'], true))
            || (DomainAuthorization::isOffice($actor) && $research->submission_status === 'approved' && in_array($documentType, ['final_manuscript', 'attachment'], true));
    }

    private function currentActor(User $actor): User
    {
        $current = User::query()->find($actor->id);
        if ($current === null) {
            throw ValidationException::withMessages(['authorization' => ['The actor is not authorized to upload documents.']]);
        }

        return $current;
    }
}
