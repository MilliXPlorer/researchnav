<?php

namespace App\Services;

use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use App\Models\TitleValidation;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Policies\TitleValidationPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TitleValidationService
{
    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring, private readonly ConsolidationShadowService $shadow) {}

    /** @param array<string, never> $data */
    public function createPending(User $actor, ResearchDocument $research, array $data, ?Request $request = null): TitleValidation
    {
        return DB::transaction(function () use ($actor, $research, $request): TitleValidation {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! (new TitleValidationPolicy)->create($actor, $locked)) {
                throw $this->notAuthorized();
            }
            if ($locked->titleValidations()->where(TitleValidation::column('validation_status'), 'pending')->lockForUpdate()->exists()) {
                throw ValidationException::withMessages(['validation_status' => ['A title-validation request is already pending.']]);
            }
            $validationData = ['research_document_id' => $locked->id, 'validated_by' => $actor->id, 'validation_status' => 'pending'];
            if ((new TitleValidation)->usesFinalStorage()) {
                $validationData['reviewer_role'] = $actor->role;
                $validationData['review_type'] = 'title_validation';
            }
            $validation = TitleValidation::query()->create($validationData);
            $this->shadow->mirrorTitleValidation($validation);
            $this->monitoring->log($locked, 'TITLE_VALIDATION_REQUESTED', $actor, 'Human title validation requested.', null, null, 'open');
            $this->audit->log($actor, 'TITLE_VALIDATION_REQUESTED', $validation, 'Created pending title validation.', $request);

            return $validation;
        });
    }

    /** @param array<string, mixed> $data */
    public function recommend(User $actor, ResearchDocument $research, array $data, ?Request $request = null): TitleValidation
    {
        return DB::transaction(function () use ($actor, $research, $data, $request): TitleValidation {
            $research = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::isAssignedReviewer($actor, $research)) {
                throw $this->notAuthorized();
            }
            if (! in_array($research->submission_status, ['submitted', 'under_review', 'revision_required'], true)) {
                throw ValidationException::withMessages(['submission_status' => ['Title recommendations require an active review workflow.']]);
            }
            if (isset($data['similarity_result_id'])) {
                $belongsToResearch = SimilarityResult::query()
                    ->whereKey($data['similarity_result_id'])
                    ->where('source_research_id', $research->id)
                    ->lockForUpdate()
                    ->exists();
                if (! $belongsToResearch) {
                    throw ValidationException::withMessages(['similarity_result_id' => ['Similarity result must belong to this research.']]);
                }
            }

            $validationData = [
                'research_document_id' => $research->id,
                'similarity_result_id' => $data['similarity_result_id'] ?? null,
                'validated_by' => $actor->id,
                'validation_status' => $data['validation_status'],
                'adviser_remarks' => $data['adviser_remarks'] ?? null,
                'validated_at' => now(),
            ];
            if ((new TitleValidation)->usesFinalStorage()) {
                $validationData['reviewer_role'] = $actor->role;
                $validationData['review_type'] = 'recommendation';
            }
            $validation = TitleValidation::query()->create($validationData);
            $this->shadow->mirrorTitleValidation($validation);
            $this->monitoring->log($research, 'TITLE_RECOMMENDATION_RECORDED', $actor, 'Human title recommendation recorded.', null, $validation->validation_status, 'open');
            $this->audit->log($actor, 'TITLE_RECOMMENDATION_RECORDED', $validation, 'Recorded an advisory title recommendation.', $request);
            $research->submitter?->notify(new ResearchActivityNotification($research, 'TITLE_RECOMMENDATION_RECORDED', 'Title recommendation updated', 'A reviewer recorded a title recommendation.'));

            return $validation->fresh(['validator', 'similarityResult']);
        });
    }

    /** @param array<string, mixed> $data */
    public function record(User $actor, TitleValidation $validation, array $data, ?Request $request = null): TitleValidation
    {
        return DB::transaction(function () use ($actor, $validation, $data, $request): TitleValidation {
            $validation = TitleValidation::query()->whereKey($validation->id)->lockForUpdate()->firstOrFail();
            $research = ResearchDocument::query()->whereKey($validation->research_document_id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::isOffice($actor)) {
                throw $this->notAuthorized();
            }
            if ($validation->validation_status !== 'pending' || ! in_array($data['validation_status'], ['approved', 'revision_required', 'rejected'], true)) {
                throw ValidationException::withMessages(['validation_status' => ['A pending human decision is required.']]);
            }
            if (isset($data['similarity_result_id'])) {
                $result = SimilarityResult::query()->whereKey($data['similarity_result_id'])->lockForUpdate()->firstOrFail();
                if ($result->source_research_id !== $research->id) {
                    throw ValidationException::withMessages(['similarity_result_id' => ['Similarity result must belong to this research.']]);
                }
            }
            $validation->update([
                'validation_status' => $data['validation_status'],
                'adviser_remarks' => $data['adviser_remarks'] ?? null, 'similarity_result_id' => $data['similarity_result_id'] ?? null,
                'validated_by' => $actor->id, 'validated_at' => now(),
            ]);
            $this->shadow->mirrorTitleValidation($validation->fresh());
            $this->monitoring->log($research, 'TITLE_VALIDATED', $actor, 'Human title validation recorded.', null, $validation->validation_status, 'open');
            $this->audit->log($actor, 'TITLE_VALIDATED', $validation, 'Recorded explicit human title decision.', $request);
            $research->submitter?->notify(new ResearchActivityNotification($research, 'TITLE_VALIDATED', 'Title validation updated', 'A human title validation decision was recorded.'));

            return $validation->fresh(['validator', 'similarityResult']);
        });
    }

    private function currentActor(User $actor): User
    {
        $current = User::query()->lockForUpdate()->find($actor->id);
        if ($current === null || ! DomainAuthorization::isActiveAccount($current)) {
            throw $this->notAuthorized();
        }

        return $current;
    }

    private function notAuthorized(): ValidationException
    {
        return ValidationException::withMessages(['authorization' => ['The actor is not authorized to validate this title.']]);
    }
}
