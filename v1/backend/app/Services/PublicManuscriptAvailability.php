<?php

namespace App\Services;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use Illuminate\Support\Collection;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class PublicManuscriptAvailability
{
    public function __construct(
        private readonly PrivateDocumentFileResolver $files,
    ) {}

    /** @return Collection<int, DocumentFile> */
    public function availableFiles(ResearchDocument $research): Collection
    {
        $files = $research->relationLoaded('files')
            ? $research->files
            : $research->files()->current()->where('document_type', 'final_manuscript')->get();

        return $files
            ->filter(fn (DocumentFile $file): bool => $file->is_current && $file->document_type === 'final_manuscript')
            ->filter(function (DocumentFile $file) use ($research): bool {
                try {
                    $this->files->resolve($research, $file);

                    return true;
                } catch (NotFoundHttpException) {
                    return false;
                }
            })
            ->values();
    }

    public function hasAvailableFile(ResearchDocument $research): bool
    {
        return $this->availableFiles($research)->isNotEmpty();
    }
}
