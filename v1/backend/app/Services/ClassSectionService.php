<?php

namespace App\Services;

use App\Models\ClassSection;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Notifications\ResearchActivityNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ClassSectionService
{
    public function __construct(private readonly AuditService $audit) {}

    public function listOwned(User $actor): array
    {
        return ClassSection::query()
            ->where('instructor_id', $actor->id)
            ->orderByDesc('id')
            ->withCount('researchDocuments')
            ->addSelect([
                'members_count' => DB::table('class_section_members')
                    ->selectRaw('COUNT(DISTINCT user_id)')
                    ->whereColumn('class_section_id', 'class_sections.id')
                    ->whereNull('research_document_id'),
            ])
            ->get()
            ->map(fn (ClassSection $section) => [
                'id' => $section->id,
                'name' => $section->name,
                'section_code' => $section->section_code,
                'academic_year' => $section->academic_year,
                'is_active' => $section->is_active,
                'documents_count' => $section->research_documents_count,
                'members_count' => $section->members_count,
                'created_at' => $section->created_at?->toISOString(),
            ])
            ->all();
    }

    public function create(User $actor, array $data, ?Request $request = null): ClassSection
    {
        return DB::transaction(function () use ($actor, $data, $request): ClassSection {
            $section = ClassSection::query()->create([
                'instructor_id' => $actor->id,
                'name' => $data['name'],
                'section_code' => $data['section_code'],
                'academic_year' => $data['academic_year'] ?? null,
                'is_active' => true,
            ]);
            $this->audit->log($actor, 'CLASS_SECTION_CREATED', $section, "Created class section [{$section->name}].", $request);

            return $section;
        });
    }

    public function update(User $actor, ClassSection $section, array $data, ?Request $request = null): ClassSection
    {
        return DB::transaction(function () use ($actor, $section, $data, $request): ClassSection {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            if ($locked->instructor_id !== $actor->id && ! DomainAuthorization::isActiveAdministrator($actor)) {
                throw $this->notAuthorized();
            }
            $locked->update([
                'name' => $data['name'] ?? $locked->name,
                'section_code' => $data['section_code'] ?? $locked->section_code,
                'academic_year' => array_key_exists('academic_year', $data) ? $data['academic_year'] : $locked->academic_year,
                'is_active' => $data['is_active'] ?? $locked->is_active,
            ]);
            $this->audit->log($actor, 'CLASS_SECTION_UPDATED', $locked, "Updated class section [{$locked->name}].", $request);

            return $locked;
        });
    }

    /** @return list<array<string, mixed>> */
    public function listMembers(User $actor, ClassSection $section): array
    {
        $this->authorizeOwner($actor, $section);

        return $section->members()
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->withPivot('created_at')
            ->get(['users.id', 'email', 'student_employee_id', 'first_name', 'middle_name', 'last_name'])
            ->unique('id')
            ->map(fn (User $member) => $this->memberPayload($member))
            ->values()
            ->all();
    }

    public function addMembers(User $actor, ClassSection $section, array $userIds, ?Request $request = null): ClassSection
    {
        return DB::transaction(function () use ($actor, $section, $userIds, $request): ClassSection {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            $this->authorizeOwner($actor, $locked);
            $uniqueIds = array_values(array_unique(array_map('strval', $userIds)));
            $students = User::query()
                ->whereIn('id', $uniqueIds)
                ->where('role', 'researcher')
                ->where('access_status', 'active')
                ->get();
            if ($students->count() !== count($uniqueIds)) {
                throw ValidationException::withMessages(['user_ids' => ['Only active student researcher accounts can be added to a class section.']]);
            }
            foreach ($students as $student) {
                $memberExists = DB::table('class_section_members')
                    ->where('class_section_id', $locked->id)
                    ->whereNull('research_document_id')
                    ->where('user_id', $student->id)
                    ->exists();
                if (! $memberExists) {
                    DB::table('class_section_members')->insert([
                        'class_section_id' => $locked->id,
                        'research_document_id' => null,
                        'user_id' => $student->id,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
            $this->audit->log($actor, 'CLASS_SECTION_MEMBERS_UPDATED', $locked, "Added student researchers to class section [{$locked->name}].", $request);

            return $locked;
        });
    }

    public function removeMember(User $actor, ClassSection $section, User $member, ?Request $request = null): ClassSection
    {
        return DB::transaction(function () use ($actor, $section, $member, $request): ClassSection {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            $this->authorizeOwner($actor, $locked);
            $affectedDocumentIds = DB::table('class_section_members')
                ->where('class_section_id', $locked->id)
                ->where('user_id', $member->id)
                ->whereNotNull('research_document_id')
                ->pluck('research_document_id')
                ->unique()
                ->values();

            // Removing a student from the section also removes that student's
            // project memberships in this section. This keeps the folder roster,
            // authors, document access, and actor workspaces in sync.
            DB::table('class_section_members')
                ->where('class_section_id', $locked->id)
                ->where('user_id', $member->id)
                ->delete();

            ResearchDocument::query()->whereIn('id', $affectedDocumentIds)->get()
                ->each(fn (ResearchDocument $document) => $this->syncDocumentAuthors($document));

            $this->audit->log($actor, 'CLASS_SECTION_MEMBERS_UPDATED', $locked, "Removed a student researcher from class section [{$locked->name}] and its research projects.", $request);

            return $locked;
        });
    }

    public function listDocumentMembers(User $actor, ClassSection $section, ResearchDocument $document): array
    {
        $this->authorizeOwner($actor, $section);
        $this->ensureDocumentInSection($section, $document);

        return $section->documentMembers()
            ->wherePivot('research_document_id', $document->id)
            ->orderBy('last_name')->orderBy('first_name')
            ->withPivot('created_at')
            ->get(['users.id', 'email', 'student_employee_id', 'first_name', 'middle_name', 'last_name'])
            ->map(fn (User $member) => $this->memberPayload($member))
            ->all();
    }

    public function addDocumentMember(User $actor, ClassSection $section, ResearchDocument $document, User $member, ?Request $request = null): void
    {
        DB::transaction(function () use ($actor, $section, $document, $member, $request): void {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            $this->authorizeOwner($actor, $locked);
            $this->ensureDocumentInSection($locked, $document);
            if ($member->role !== 'researcher' || $member->access_status !== 'active') {
                throw $this->notAuthorized('Only active student researchers can be assigned to a research title.');
            }
            $isEnrolled = DB::table('class_section_members')
                ->where('class_section_id', $locked->id)
                ->whereNull('research_document_id')
                ->where('user_id', $member->id)
                ->exists();
            if (! $isEnrolled) {
                throw ValidationException::withMessages([
                    'user_id' => ['Add the student to this section roster before assigning them to a research project.'],
                ]);
            }

            $alreadyAssigned = DB::table('class_section_members')
                ->where('class_section_id', $locked->id)
                ->where('research_document_id', $document->id)
                ->where('user_id', $member->id)
                ->exists();
            $locked->documentMembers()->syncWithoutDetaching([$member->id => ['research_document_id' => $document->id]]);
            $this->syncDocumentAuthors($document);
            if (! $alreadyAssigned) {
                $member->notify(new ResearchActivityNotification(
                    $document,
                    'RESEARCH_PROJECT_MEMBER_ADDED',
                    'Added to a research study',
                    'You were added as a researcher for this study.',
                    '/research/'.$document->id,
                ));
            }
            $this->audit->log($actor, 'RESEARCH_TITLE_MEMBER_UPDATED', $document, 'Added a student researcher to a research title.', $request);
        });
    }

    public function removeDocumentMember(User $actor, ClassSection $section, ResearchDocument $document, User $member, ?Request $request = null): void
    {
        DB::transaction(function () use ($actor, $section, $document, $member, $request): void {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            $this->authorizeOwner($actor, $locked);
            $this->ensureDocumentInSection($locked, $document);
            $locked->documentMembers()->newPivotStatement()
                ->where('class_section_id', $locked->id)
                ->where('research_document_id', $document->id)
                ->where('user_id', $member->id)
                ->delete();
            $this->syncDocumentAuthors($document);
            $member->notify(new ResearchActivityNotification(
                $document,
                'RESEARCH_PROJECT_MEMBER_REMOVED',
                'Research study assignment updated',
                'You were removed from this research study.',
                '/research/'.$document->id,
            ));
            $this->audit->log($actor, 'RESEARCH_TITLE_MEMBER_UPDATED', $document, 'Removed a student researcher from a research title.', $request);
        });
    }

    /** @return list<array<string, mixed>> */
    public function listStudentCandidates(User $actor, ?string $search): array
    {
        $query = User::query()
            ->where('role', 'researcher')
            ->where('access_status', 'active')
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->limit(20);
        if ($search !== null && $search !== '') {
            $like = '%'.$this->escapedLike($search).'%';
            $query->where(function ($builder) use ($like): void {
                foreach (['email', 'student_employee_id', 'first_name', 'middle_name', 'last_name'] as $column) {
                    $builder->orWhereRaw("{$column} LIKE ? ESCAPE '!'", [$like]);
                }
            });
        }

        return $query->get(['id', 'email', 'student_employee_id', 'first_name', 'middle_name', 'last_name'])
            ->map(fn (User $student) => $this->memberPayload($student))
            ->all();
    }

    /** @return array<string, mixed> */
    public function createProject(User $actor, ClassSection $section, string $title, ?Request $request = null): array
    {
        $document = DB::transaction(function () use ($actor, $section, $title, $request): ResearchDocument {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            $this->authorizeOwner($actor, $locked);
            $trimmed = trim($title);
            if ($trimmed === '') {
                throw ValidationException::withMessages(['title' => ['The research title is required.']]);
            }
            $normalized = str($trimmed)->lower()->replaceMatches('/[^a-z0-9]+/', ' ')->trim()->toString();
            if (ResearchDocument::withTrashed()->where('normalized_title', $normalized)->exists()) {
                throw ValidationException::withMessages(['title' => ['A research project with this title already exists.']]);
            }
            $document = ResearchDocument::query()->create([
                'submitted_by' => $actor->id,
                'section_id' => $locked->id,
                'title' => $trimmed,
                'normalized_title' => $normalized,
                'research_stage' => 'title_proposal',
                'submission_status' => 'draft',
                'archive_status' => 'not_archived',
                'visibility' => 'private',
            ]);
            $this->ensureInstructorAssignment($actor, $document);
            $this->audit->log($actor, 'CLASS_SECTION_PROJECT_CREATED', $document, "Created research project [{$trimmed}] in class section [{$locked->name}].", $request);

            return $document;
        });

        return [
            'research_document_id' => $document->id,
            'title' => $document->title,
            'research_stage' => $document->research_stage,
            'submission_status' => $document->submission_status,
            'updated_at' => $document->updated_at?->toISOString(),
        ];
    }

    /** @return array<string, mixed> */
    public function updateProjectTitle(User $actor, ClassSection $section, ResearchDocument $document, string $title, ?Request $request = null): array
    {
        $document = DB::transaction(function () use ($actor, $section, $document, $title, $request): ResearchDocument {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            $this->authorizeOwner($actor, $locked);
            $this->ensureDocumentInSection($locked, $document);
            if ($document->submitted_by !== $actor->id) {
                throw ValidationException::withMessages(['title' => ['Only research projects created by you can be edited.']]);
            }
            $trimmed = trim($title);
            if ($trimmed === '') {
                throw ValidationException::withMessages(['title' => ['The research title is required.']]);
            }
            if ($document->submission_status === 'archived' || $document->archive_status === 'archived') {
                throw ValidationException::withMessages(['title' => ['Archived research projects cannot be renamed.']]);
            }
            $normalized = str($trimmed)->lower()->replaceMatches('/[^a-z0-9]+/', ' ')->trim()->toString();
            $collision = ResearchDocument::withTrashed()
                ->where('normalized_title', $normalized)
                ->whereKeyNot($document->id)
                ->exists();
            if ($collision) {
                throw ValidationException::withMessages(['title' => ['A research project with this title already exists.']]);
            }
            $lockedDocument = ResearchDocument::query()->lockForUpdate()->findOrFail($document->id);
            $lockedDocument->update([
                'title' => $trimmed,
                'normalized_title' => $normalized,
            ]);
            $this->audit->log($actor, 'CLASS_SECTION_PROJECT_TITLE_UPDATED', $lockedDocument, "Renamed research project to [{$trimmed}].", $request);

            return $lockedDocument;
        });

        return [
            'research_document_id' => $document->id,
            'title' => $document->title,
            'research_stage' => $document->research_stage,
            'submission_status' => $document->submission_status,
            'updated_at' => $document->updated_at?->toISOString(),
        ];
    }

    public function deleteProject(User $actor, ClassSection $section, ResearchDocument $document, ?Request $request = null): void
    {
        DB::transaction(function () use ($actor, $section, $document, $request): void {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            $this->authorizeOwner($actor, $locked);
            $lockedDocument = ResearchDocument::query()->lockForUpdate()->findOrFail($document->id);
            $this->ensureDocumentInSection($locked, $lockedDocument);
            if ($lockedDocument->submitted_by !== $actor->id || $lockedDocument->submission_status !== 'draft' || $lockedDocument->research_stage !== 'title_proposal') {
                throw ValidationException::withMessages(['project' => ['Only draft title-proposal projects created by you can be deleted.']]);
            }
            if ($lockedDocument->files()->exists()) {
                throw ValidationException::withMessages(['project' => ['A research project with uploaded files cannot be deleted here.']]);
            }

            // Project members already have a section-level roster row. Remove
            // only the project-specific membership so deleting a title folder
            // cannot create duplicate section roster rows.
            DB::table('class_section_members')->where('research_document_id', $lockedDocument->id)->delete();
            DB::table('research_project_team_members')->where('research_document_id', $lockedDocument->id)->delete();
            if (ReviewAssignment::identityCompatible()) {
                ReviewAssignment::query()->where('research_document_id', $lockedDocument->id)->get()
                    ->each(function (ReviewAssignment $assignment): void {
                        $assignment->is_active = false;
                        if ($assignment->getTable() === 'research_review_assignments') {
                            $assignment->status = 'inactive';
                        }
                        $assignment->save();
                    });
            }
            $this->audit->log($actor, 'CLASS_SECTION_PROJECT_DELETED', $lockedDocument, "Deleted research project [{$lockedDocument->title}] from class section [{$locked->name}].", $request);
            $lockedDocument->deleteOrFail();
        });
    }

    private function syncDocumentAuthors(ResearchDocument $document): void
    {
        if ($document->section_id === null) {
            return;
        }

        $members = DB::table('class_section_members')
            ->join('users', 'users.id', '=', 'class_section_members.user_id')
            ->where('class_section_members.class_section_id', $document->section_id)
            ->where('class_section_members.research_document_id', $document->id)
            ->orderBy('users.last_name')
            ->orderBy('users.first_name')
            ->get([
                'users.id', 'users.email', 'users.first_name', 'users.middle_name', 'users.last_name',
            ]);

        ResearchAuthor::query()->where('research_document_id', $document->id)->delete();
        foreach ($members->values() as $index => $member) {
            $name = trim(implode(' ', array_filter([$member->first_name, $member->middle_name, $member->last_name])));
            ResearchAuthor::query()->create([
                'research_document_id' => $document->id,
                'user_id' => $member->id,
                'author_name' => $name !== '' ? $name : $member->email,
                'author_order' => $index + 1,
                'is_corresponding_author' => $index === 0,
            ]);
        }
    }

    private function ensureInstructorAssignment(User $actor, ResearchDocument $document): void
    {
        if (! ReviewAssignment::identityCompatible()) {
            return;
        }

        $assignment = ReviewAssignment::query()
            ->where('research_document_id', $document->id)
            ->where(ReviewAssignment::column('reviewer_id'), $actor->id)
            ->where(ReviewAssignment::column('review_role'), 'instructor')
            ->first();

        if ($assignment === null) {
            $assignment = new ReviewAssignment;
            $assignment->research_document_id = $document->id;
            $assignment->reviewer_id = $actor->id;
            $assignment->review_role = 'instructor';
            $assignment->assigned_by = $actor->id;
        }
        $assignment->is_active = true;
        if ($assignment->getTable() === 'research_review_assignments') {
            $assignment->status = 'active';
        }
        $assignment->save();
    }

    private function authorizeOwner(User $actor, ClassSection $section): void
    {
        if ($section->instructor_id !== $actor->id && ! DomainAuthorization::isActiveAdministrator($actor)) {
            throw $this->notAuthorized();
        }
    }

    private function ensureDocumentInSection(ClassSection $section, ResearchDocument $document): void
    {
        if ((int) $document->section_id !== (int) $section->id) {
            throw $this->notAuthorized('The research title does not belong to this class section.');
        }
    }

    /** @return array<string, mixed> */
    private function memberPayload(User $member): array
    {
        return [
            'id' => $member->id,
            'email' => $member->email,
            'student_employee_id' => $member->student_employee_id,
            'first_name' => $member->first_name,
            'middle_name' => $member->middle_name,
            'last_name' => $member->last_name,
            'added_at' => $member->pivot?->created_at?->toISOString(),
        ];
    }

    private function escapedLike(string $value): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value);
    }

    private function notAuthorized(string $message = 'The actor is not authorized to manage this class section.'): ValidationException
    {
        return ValidationException::withMessages(['authorization' => [$message]]);
    }
}
