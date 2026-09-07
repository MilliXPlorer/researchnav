<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class InstructorSectionMembersTest extends TestCase
{
    use RefreshDatabase;

    public function test_section_members_require_the_matching_active_role_and_section_ownership(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create([
            'instructor_id' => $instructor->id,
            'name' => 'CS-101',
            'academic_year' => '2025-2026',
        ]);
        $other = $this->user(['role' => 'instructor']);

        $this->getJson('/api/instructor/sections/'.$section->id.'/members')
            ->assertUnauthorized()
            ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);
        $this->as($this->user(['role' => 'researcher']))->getJson('/api/instructor/sections/'.$section->id.'/members')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
        $this->as($other)->getJson('/api/instructor/sections/'.$section->id.'/members')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
        $this->as($instructor)->getJson('/api/instructor/sections/'.$section->id.'/members')
            ->assertOk()
            ->assertJsonPath('data', []);
    }

    public function test_students_picker_only_lists_active_researchers_and_respects_search(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $student = $this->user([
            'role' => 'researcher',
            'email' => 'anna.student@example.edu',
            'first_name' => 'Anna',
            'last_name' => 'Student',
            'student_employee_id' => '2023-0455',
        ]);
        $this->user(['role' => 'researcher', 'access_status' => 'invited', 'email' => 'pending@example.edu']);
        $this->user(['role' => 'adviser', 'email' => 'adviser@example.edu']);

        $this->as($instructor)->getJson('/api/instructor/students?search=ann')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.email', 'anna.student@example.edu')
            ->assertJsonPath('data.0.student_employee_id', '2023-0455');
        $this->as($instructor)->getJson('/api/instructor/students?search='.urlencode('2023-0455'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $student->id);
        $this->as($instructor)->getJson('/api/instructor/students')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_instructor_can_add_and_remove_active_researchers_on_their_section(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $section = ClassSection::query()->create([
            'instructor_id' => $instructor->id,
            'name' => 'CS-101',
        ]);
        $student = $this->user(['role' => 'researcher']);
        $blocked = $this->user(['role' => 'researcher', 'access_status' => 'blocked']);

        $this->as($instructor)->putJson('/api/instructor/sections/'.$section->id.'/members', [
            'user_ids' => [$student->id],
        ], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.members_count', 1);
        $this->assertDatabaseHas('class_section_members', [
            'class_section_id' => $section->id,
            'user_id' => $student->id,
        ]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'CLASS_SECTION_MEMBERS_UPDATED']);

        $this->as($instructor)->getJson('/api/instructor/sections/'.$section->id.'/members')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $student->id)
            ->assertJsonPath('data.0.added_at', $section->members()->first()->pivot?->created_at?->toISOString());

        $this->as($instructor)->putJson('/api/instructor/sections/'.$section->id.'/members', [
            'user_ids' => [$student->id],
        ], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.members_count', 1);

        $this->as($instructor)->putJson('/api/instructor/sections/'.$section->id.'/members', [
            'user_ids' => [$blocked->id],
        ], $this->origin())
            ->assertUnprocessable();
        $this->assertDatabaseMissing('class_section_members', [
            'class_section_id' => $section->id,
            'user_id' => $blocked->id,
        ]);

        $this->as($instructor)->putJson('/api/instructor/sections/'.$section->id.'/members', [
            'user_ids' => [(string) Str::uuid()],
        ], $this->origin())
            ->assertStatus(400)
            ->assertJsonPath('error', 'INVALID_REQUEST');

        $this->as($instructor)->deleteJson('/api/instructor/sections/'.$section->id.'/members/'.$student->id, [], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.members_count', 0);
        $this->assertDatabaseMissing('class_section_members', [
            'class_section_id' => $section->id,
            'user_id' => $student->id,
        ]);
    }

    public function test_members_cannot_be_managed_by_another_instructor(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $other = $this->user(['role' => 'instructor']);
        $student = $this->user(['role' => 'researcher']);
        $section = ClassSection::query()->create([
            'instructor_id' => $instructor->id,
            'name' => 'CS-101',
        ]);

        $this->as($other)->putJson('/api/instructor/sections/'.$section->id.'/members', [
            'user_ids' => [$student->id],
        ], $this->origin())
            ->assertForbidden();
        $this->as($other)->deleteJson('/api/instructor/sections/'.$section->id.'/members/'.$student->id, [], $this->origin())
            ->assertForbidden();
        $this->assertDatabaseCount('class_section_members', 0);
    }

    private function user(array $attributes = []): User
    {
        return User::query()->create(array_merge([
            'id' => (string) Str::uuid(),
            'email' => Str::lower(Str::random(16)).'@example.edu',
            'role' => 'researcher',
            'access_status' => 'active',
            'account_status' => 'active',
        ], $attributes));
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
