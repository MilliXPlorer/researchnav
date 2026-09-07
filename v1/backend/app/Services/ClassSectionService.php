<?php

namespace App\Services;

use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\User;
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
            ->withCount(['researchDocuments', 'members'])
            ->get()
            ->map(fn (ClassSection $section) => [
                'id' => $section->id,
                'name' => $section->name,
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
                'academic_year' => array_key_exists('academic_year', $data) ? $data['academic_year'] : $locked->academic_year,
                'is_active' => $data['is_active'] ?? $locked->is_active,
            ]);
            $this->audit->log($actor, 'CLASS_SECTION_UPDATED', $locked, "Updated class section [{$locked->name}].", $request);

            return $locked;
        });
    }

    public function assignDocuments(User $actor, ClassSection $section, array $researchDocumentIds, ?Request $request = null): ClassSection
    {
        return DB::transaction(function () use ($actor, $section, $researchDocumentIds, $request): ClassSection {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            if ($locked->instructor_id !== $actor->id && ! DomainAuthorization::isActiveAdministrator($actor)) {
                throw $this->notAuthorized();
            }
            $documents = ResearchDocument::query()
                ->whereIn('id', $researchDocumentIds)
                ->where(function ($query) use ($actor): void {
                    $query->where('submitted_by', $actor->id)
                        ->orWhereHas('reviewAssignments', fn ($assignments) => $assignments
                            ->where('reviewer_id', $actor->id)
                            ->where('review_role', $actor->role)
                            ->where('is_active', true));
                })
                ->get();
            if ($documents->count() !== count(array_unique($researchDocumentIds))) {
                throw ValidationException::withMessages(['research_document_ids' => ['Only research you supervise may be assigned to your sections.']]);
            }
            ResearchDocument::query()->whereIn('id', $researchDocumentIds)->update(['section_id' => $locked->id]);
            $this->audit->log($actor, 'CLASS_SECTION_DOCUMENTS_UPDATED', $locked, 'Assigned research documents to the class section.', $request);

            return $locked->load('researchDocuments');
        });
    }

    /** @return list<array<string, mixed>> */
    public function listAssignableDocuments(User $actor, ClassSection $section): array
    {
        $this->authorizeOwner($actor, $section);

        return ResearchDocument::query()
            ->where(function ($query) use ($actor, $section): void {
                $query->whereHas('reviewAssignments', fn ($assignments) => $assignments
                    ->where('reviewer_id', $actor->id)
                    ->where('review_role', 'instructor')
                    ->where('is_active', true))
                    ->orWhereIn('submitted_by', $section->members()->select('users.id'));
            })
            ->whereIn('submission_status', ['submitted', 'under_review', 'revision_required', 'approved', 'archived'])
            ->orderByDesc('updated_at')
            ->get(['id', 'title', 'research_stage', 'submission_status', 'updated_at'])
            ->map(fn (ResearchDocument $document) => [
                'research_document_id' => $document->id,
                'title' => $document->title,
                'research_stage' => $document->research_stage,
                'submission_status' => $document->submission_status,
                'updated_at' => $document->updated_at?->toISOString(),
            ])
            ->all();
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
            ->map(fn (User $member) => $this->memberPayload($member))
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
            $existing = $locked->members()->whereIn('user_id', $uniqueIds)->pluck('class_section_members.user_id')->map(fn ($id) => (string) $id)->all();
            $locked->members()->syncWithoutDetaching(
                $students->pluck('id')->map(fn ($id) => (string) $id)->diff($existing)->all(),
            );
            $this->audit->log($actor, 'CLASS_SECTION_MEMBERS_UPDATED', $locked, "Added student researchers to class section [{$locked->name}].", $request);

            return $locked;
        });
    }

    public function removeMember(User $actor, ClassSection $section, User $member, ?Request $request = null): ClassSection
    {
        return DB::transaction(function () use ($actor, $section, $member, $request): ClassSection {
            $locked = ClassSection::query()->whereKey($section->id)->lockForUpdate()->firstOrFail();
            $this->authorizeOwner($actor, $locked);
            $locked->members()->detach($member->id);
            $this->audit->log($actor, 'CLASS_SECTION_MEMBERS_UPDATED', $locked, "Removed a student researcher from class section [{$locked->name}].", $request);

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
            $locked->documentMembers()->syncWithoutDetaching([$member->id => ['research_document_id' => $document->id]]);
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
