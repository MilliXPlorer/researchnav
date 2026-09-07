<?php

namespace App\Services;

use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\Revision;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use App\Policies\ResearchDocumentPolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ResearchService
{
    private const TRANSITIONS = [
        'submitted' => ['under_review'],
        'under_review' => ['approved'],
    ];

    public function __construct(
        private readonly AuditService $audit,
        private readonly MonitoringService $monitoring,
        private readonly ManuscriptSearchProjectionService $manuscriptSearch,
        private readonly DocumentService $documents,
    ) {}

    /** @param array<string, mixed> $data @param array<int, array<string, mixed>> $authors */
    public function createDraft(User $actor, array $data, array $authors, ?Request $request = null): ResearchDocument
    {
        return DB::transaction(function () use ($actor, $data, $authors, $request): ResearchDocument {
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::isResearcher($actor) && ! DomainAuthorization::isActiveAdministrator($actor)) {
                throw $this->notAuthorized();
            }
            $research = ResearchDocument::query()->create(array_merge($this->metadata($data), [
                'submitted_by' => $actor->id,
                'submission_reference' => $this->submissionReference(),
                'submission_status' => 'draft', 'archive_status' => 'not_archived', 'visibility' => 'private',
            ]));
            $this->replaceAuthors($research, $authors);
            $this->monitoring->log($research, 'RESEARCH_CREATED', $actor, 'Research draft created.', null, 'draft', 'open');
            $this->audit->log($actor, 'RESEARCH_CREATED', $research, 'Created research draft.', $request);

            return $research->load(['authors.user', 'category', 'submitter']);
        });
    }

    /** @param array<string, mixed> $data @param array<int, array<string, mixed>>|null $authors */
    public function update(User $actor, ResearchDocument $research, array $data, ?array $authors = null, ?Request $request = null): ResearchDocument
    {
        return DB::transaction(function () use ($actor, $research, $data, $authors, $request): ResearchDocument {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            $importedArchive = $locked->import_source_sha256 !== null && $locked->submission_status === 'archived';
            if ($importedArchive ? ! DomainAuthorization::isOffice($actor) : (! DomainAuthorization::isResearcherParticipant($actor, $locked) && ! DomainAuthorization::isActiveAdministrator($actor))) {
                throw $this->notAuthorized();
            }
            if (! $importedArchive) {
                $this->ensureEditable($locked);
            }
            $locked->fill($importedArchive ? $this->metadata($data) : array_merge($this->metadata($data), ['visibility' => 'private']));
            $locked->save();
            if ($authors !== null) {
                if (! $importedArchive && ! DomainAuthorization::isResearcherOwner($actor, $locked) && ! DomainAuthorization::isActiveAdministrator($actor)) {
                    throw $this->notAuthorized('Only the primary researcher can change research authors.');
                }
                $this->replaceAuthors($locked, $authors);
            }
            $this->monitoring->log($locked, 'RESEARCH_UPDATED', $actor, 'Research metadata updated.', $locked->submission_status, $locked->submission_status, 'open');
            $this->audit->log($actor, 'RESEARCH_UPDATED', $locked, 'Updated editable research metadata.', $request);

            return $locked->fresh(['authors.user', 'category', 'submitter']);
        });
    }

    public function deleteImported(User $actor, ResearchDocument $research, ?Request $request = null): void
    {
        $actor = $this->currentActor($actor);
        $research = ResearchDocument::query()->findOrFail($research->id);
        if (! (new ResearchDocumentPolicy)->delete($actor, $research)) {
            throw $this->notAuthorized('Only Research Office personnel can delete imported research records.');
        }

        foreach ($research->files()->get() as $file) {
            $this->documents->delete($actor, $file, $request);
        }

        DB::transaction(function () use ($actor, $research, $request): void {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $this->monitoring->log($locked, 'RESEARCH_DELETED', $actor, 'Deleted an imported research record.', 'archived', null, 'archived');
            $this->audit->log($actor, 'RESEARCH_DELETED', $locked, 'Deleted an imported research record.', $request);
            $locked->deleteOrFail();
        });
    }

    public function submit(User $actor, ResearchDocument $research, ?Request $request = null): ResearchDocument
    {
        return DB::transaction(function () use ($actor, $research, $request): ResearchDocument {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::isResearcherParticipant($actor, $locked) && ! DomainAuthorization::isActiveAdministrator($actor)) {
                throw $this->notAuthorized();
            }
            if ($locked->submission_status !== 'draft') {
                throw ValidationException::withMessages(['submission_status' => ['Only drafts can be submitted.']]);
            }
            $this->ensureCompleteForSubmission($locked);
            $locked->update(['submission_status' => 'submitted', 'submitted_at' => now()]);
            $this->monitoring->log($locked, 'RESEARCH_SUBMITTED', $actor, 'Research was submitted for review.', 'draft', 'submitted', 'open');
            $this->audit->log($actor, 'RESEARCH_SUBMITTED', $locked, 'Research was submitted for review.', $request);
            $locked->submitter?->notify(new ResearchActivityNotification($locked, 'RESEARCH_SUBMITTED', 'Research activity', 'Research was submitted for review.'));

            return $locked->fresh(['authors.user', 'category', 'submitter']);
        });
    }

    public function transition(User $actor, ResearchDocument $research, string $target, ?Request $request = null): ResearchDocument
    {
        return $this->applyTransition($actor, $research, $target, 'RESEARCH_STATUS_CHANGED', "Research status changed to {$target}.", $request);
    }

    public function archive(User $actor, ResearchDocument $research, string $visibility, ?Request $request = null): ResearchDocument
    {
        return DB::transaction(function () use ($actor, $research, $visibility, $request): ResearchDocument {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::isOffice($actor)) {
                throw $this->notAuthorized('Only research office personnel can archive research.');
            }
            if ($locked->archive_status === 'archived') {
                throw ValidationException::withMessages(['archive_status' => ['Research has already been archived.']]);
            }
            if ($locked->submission_status !== 'approved') {
                throw ValidationException::withMessages(['submission_status' => ['Only approved research can be archived.']]);
            }
            if (! in_array($visibility, ResearchDocument::VISIBILITIES, true)) {
                throw ValidationException::withMessages(['visibility' => ['The archive visibility is invalid.']]);
            }
            $previous = $locked->submission_status;
            $locked->update(['archive_status' => 'archived', 'submission_status' => 'archived', 'visibility' => $visibility, 'archived_at' => now()]);
            if ($locked->import_source_sha256 === null) {
                $this->manuscriptSearch->invalidate((int) $locked->id);
            }
            $this->monitoring->log($locked, 'RESEARCH_ARCHIVED', $actor, 'Research archived.', $previous, 'archived', 'archived');
            $this->audit->log($actor, 'RESEARCH_ARCHIVED', $locked, 'Archived approved research.', $request);
            $locked->submitter?->notify(new ResearchActivityNotification($locked, 'RESEARCH_ARCHIVED', 'Research archived', 'Your research has been archived.'));

            return $locked->fresh(['authors.user', 'category', 'submitter']);
        });
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function metadata(array $data): array
    {
        $allowed = array_intersect_key($data, array_flip(['category_id', 'title', 'abstract', 'keywords', 'publication_year', 'research_stage']));
        if (isset($allowed['title'])) {
            $allowed['normalized_title'] = str($allowed['title'])->lower()->replaceMatches('/[^a-z0-9]+/', ' ')->trim()->toString();
        }

        return $allowed;
    }

    private function ensureCompleteForSubmission(ResearchDocument $research): void
    {
        $errors = [];
        if (trim($research->title) === '') {
            $errors['title'] = ['A title is required before submission.'];
        }
        if ($research->category_id === null || ! $research->category()->where('is_active', true)->exists()) {
            $errors['category_id'] = ['An active category is required before submission.'];
        }
        if (! $research->authors()->exists()) {
            $errors['authors'] = ['At least one author is required before submission.'];
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /** @param array<int, array<string, mixed>> $authors */
    private function replaceAuthors(ResearchDocument $research, array $authors): void
    {
        $research->authors()->delete();
        foreach (array_values($authors) as $index => $author) {
            ResearchAuthor::query()->create([
                'research_document_id' => $research->id,
                'user_id' => $author['user_id'] ?? null,
                'author_name' => $author['author_name'],
                'author_order' => $index + 1,
                'is_corresponding_author' => (bool) ($author['is_corresponding_author'] ?? false),
            ]);
        }
    }

    private function ensureEditable(ResearchDocument $research): void
    {
        if (! in_array($research->submission_status, ['draft', 'revision_required'], true)) {
            throw ValidationException::withMessages(['submission_status' => ['Only drafts and revision-required research are editable.']]);
        }
    }

    private function applyTransition(User $actor, ResearchDocument $research, ?string $target, string $activity, string $remarks, ?Request $request): ResearchDocument
    {
        return DB::transaction(function () use ($actor, $research, $target, $activity, $remarks, $request): ResearchDocument {
            $research = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if (! DomainAuthorization::canReview($actor, $research)) {
                throw $this->notAuthorized();
            }
            if ($target === 'approved' && ! DomainAuthorization::isOffice($actor)) {
                throw $this->notAuthorized('Only Research Office personnel can grant final approval.');
            }
            $previous = $research->submission_status;
            if (! in_array($target, self::TRANSITIONS[$previous] ?? [], true)) {
                throw ValidationException::withMessages(['submission_status' => ['The requested status transition is not allowed.']]);
            }
            $values = ['submission_status' => $target];
            if ($target === 'approved') {
                $values['approved_at'] = now();
            }
            $research->update($values);
            if ($target === 'approved') {
                $revision = Revision::query()
                    ->where('research_document_id', $research->id)
                    ->whereIn(Revision::column('revision_status'), ['resubmitted', 'under_review'])
                    ->orderByDesc(Revision::column('revision_number'))
                    ->lockForUpdate()
                    ->first();
                if ($revision !== null) {
                    $revision->update(['revision_status' => 'accepted', 'resolved_at' => now()]);
                    $this->monitoring->log($research, 'REVISION_ACCEPTED', $actor, "Revision {$revision->revision_number} completed by final approval.", 'under_review', 'accepted', 'completed');
                }
            }
            $this->monitoring->log($research, $activity, $actor, $remarks, $previous, $target, 'open');
            $this->audit->log($actor, $activity, $research, $remarks, $request);
            $research->submitter?->notify(new ResearchActivityNotification($research, $activity, 'Research activity', $remarks));

            return $research->fresh(['authors.user', 'category', 'submitter']);
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

    private function notAuthorized(string $message = 'The actor is not authorized for this research.'): ValidationException
    {
        return ValidationException::withMessages(['authorization' => [$message]]);
    }

    private function submissionReference(): string
    {
        do {
            $reference = 'RN-'.now()->format('Y').'-'.strtoupper(Str::random(8));
        } while (ResearchDocument::query()->where('submission_reference', $reference)->exists());

        return $reference;
    }
}
