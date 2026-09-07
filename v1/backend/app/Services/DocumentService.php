<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\PendingPrivateFileDeletion;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Policies\DocumentFilePolicy;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class DocumentService
{
    private const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

    public function __construct(
        private readonly AuditService $audit,
        private readonly MonitoringService $monitoring,
        private readonly ManuscriptSearchProjectionService $manuscriptSearch,
        private readonly SupabaseStorageService $supabase,
    ) {}

    public function upload(User $actor, ResearchDocument $research, UploadedFile $upload, string $documentType, ?Request $request = null): DocumentFile
    {
        $path = null;

        try {
            return DB::transaction(function () use ($actor, $research, $upload, $documentType, &$path, $request): DocumentFile {
                // Lock the parent before calculating a version so concurrent uploads serialize.
                $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
                $actor = $this->currentActor($actor);
                if (! (new DocumentFilePolicy)->upload($actor, $locked, $documentType)) {
                    throw ValidationException::withMessages(['authorization' => ['The actor cannot upload this document in the current research status.']]);
                }
                if (($upload->getSize() ?? 0) < 1 || $upload->getSize() > self::MAX_UPLOAD_BYTES) {
                    throw ValidationException::withMessages(['file' => ['The uploaded file must be between 1 byte and 25 MB.']]);
                }
                $extension = $this->extensionForMime((string) $upload->getMimeType());
                if ($extension === null) {
                    throw ValidationException::withMessages(['file' => ['The uploaded file type is not supported.']]);
                }
                $filename = Str::uuid()->toString().'.'.$extension;
                $path = 'research/'.$locked->id.'/'.$filename;
                if (Storage::disk('researchnav_private')->putFileAs('research/'.$locked->id, $upload, $filename) === false) {
                    throw new \RuntimeException('Unable to store the uploaded document.');
                }
                $version = ((int) DocumentFile::query()->where('research_document_id', $locked->id)->where('document_type', $documentType)->lockForUpdate()->max('version_number')) + 1;
                DocumentFile::query()->where('research_document_id', $locked->id)->where('document_type', $documentType)->where('is_current', true)->update(['is_current' => false]);
                $file = DocumentFile::query()->create([
                    'research_document_id' => $locked->id, 'uploaded_by' => $actor->id, 'document_type' => $documentType,
                    'version_number' => $version, 'original_filename' => $this->safeOriginalFilename($upload->getClientOriginalName()), 'stored_filename' => $filename,
                    'file_path' => $path, 'file_extension' => $extension, 'mime_type' => $upload->getMimeType(),
                    'file_size' => $upload->getSize(), 'is_current' => true, 'uploaded_at' => now(),
                ]);
                if ($documentType === 'final_manuscript') {
                    // Never synchronously parse during an upload; clear any prior body.
                    $this->manuscriptSearch->invalidate((int) $locked->id);
                }
                $this->monitoring->log($locked, 'DOCUMENT_UPLOADED', $actor, "Uploaded {$documentType} version {$version}.", null, null, 'open');
                $this->audit->log($actor, 'DOCUMENT_UPLOADED', $file, 'Uploaded a private research document.', $request);
                if ($documentType === 'revised_manuscript') {
                    $locked->reviewAssignments()->where('is_active', true)->with('reviewer')->get()
                        ->pluck('reviewer')->filter()->unique('id')
                        ->each(fn (User $reviewer) => $reviewer->notify(new ResearchActivityNotification($locked, 'REVISED_MANUSCRIPT_UPLOADED', 'Revised manuscript uploaded', 'A revised manuscript was uploaded and is ready to review.', '/research/'.$locked->id)));
                }

                return $file;
            });
        } catch (\Throwable $exception) {
            if ($path !== null) {
                try {
                    Storage::disk('researchnav_private')->delete($path);
                } catch (\Throwable) {
                    // Cleanup must not obscure the original write or transaction failure.
                }
            }
            throw $exception;
        }
    }

    public function rename(User $actor, DocumentFile $file, string $filename, ?Request $request = null): DocumentFile
    {
        return DB::transaction(function () use ($actor, $file, $filename, $request): DocumentFile {
            [$research, $file] = $this->lockFileWithParent($file);
            $actor = $this->currentActor($actor);
            $this->authorizeManagement($actor, $research, $file);

            $file->original_filename = $this->safeOriginalFilename($filename);
            $file->saveOrFail();
            $this->audit->log($actor, 'DOCUMENT_RENAMED', $file, 'Renamed a private research document.', $request);

            return $file->refresh();
        });
    }

    public function delete(User $actor, DocumentFile $file, ?Request $request = null): void
    {
        $pending = DB::transaction(function () use ($actor, $file, $request): PendingPrivateFileDeletion {
            [$research, $file] = $this->lockFileWithParent($file);
            $actor = $this->currentActor($actor);
            $this->authorizeManagement($actor, $research, $file);
            $path = $this->privateFilePath($research, $file);
            app(ManuscriptSimilarityTextCache::class)->forget($file);

            if ($file->is_current) {
                $replacement = DocumentFile::query()
                    ->where('research_document_id', $research->id)
                    ->where('document_type', $file->document_type)
                    ->whereKeyNot($file->id)
                    ->lockForUpdate()
                    ->orderByDesc('version_number')
                    ->orderByDesc('id')
                    ->first();
            }

            $file->deleteOrFail();

            if (isset($replacement)) {
                DocumentFile::query()
                    ->where('research_document_id', $research->id)
                    ->where('document_type', $file->document_type)
                    ->update(['is_current' => false]);
                $replacement->update(['is_current' => true]);
            }

            $pending = PendingPrivateFileDeletion::query()->create([
                'research_document_id' => $research->id,
                'storage_path' => $path,
            ]);

            $this->audit->log($actor, 'DOCUMENT_DELETED', $file, 'Deleted a private research document.', $request);
            $this->monitoring->log($research, 'DOCUMENT_DELETED', $actor, "Deleted document file {$file->id}.", null, null, 'open');

            return $pending;
        });

        $this->retryPendingDeletion($pending);
    }

    /** Attempt one durable private-storage deletion without exposing its path. */
    public function retryPendingDeletion(PendingPrivateFileDeletion $pending): bool
    {
        $deleted = false;
        try {
            $deleted = $this->supabase->isSupabasePath($pending->storage_path)
                ? $this->deleteSupabaseObject($pending->storage_path)
                : Storage::disk('researchnav_private')->delete($pending->storage_path);
        } catch (\Throwable) {
            $deleted = false;
        }

        if ($deleted) {
            PendingPrivateFileDeletion::query()->whereKey($pending->id)->delete();

            return true;
        }

        PendingPrivateFileDeletion::query()->whereKey($pending->id)->update([
            'attempts' => DB::raw('attempts + 1'),
            'last_attempted_at' => now(),
        ]);

        return false;
    }

    private function extensionForMime(string $mime): ?string
    {
        return match ($mime) {
            'application/pdf' => 'pdf',
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

    /** @return array{ResearchDocument, DocumentFile} */
    private function lockFileWithParent(DocumentFile $file): array
    {
        $researchId = DocumentFile::query()->whereKey($file->id)->firstOrFail(['research_document_id'])->research_document_id;
        // File mutations lock their parent first so uploads and version promotion serialize together.
        $research = ResearchDocument::query()->whereKey($researchId)->lockForUpdate()->firstOrFail();
        $file = DocumentFile::query()->whereKey($file->id)->lockForUpdate()->firstOrFail();
        if ((string) $file->research_document_id !== (string) $research->id) {
            throw ValidationException::withMessages(['document_file_id' => ['The file no longer belongs to this research.']]);
        }

        return [$research, $file->setRelation('researchDocument', $research)];
    }

    private function authorizeManagement(User $actor, ResearchDocument $research, DocumentFile $file): void
    {
        if (! (new DocumentFilePolicy)->manage($actor, $file->setRelation('researchDocument', $research))) {
            throw ValidationException::withMessages(['authorization' => ['The actor cannot manage this document in the current research status.']]);
        }
    }

    private function privateFilePath(ResearchDocument $research, DocumentFile $file): string
    {
        if ($this->supabase->isSupabasePath($file->file_path)) {
            return $file->file_path;
        }

        $path = 'research/'.$research->id.'/'.$file->stored_filename;
        if ($file->file_path !== $path) {
            throw ValidationException::withMessages(['document_file_id' => ['The document file has an invalid private storage path.']]);
        }

        return $path;
    }

    private function deleteSupabaseObject(string $path): bool
    {
        $this->supabase->delete($path);

        return true;
    }

    private function currentActor(User $actor): User
    {
        $current = User::query()->lockForUpdate()->find($actor->id);
        if ($current === null || ! DomainAuthorization::isActiveAccount($current)) {
            throw ValidationException::withMessages(['authorization' => ['The actor is not authorized to upload documents.']]);
        }

        return $current;
    }
}
