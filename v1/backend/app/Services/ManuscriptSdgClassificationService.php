<?php

namespace App\Services;

use App\Models\ManuscriptSdgClassification;
use App\Models\ManuscriptSearchDocument;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class ManuscriptSdgClassificationService
{
    public function __construct(private readonly SdgDeclarationDetector $detector) {}

    public function classify(ManuscriptSearchDocument $projection): ManuscriptSdgClassification
    {
        $projectionId = $this->persistedProjectionId($projection);

        return DB::transaction(function () use ($projectionId): ManuscriptSdgClassification {
            $currentProjection = ManuscriptSearchDocument::query()->lockForUpdate()->find($projectionId);
            $this->requireReadyProjection($currentProjection);

            $classification = ManuscriptSdgClassification::query()->firstOrNew([
                'manuscript_search_document_id' => $currentProjection->id,
            ]);
            $classification->fill([
                'detector_version' => $this->detectorVersion(),
                'projection_indexed_at' => $currentProjection->indexed_at,
                'classified_at' => now(),
            ]);
            $classification->save();

            $classification->detections()->delete();
            foreach ($this->detector->detect($currentProjection->body_text) as $sdgNumber) {
                $classification->detections()->create(['sdg_number' => $sdgNumber]);
            }

            return $classification->fresh(['detections']);
        });
    }

    public function isCurrent(ManuscriptSearchDocument $projection): bool
    {
        $projectionId = $this->persistedProjectionId($projection);
        $currentProjection = ManuscriptSearchDocument::query()->find($projectionId);
        if (! $this->isReadyProjection($currentProjection)) {
            return false;
        }

        $classification = ManuscriptSdgClassification::query()
            ->where('manuscript_search_document_id', $currentProjection->id)
            ->where('detector_version', $this->detectorVersion())
            ->first();

        return $classification !== null
            && $classification->projection_indexed_at->format('Y-m-d H:i:s.u')
                === $currentProjection->indexed_at->format('Y-m-d H:i:s.u');
    }

    public function invalidate(ManuscriptSearchDocument $projection): void
    {
        $projectionId = $this->persistedProjectionId($projection);

        DB::transaction(function () use ($projectionId): void {
            ManuscriptSdgClassification::query()
                ->where('manuscript_search_document_id', $projectionId)
                ->delete();
        });
    }

    private function persistedProjectionId(ManuscriptSearchDocument $projection): int
    {
        if (! $projection->exists || $projection->getKey() === null) {
            throw new InvalidArgumentException('An SDG classification requires a persisted manuscript search projection.');
        }

        return (int) $projection->getKey();
    }

    private function requireReadyProjection(?ManuscriptSearchDocument $projection): void
    {
        if (! $this->isReadyProjection($projection)) {
            throw new InvalidArgumentException('An SDG classification requires a ready persisted manuscript search projection with body text.');
        }
    }

    private function isReadyProjection(?ManuscriptSearchDocument $projection): bool
    {
        return $projection !== null
            && $projection->extraction_status === 'ready'
            && is_string($projection->body_text)
            && $projection->indexed_at !== null;
    }

    private function detectorVersion(): string
    {
        return (string) config('researchnav.sdg.detector_version');
    }
}
