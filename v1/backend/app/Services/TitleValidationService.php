<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TitleValidationService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring) {}

    /** @param array{validated_by:string} $data */
    public function createPending(User $actor, ResearchDocument $research, array $data, ?Request $request = null): TitleValidation
    {
        return DB::transaction(function () use ($actor, $research, $data, $request): TitleValidation {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::canReview($actor, $locked)) {
                throw $this->notAuthorized();
            }
            if ($data['validated_by'] !== $actor->id) {
                throw ValidationException::withMessages(['validated_by' => ['A pending validation must name its assigned creator.']]);
            }
            $validation = TitleValidation::query()->create(['research_document_id' => $locked->id, 'validated_by' => $actor->id, 'validation_status' => 'pending']);
            $this->monitoring->log($locked, 'TITLE_VALIDATION_REQUESTED', $actor, 'Human title validation requested.', null, null, 'open');
            $this->audit->log($actor, 'TITLE_VALIDATION_REQUESTED', $validation, 'Created pending title validation.', $request);

            return $validation;
        });
    }

    /** @param array<string, mixed> $data */
    public function record(User $actor, TitleValidation $validation, array $data, ?Request $request = null): TitleValidation
    {
        return DB::transaction(function () use ($actor, $validation, $data, $request): TitleValidation {
            $research = ResearchDocument::query()->whereKey($validation->research_document_id)->lockForUpdate()->firstOrFail();
            $validation = TitleValidation::query()->whereKey($validation->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if ($validation->validated_by !== $actor->id || ! DomainAuthorization::canReview($actor, $research)) {
                throw $this->notAuthorized();
            }
            if ($validation->validation_status !== 'pending' || ! in_array($data['validation_status'], ['approved', 'revision_required', 'rejected'], true)) {
                throw ValidationException::withMessages(['validation_status' => ['A pending human decision is required.']]);
            }
            if (isset($data['similarity_result_id'])) {
                $result = SimilarityResult::query()->findOrFail($data['similarity_result_id']);
                if ($result->source_research_id !== $validation->research_document_id) {
                    throw ValidationException::withMessages(['similarity_result_id' => ['Similarity result must belong to this research.']]);
                }
            }
            $validation->update([
                'validation_status' => $data['validation_status'],
                'adviser_remarks' => $data['adviser_remarks'] ?? null, 'similarity_result_id' => $data['similarity_result_id'] ?? null,
                'validated_by' => $actor->id, 'validated_at' => now(),
            ]);
            $this->monitoring->log($research, 'TITLE_VALIDATED', $actor, 'Human title validation recorded.', null, $validation->validation_status, 'open');
            $this->audit->log($actor, 'TITLE_VALIDATED', $validation, 'Recorded explicit human title decision.', $request);
            $research->submitter?->notify(new ResearchActivityNotification($research, 'TITLE_VALIDATED', 'Title validation updated', 'A human title validation decision was recorded.'));

            return $validation->fresh(['validator', 'similarityResult']);
        });
    }

    private function currentActor(User $actor): User
    {
        $current = User::query()->find($actor->id);
        if ($current === null) {
            throw $this->notAuthorized();
        }

        return $current;
    }

    private function notAuthorized(): ValidationException
    {
        return ValidationException::withMessages(['authorization' => ['The actor is not authorized to validate this title.']]);
    }
}
