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

        foreach (['/api/dashboard', '/api/coordinator/instructors', '/api/coordinator/schedules', '/api/coordinator/adviser-load', '/api/coordinator/duplicate-flags', '/api/coordinator/reports'] as $url) {
            $this->as($coordinator)->getJson($url)
                ->assertForbidden()
                ->assertExactJson(['error' => 'COORDINATOR_INSTITUTE_REQUIRED']);
        }
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
        $visibleSection = ClassSection::query()->create(['instructor_id' => $this->user('instructor', $institute)->id, 'name' => 'ICS 4A']);
        $foreignSection = ClassSection::query()->create(['instructor_id' => $this->user('instructor', 'Institute of Health Sciences')->id, 'name' => 'IHS 4A']);
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
