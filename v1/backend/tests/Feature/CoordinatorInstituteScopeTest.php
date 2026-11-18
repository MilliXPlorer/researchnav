<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\DefenseSchedule;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CoordinatorInstituteScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_coordinator_reads_are_limited_to_the_assigned_institute(): void
    {
        $ics = 'Institute of Computer Studies';
        $ihs = 'Institute of Health Sciences';
        $coordinator = $this->user('coordinator', $ics);
        $visibleInstructor = $this->user('instructor', $ics);
        $hiddenInstructor = $this->user('instructor', $ihs);
        $visible = ResearchDocument::factory()->create(['institute' => $ics, 'submission_status' => 'submitted']);
        $hidden = ResearchDocument::factory()->create(['institute' => $ihs, 'submission_status' => 'submitted']);
        DefenseSchedule::query()->create(['research_document_id' => $visible->id, 'created_by' => $coordinator->id, 'scheduled_at' => now()->addDay(), 'status' => 'scheduled']);
        DefenseSchedule::query()->create(['research_document_id' => $hidden->id, 'created_by' => $coordinator->id, 'scheduled_at' => now()->addDay(), 'status' => 'scheduled']);

        $this->as($coordinator)->getJson('/api/coordinator/instructors')
            ->assertOk()
            ->assertJsonFragment(['email' => $visibleInstructor->email])
            ->assertJsonMissing(['email' => $hiddenInstructor->email]);

        $this->as($coordinator)->getJson('/api/coordinator/reports?institute='.urlencode($ihs))
            ->assertOk()
            ->assertJsonPath('data.filters.institute', $ics)
            ->assertJsonPath('data.counts.submitted', 1)
            ->assertJsonFragment(['id' => $visible->id])
            ->assertJsonMissing(['id' => $hidden->id]);

        $this->as($coordinator)->getJson('/api/coordinator/schedules')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $visible->id);

        $this->as($coordinator)->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('data.sections.0.total', 1)
            ->assertJsonPath('data.sections.3.total', 1);
    }

    public function test_coordinator_without_an_institute_fails_closed(): void
    {
        $coordinator = $this->user('coordinator', null);

        foreach (['/api/dashboard', '/api/coordinator/instructors', '/api/coordinator/sections', '/api/coordinator/program-overview', '/api/coordinator/schedules', '/api/coordinator/adviser-load', '/api/coordinator/duplicate-flags', '/api/coordinator/reports', '/api/coordinator/reports/studies?status=submitted'] as $url) {
            $this->as($coordinator)->getJson($url)
                ->assertForbidden()
                ->assertExactJson(['error' => 'COORDINATOR_INSTITUTE_REQUIRED']);
        }
    }

    public function test_program_overview_and_workflow_studies_use_only_the_coordinator_institute(): void
    {
        $institute = 'Institute of Computer Studies';
        $coordinator = $this->user('coordinator', $institute);
        $this->user('instructor', $institute);
        $this->user('instructor', 'Institute of Health Sciences');
        $visible = ResearchDocument::factory()->create(['institute' => $institute, 'submission_status' => 'submitted', 'title' => 'Visible Study']);
        ResearchDocument::factory()->create(['institute' => 'Institute of Health Sciences', 'submission_status' => 'submitted', 'title' => 'Foreign Study']);
        ResearchDocument::factory()->create(['institute' => null, 'submission_status' => 'submitted', 'title' => 'Legacy Study']);

        $this->as($coordinator)->getJson('/api/coordinator/program-overview')
            ->assertOk()
            ->assertJsonPath('data.institute.name', $institute)
            ->assertJsonPath('data.counts.total_instructors', 1)
            ->assertJsonPath('data.counts.total_studies', 1);

        $this->as($coordinator)->getJson('/api/coordinator/reports/studies?status=submitted&institute='.urlencode('Institute of Health Sciences'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $visible->id)
            ->assertJsonMissing(['title' => 'Foreign Study'])
            ->assertJsonMissing(['title' => 'Legacy Study']);
    }

    public function test_workflow_studies_reject_missing_or_unsupported_statuses(): void
    {
        $coordinator = $this->user('coordinator', 'Institute of Computer Studies');

        $this->as($coordinator)->getJson('/api/coordinator/reports/studies')->assertBadRequest();
        $this->as($coordinator)->getJson('/api/coordinator/reports/studies?status=archived')->assertBadRequest();
    }

    public function test_coordinator_section_list_and_direct_access_are_institute_scoped(): void
    {
        $ics = 'Institute of Computer Studies';
        $ihs = 'Institute of Health Sciences';
        $coordinator = $this->user('coordinator', " {$ics} ");
        $visible = ClassSection::query()->create(['instructor_id' => $this->user('instructor', null)->id, 'institute' => $ics, 'name' => 'ICS 4A']);
        $foreign = ClassSection::query()->create(['instructor_id' => $this->user('instructor', null)->id, 'institute' => $ihs, 'name' => 'IHS 4A']);
        ClassSection::query()->create(['instructor_id' => $this->user('instructor', null)->id, 'institute' => null, 'name' => 'Legacy 4A']);
        ClassSection::query()->create(['instructor_id' => $this->user('instructor', null)->id, 'institute' => $ics, 'name' => 'Inactive 4A', 'is_active' => false]);
        ResearchDocument::factory()->create(['section_id' => $visible->id, 'institute' => $ics]);
        ResearchDocument::factory()->create(['section_id' => $visible->id, 'institute' => $ihs]);

        $this->as($coordinator)->getJson('/api/coordinator/sections?institute='.urlencode($ihs))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $visible->id)
            ->assertJsonPath('data.0.documents_count', 1)
            ->assertJsonMissing(['name' => 'IHS 4A'])
            ->assertJsonMissing(['name' => 'Legacy 4A'])
            ->assertJsonMissing(['name' => 'Inactive 4A']);

        $this->as($coordinator)->getJson('/api/coordinator/sections/'.$visible->id)
            ->assertOk()
            ->assertJsonPath('data.institute', $ics);
        $this->as($coordinator)->getJson('/api/coordinator/sections/'.$foreign->id)->assertNotFound();
    }

    public function test_mismatched_document_institute_does_not_expose_a_foreign_section_or_instructor(): void
    {
        $ics = 'Institute of Computer Studies';
        $ihs = 'Institute of Health Sciences';
        $coordinator = $this->user('coordinator', $ihs);
        $section = ClassSection::query()->create([
            'instructor_id' => $this->user('instructor', $ics)->id,
            'institute' => $ics,
            'name' => 'ICS 4A',
        ]);
        ResearchDocument::factory()->create(['section_id' => $section->id, 'institute' => $ihs]);

        $this->as($coordinator)->getJson('/api/coordinator/reports')
            ->assertOk()
            ->assertJsonMissing(['name' => 'ICS 4A']);
    }

    public function test_blank_coordinator_institute_cannot_list_or_directly_access_sections(): void
    {
        $section = ClassSection::query()->create(['instructor_id' => $this->user('instructor', null)->id, 'institute' => 'Institute of Computer Studies', 'name' => 'ICS 4A']);

        foreach ([null, '   '] as $institute) {
            $coordinator = $this->user('coordinator', $institute);
            $this->as($coordinator)->getJson('/api/coordinator/sections')->assertForbidden();
            $this->as($coordinator)->getJson('/api/coordinator/sections/'.$section->id)->assertForbidden();
        }
    }

    public function test_authoritative_admin_keeps_global_active_section_access(): void
    {
        $admin = $this->user('admin', null);
        $admin->forceFill(['is_admin' => true])->save();
        $first = ClassSection::query()->create(['instructor_id' => $this->user('instructor', null)->id, 'institute' => 'Institute A', 'name' => 'A']);
        $second = ClassSection::query()->create(['instructor_id' => $this->user('instructor', null)->id, 'institute' => null, 'name' => 'B']);

        $this->as($admin)->getJson('/api/coordinator/sections')->assertOk()->assertJsonCount(2, 'data');
        $this->as($admin)->getJson('/api/coordinator/sections/'.$first->id)->assertOk();
        $this->as($admin)->getJson('/api/coordinator/sections/'.$second->id)->assertOk();
    }

    public function test_coordinator_pdf_uses_the_selected_section_and_includes_all_instructor_studies(): void
    {
        $institute = 'Institute of Computer Studies';
        $coordinator = $this->user('coordinator', $institute);
        $instructor = $this->user('instructor', $institute);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'ICS 4A']);
        ResearchDocument::factory()->create(['institute' => $institute, 'section_id' => $section->id, 'title' => 'First Scoped Study']);
        ResearchDocument::factory()->create(['institute' => $institute, 'section_id' => $section->id, 'title' => 'Second Scoped Study']);

        $response = $this->as($coordinator)->get('/api/coordinator/reports/instructors/pdf');

        $response->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->assertStringStartsWith('%PDF', $response->getContent());
        $this->as($coordinator)->get('/api/coordinator/reports/unknown/pdf')->assertNotFound();
    }

    public function test_non_authoritative_admin_cannot_access_coordinator_schedules(): void
    {
        $rawAdmin = $this->user('admin', null);
        $rawAdmin->forceFill(['is_admin' => false])->save();

        $this->as($rawAdmin)->getJson('/api/coordinator/schedules')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
    }

    public function test_authoritative_admin_keeps_global_schedule_access(): void
    {
        $admin = $this->user('admin', null);
        $admin->forceFill(['is_admin' => true])->save();
        foreach (['Institute of Computer Studies', 'Institute of Health Sciences'] as $institute) {
            $document = ResearchDocument::factory()->create(['institute' => $institute]);
            DefenseSchedule::query()->create(['research_document_id' => $document->id, 'created_by' => $admin->id, 'scheduled_at' => now()->addDay(), 'status' => 'scheduled']);
        }

        $this->as($admin)->getJson('/api/coordinator/schedules')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_coordinator_report_does_not_expose_foreign_sections(): void
    {
        $institute = 'Institute of Computer Studies';
        $coordinator = $this->user('coordinator', $institute);
        $visibleSection = ClassSection::query()->create(['instructor_id' => $this->user('instructor', $institute)->id, 'institute' => $institute, 'name' => 'ICS 4A']);
        $foreignSection = ClassSection::query()->create(['instructor_id' => $this->user('instructor', 'Institute of Health Sciences')->id, 'institute' => 'Institute of Health Sciences', 'name' => 'IHS 4A']);
        ResearchDocument::factory()->create(['institute' => $institute, 'section_id' => $visibleSection->id]);
        ResearchDocument::factory()->create(['institute' => 'Institute of Health Sciences', 'section_id' => $foreignSection->id]);

        $this->as($coordinator)->getJson('/api/coordinator/reports')
            ->assertOk()
            ->assertJsonFragment(['id' => $visibleSection->id, 'name' => 'ICS 4A'])
            ->assertJsonMissing(['id' => $foreignSection->id])
            ->assertJsonMissing(['name' => 'IHS 4A']);
    }

    private function user(string $role, ?string $institute): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'email' => Str::lower(Str::random(14)).'@example.edu',
            'role' => $role,
            'access_status' => 'active',
            'institute' => $institute,
        ]);
    }

    private function as(User $user): static
    {
        return $this->withSession(['user_id' => $user->id]);
    }
}
