<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\ResearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ClassSectionInstituteReassignmentTest extends TestCase
{
    use RefreshDatabase;

    private const ICS = 'Institute of Computer Studies';

    private const IHS = 'Institute of Health Sciences';

    public function test_reassignment_updates_section_and_all_children_when_programs_are_compatible(): void
    {
        [$instructor, $section] = $this->section();
        $active = $this->document($section, ['degree_program' => 'Bachelor of Science in Midwifery']);
        $deleted = $this->document($section, ['degree_program' => 'Bachelor of Science in Midwifery']);
        $deleted->delete();

        $this->changeInstitute($instructor, $section, self::IHS)->assertOk();

        $this->assertSame(self::IHS, $section->fresh()->institute);
        $this->assertSame(self::IHS, $active->fresh()->institute);
        $this->assertSame(self::IHS, ResearchDocument::withTrashed()->findOrFail($deleted->id)->institute);
    }

    public function test_reassignment_allows_blank_programs_without_modifying_them(): void
    {
        [$instructor, $section] = $this->section();
        $nullProgram = $this->document($section, ['degree_program' => null]);
        $blankProgram = $this->document($section, ['degree_program' => '']);

        $this->changeInstitute($instructor, $section, self::IHS)->assertOk();

        $this->assertNull($nullProgram->fresh()->degree_program);
        $this->assertSame('', $blankProgram->fresh()->degree_program);
        $this->assertSame(self::IHS, $blankProgram->fresh()->institute);
    }

    public function test_reassignment_rejects_an_incompatible_active_child_and_rolls_back_every_change(): void
    {
        [$instructor, $section] = $this->section();
        $compatible = $this->document($section, ['title' => 'Compatible Study', 'degree_program' => 'Bachelor of Science in Midwifery']);
        $incompatible = $this->document($section, ['title' => 'Computer Science Study', 'degree_program' => 'Bachelor of Science in Computer Science']);

        $this->changeInstitute($instructor, $section, self::IHS, [
            'name' => 'Changed name',
            'section_code' => 'B-2',
            'academic_year' => '2026-2027',
        ])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'VALIDATION_FAILED')
            ->assertJsonPath('errors.institute.0', 'The institute cannot be changed because these studies have incompatible degree programs: Computer Science Study.');

        $this->assertSame('Section A', $section->fresh()->name);
        $this->assertSame('A-1', $section->fresh()->section_code);
        $this->assertNull($section->fresh()->academic_year);
        $this->assertSame(self::ICS, $section->fresh()->institute);
        $this->assertSame(self::ICS, $compatible->fresh()->institute);
        $this->assertSame(self::ICS, $incompatible->fresh()->institute);
    }

    public function test_create_and_update_reject_institutes_outside_the_server_catalog(): void
    {
        [$instructor, $section] = $this->section();

        $this->as($instructor)->postJson('/api/instructor/sections', [
            'name' => 'Unknown Institute Section',
            'section_code' => 'U-1',
            'institute' => 'Arbitrary Institute',
        ], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('institute');
        $this->changeInstitute($instructor, $section, 'Arbitrary Institute')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('institute');

        $this->assertSame(self::ICS, $section->fresh()->institute);
        $this->assertDatabaseMissing('class_sections', ['name' => 'Unknown Institute Section']);
    }

    public function test_catalog_input_is_stored_using_its_canonical_name(): void
    {
        [$instructor, $section] = $this->section();

        $this->changeInstitute($instructor, $section, strtolower(self::IHS))->assertOk();

        $this->assertSame(self::IHS, $section->fresh()->institute);
    }

    public function test_reassignment_rejects_an_incompatible_soft_deleted_child(): void
    {
        [$instructor, $section] = $this->section();
        $deleted = $this->document($section, ['title' => 'Deleted Computer Study', 'degree_program' => 'Bachelor of Science in Computer Science']);
        $deleted->delete();

        $this->changeInstitute($instructor, $section, self::IHS)
            ->assertUnprocessable()
            ->assertJsonPath('errors.institute.0', 'The institute cannot be changed because these studies have incompatible degree programs: Deleted Computer Study.');

        $this->assertSame(self::ICS, $section->fresh()->institute);
        $this->assertSame(self::ICS, ResearchDocument::withTrashed()->findOrFail($deleted->id)->institute);
    }

    public function test_coordinator_visibility_moves_only_after_successful_reassignment(): void
    {
        [$instructor, $section] = $this->section();
        $oldCoordinator = $this->user('coordinator', self::ICS);
        $newCoordinator = $this->user('coordinator', self::IHS);
        $document = $this->document($section, ['degree_program' => 'Bachelor of Science in Computer Science']);

        $this->assertSectionVisible($oldCoordinator, $section, true);
        $this->assertSectionVisible($newCoordinator, $section, false);
        $this->changeInstitute($instructor, $section, self::IHS)->assertUnprocessable();
        $this->assertSectionVisible($oldCoordinator, $section, true);
        $this->assertSectionVisible($newCoordinator, $section, false);

        $document->update(['degree_program' => 'Bachelor of Science in Midwifery']);
        $this->changeInstitute($instructor, $section, self::IHS)->assertOk();
        $this->assertSectionVisible($oldCoordinator, $section, false);
        $this->assertSectionVisible($newCoordinator, $section, true);
    }

    public function test_research_service_enforces_section_institute_and_degree_program_without_side_effects(): void
    {
        $actor = $this->user('researcher', null);
        [, $section] = $this->section();
        $document = $this->document($section, [
            'submitted_by' => $actor->id,
            'degree_program' => 'Bachelor of Science in Computer Science',
        ]);
        DB::table('class_section_members')->insert([
            'class_section_id' => $section->id,
            'research_document_id' => $document->id,
            'user_id' => $actor->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $service = app(ResearchService::class);

        try {
            $service->update($actor, $document, ['institute' => self::IHS]);
            $this->fail('A section-bound document accepted a conflicting institute.');
        } catch (ValidationException $exception) {
            $this->assertSame(['The research institute must match its class section.'], $exception->errors()['institute']);
        }

        $this->assertSame(self::ICS, $document->fresh()->institute);
        $this->assertDatabaseCount('audit_logs', 0);
        $this->assertDatabaseCount('monitoring_logs', 0);

        $matching = $service->update($actor, $document, [
            'institute' => self::ICS,
            'title' => 'Matching Institute Update',
        ]);
        $this->assertSame(self::ICS, $matching->institute);
        $this->assertSame('Matching Institute Update', $matching->title);

        $omittedInstitute = $service->update($actor, $document, ['title' => 'Omitted Institute Update']);
        $this->assertSame(self::ICS, $omittedInstitute->institute);
        $this->assertSame('Omitted Institute Update', $omittedInstitute->title);

        try {
            $service->update($actor, $document, ['degree_program' => 'Bachelor of Science in Midwifery']);
            $this->fail('A section-bound document accepted an incompatible degree program.');
        } catch (ValidationException $exception) {
            $this->assertSame(['Select a program offered by the chosen institute.'], $exception->errors()['degree_program']);
        }

        $this->assertSame('Bachelor of Science in Computer Science', $document->fresh()->degree_program);
        $this->assertDatabaseCount('audit_logs', 2);
        $this->assertDatabaseCount('monitoring_logs', 2);
    }

    public function test_research_service_allows_an_authorized_standalone_document_update(): void
    {
        $administrator = $this->user('admin', null);
        $document = ResearchDocument::factory()->create([
            'submitted_by' => $administrator->id,
            'institute' => self::ICS,
            'degree_program' => 'Bachelor of Science in Computer Science',
        ]);

        $updated = app(ResearchService::class)->update($administrator, $document, [
            'institute' => self::IHS,
            'degree_program' => 'Bachelor of Science in Midwifery',
        ]);

        $this->assertNull($updated->section_id);
        $this->assertSame(self::IHS, $updated->institute);
        $this->assertSame('Bachelor of Science in Midwifery', $updated->degree_program);
    }

    private function section(): array
    {
        $instructor = $this->user('instructor', null);
        $section = ClassSection::query()->create([
            'instructor_id' => $instructor->id,
            'institute' => self::ICS,
            'name' => 'Section A',
            'section_code' => 'A-1',
            'is_active' => true,
        ]);

        return [$instructor, $section];
    }

    private function document(ClassSection $section, array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create(array_merge([
            'section_id' => $section->id,
            'institute' => self::ICS,
        ], $attributes));
    }

    private function changeInstitute(User $instructor, ClassSection $section, string $institute, array $attributes = [])
    {
        return $this->as($instructor)->patchJson('/api/instructor/sections/'.$section->id, array_merge([
            'institute' => $institute,
        ], $attributes), $this->origin());
    }

    private function assertSectionVisible(User $coordinator, ClassSection $section, bool $visible): void
    {
        $response = $this->as($coordinator)->getJson('/api/coordinator/sections');
        $visible
            ? $response->assertOk()->assertJsonFragment(['id' => $section->id])
            : $response->assertOk()->assertJsonMissing(['id' => $section->id]);
    }

    private function user(string $role, ?string $institute): User
    {
        return User::factory()->create([
            'id' => (string) Str::uuid(),
            'role' => $role,
            'institute' => $institute,
            'access_status' => 'active',
        ]);
    }

    private function as(User $user): static
    {
        return $this->withSession(['user_id' => $user->id]);
    }

    /** @return array<string, string> */
    private function origin(): array
    {
        return ['Origin' => 'http://localhost:5173'];
    }
}
