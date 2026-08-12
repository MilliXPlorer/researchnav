<?php

namespace App\Services;

use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ResearchService
{
    private const TRANSITIONS = [
        'submitted' => ['under_review'],
        'under_review' => ['approved'],
    ];

    public function __construct(private readonly AuditService $audit, private readonly MonitoringService $monitoring) {}

    /** @param array<string, mixed> $data @param array<int, array<string, mixed>> $authors */
    public function createDraft(User $actor, array $data, array $authors, ?Request $request = null): ResearchDocument
    {
        return DB::transaction(function () use ($actor, $data, $authors, $request): ResearchDocument {
            $research = ResearchDocument::query()->create(array_merge($this->metadata($data), [
                'submitted_by' => $actor->id,
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
            if ($locked->submitted_by !== $actor->id) {
                throw $this->notAuthorized();
            }
            $this->ensureEditable($locked);
            $locked->fill(array_merge($this->metadata($data), ['visibility' => 'private']));
            $locked->save();
            if ($authors !== null) {
                $this->replaceAuthors($locked, $authors);
            }
            $this->monitoring->log($locked, 'RESEARCH_UPDATED', $actor, 'Research metadata updated.', $locked->submission_status, $locked->submission_status, 'open');
            $this->audit->log($actor, 'RESEARCH_UPDATED', $locked, 'Updated editable research metadata.', $request);

            return $locked->fresh(['authors.user', 'category', 'submitter']);
        });
    }

    public function submit(User $actor, ResearchDocument $research, ?Request $request = null): ResearchDocument
    {
        return DB::transaction(function () use ($actor, $research, $request): ResearchDocument {
            $locked = ResearchDocument::query()->whereKey($research->id)->lockForUpdate()->firstOrFail();
            $actor = $this->currentActor($actor);
            if ($locked->submitted_by !== $actor->id) {
                throw $this->notAuthorized();
            }
            if ($locked->submission_status !== 'draft') {
                throw ValidationException::withMessages(['submission_status' => ['Only drafts can be submitted.']]);
            }
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
            if ($locked->submission_status !== 'approved') {
                throw ValidationException::withMessages(['submission_status' => ['Only approved research can be archived.']]);
            }
            if (! in_array($visibility, ResearchDocument::VISIBILITIES, true)) {
                throw ValidationException::withMessages(['visibility' => ['The archive visibility is invalid.']]);
            }
            $previous = $locked->submission_status;
            $locked->update(['archive_status' => 'archived', 'submission_status' => 'archived', 'visibility' => $visibility, 'archived_at' => now()]);
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
            $previous = $research->submission_status;
            if (! in_array($target, self::TRANSITIONS[$previous] ?? [], true)) {
                throw ValidationException::withMessages(['submission_status' => ['The requested status transition is not allowed.']]);
            }
            $values = ['submission_status' => $target];
            if ($target === 'approved') {
                $values['approved_at'] = now();
            }
            $research->update($values);
            $this->monitoring->log($research, $activity, $actor, $remarks, $previous, $target, 'open');
            $this->audit->log($actor, $activity, $research, $remarks, $request);
            $research->submitter?->notify(new ResearchActivityNotification($research, $activity, 'Research activity', $remarks));

            return $research->fresh(['authors.user', 'category', 'submitter']);
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

    private function notAuthorized(string $message = 'The actor is not authorized for this research.'): ValidationException
    {
        return ValidationException::withMessages(['authorization' => [$message]]);
    }
}
