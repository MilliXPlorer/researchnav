<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class RoleAccessMatrixTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, list<string>> */
    private function roleRoutes(): array
    {
        return [
            'adviser' => ['/api/adviser/advisees'],
            'instructor' => ['/api/instructor/sections'],
            'panel' => ['/api/panel/assignments'],
            'statistician' => ['/api/statistician/queue'],
            'coordinator' => ['/api/coordinator/schedules', '/api/coordinator/adviser-load', '/api/coordinator/duplicate-flags', '/api/coordinator/reports'],
            'librarian' => ['/api/librarian/archiving-queue'],
            'research-office' => ['/api/office/compliance', '/api/office/users', '/api/office/reports'],
            'academics' => ['/api/academics/library'],
            'admin' => ['/api/admin/system-status', '/api/admin/users', '/api/admin/audit-logs'],
        ];
    }

    private function allowedGroups(string $role): array
    {
        $allowed = [$role];
        if ($role === 'admin') {
            $allowed[] = 'coordinator';
            $allowed[] = 'research-office';
        }

        // Canonical mapping never grants authority: coordinator/academics map
        // to research_office for identity only.
        return $allowed;
    }

    public function test_guests_are_denied_every_authenticated_route_and_served_the_public_repository(): void
    {
        foreach ($this->roleRoutes() as $paths) {
            foreach ($paths as $path) {
                $this->getJson($path)
                    ->assertUnauthorized()
                    ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);
            }
        }

        $this->getJson('/api/repository')->assertOk();
    }

    public function test_non_active_accounts_are_denied_even_on_their_own_role_workspace(): void
    {
        foreach ($this->roleRoutes() as $role => $paths) {
            foreach (['pending', 'suspended', 'inactive'] as $accountStatus) {
                $user = $this->user(['role' => $role, 'access_status' => 'active']);
                $user->forceFill(['account_status' => $accountStatus])->save();
                foreach ($paths as $path) {
                    $this->as($user)->getJson($path)
                        ->assertForbidden()
                        ->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);
                }
            }
        }
    }

    public function test_every_role_is_denied_every_foreign_role_workspace(): void
    {
        $roles = array_keys($this->roleRoutes());
        foreach ($roles as $actorRole) {
            $actor = $this->user(['role' => $actorRole]);
            $denied = $this->allowedGroups($actorRole);

            foreach ($roles as $targetRole) {
                if (in_array($targetRole, $denied, true)) {
                    continue;
                }

                foreach ($this->roleRoutes()[$targetRole] as $path) {
                    $this->as($actor)->getJson($path)
                        ->assertForbidden()
                        ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
                }
            }
        }
    }

    public function test_compatibility_roles_are_denied_office_authority_but_keep_their_workspace(): void
    {
        $coordinator = $this->user(['role' => 'coordinator']);
        $this->as($coordinator)->getJson('/api/office/users')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
        $this->as($coordinator)->getJson('/api/coordinator/schedules')->assertOk();

        $academics = $this->user(['role' => 'academics']);
        $this->as($academics)->getJson('/api/office/reports')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
        $this->as($academics)->getJson('/api/academics/library')->assertOk();

        $office = $this->user(['role' => 'research-office']);
        $this->as($office)->getJson('/api/office/compliance')->assertOk();
        $this->as($office)->getJson('/api/coordinator/schedules')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
    }

    public function test_cross_document_idor_is_denied_for_owners_files_feedback_and_similarity(): void
    {
        [$owner, $research] = $this->research();
        $intruder = $this->user(['role' => 'researcher']);

        $this->as($intruder)->getJson('/api/research/'.$research->id)->assertForbidden();
        $this->as($intruder)->patchJson('/api/research/'.$research->id, ['title' => 'Hijacked'], $this->origin())
            ->assertForbidden();
        $this->as($intruder)->getJson('/api/research/'.$research->id.'/files')->assertForbidden();
        $this->as($intruder)->getJson('/api/research/'.$research->id.'/feedback')->assertForbidden();
        $this->as($intruder)->getJson('/api/research/'.$research->id.'/similarity')->assertForbidden();
        $this->as($intruder)->call('POST', '/api/research/'.$research->id.'/similarity/check', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ORIGIN' => 'http://localhost:5173',
        ], '{}')->assertForbidden();

        $this->as($owner)->getJson('/api/research/'.$research->id)->assertOk();
    }

    public function test_owners_cannot_self_approve_or_self_review(): void
    {
        [$owner, $research] = $this->research();
        $research->update(['submission_status' => 'submitted']);

        $this->as($owner)->patchJson('/api/research/'.$research->id.'/status', ['submission_status' => 'approved'], $this->origin())
            ->assertForbidden();
        $this->as($owner)->patchJson('/api/research/'.$research->id.'/status', ['submission_status' => 'under_review'], $this->origin())
            ->assertForbidden();
    }

    public function test_review_is_assignment_scoped_for_adviser_instructor_panel_and_statistician(): void
    {
        [$owner, $research] = $this->research();
        $research->update(['submission_status' => 'submitted']);

        $unassigned = $this->user(['role' => 'adviser']);
        $this->as($unassigned)->getJson('/api/research/'.$research->id)->assertForbidden();

        $reviewer = $this->user(['role' => 'adviser']);
        ReviewAssignment::query()->create([
            'research_document_id' => $research->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => $this->user(['role' => 'research-office'])->id,
            'review_role' => 'adviser',
            'is_active' => true,
        ]);
        $this->as($reviewer)->getJson('/api/research/'.$research->id)->assertOk();
        $this->as($owner)->getJson('/api/research/'.$research->id.'/monitoring')->assertOk();
    }

    public function test_public_repository_never_exposes_non_public_or_deleted_records(): void
    {
        [$owner, $privateDraft] = $this->research();
        $public = $this->research()[1];
        $public->update(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);

        $underReview = $this->research()[1];
        $underReview->update(['submission_status' => 'under_review']);

        $approvedPrivate = $this->research()[1];
        $approvedPrivate->update(['submission_status' => 'approved', 'visibility' => 'private']);

        $registeredOnly = $this->research()[1];
        $registeredOnly->update(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'registered_only']);

        $deleted = $this->research()[1];
        $deleted->update(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $deleted->delete();

        $this->getJson('/api/repository')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $public->id);
    }

    /** @param array<string, mixed> $attributes */
    private function user(array $attributes = []): User
    {
        return User::query()->create(array_merge([
            'id' => (string) Str::uuid(),
            'email' => Str::lower(Str::random(16)).'@example.edu',
            'role' => 'researcher',
            'access_status' => 'active',
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

    /** @return array{User, ResearchDocument} */
    private function research(): array
    {
        $owner = $this->user(['role' => 'researcher']);
        $category = Category::query()->create(['name' => 'Category '.Str::random(8), 'slug' => 'category-'.Str::random(8)]);

        return [$owner, ResearchDocument::query()->create([
            'submitted_by' => $owner->id,
            'category_id' => $category->id,
            'title' => 'Research '.Str::random(10),
            'abstract' => 'Abstract '.Str::random(10),
            'keywords' => 'research',
            'publication_year' => 2025,
            'research_stage' => 'title_proposal',
        ])];
    }
}
