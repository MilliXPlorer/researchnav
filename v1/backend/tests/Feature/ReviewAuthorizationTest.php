<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use App\Services\DomainAuthorization;
use App\Services\ResearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReviewAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_compatibility_roles_do_not_gain_office_privileges(): void
    {
        foreach (['panel', 'statistician', 'coordinator', 'librarian', 'academics'] as $role) {
            $this->assertFalse(DomainAuthorization::isOffice(User::factory()->create(['role' => $role])));
        }

        $this->assertTrue(DomainAuthorization::isOffice(User::factory()->create(['role' => 'research-office'])));
        $this->assertTrue(DomainAuthorization::isOffice(User::factory()->create(['role' => 'admin', 'is_admin' => true])));
    }

    public function test_office_routes_deny_compatibility_roles_despite_canonical_mapping(): void
    {
        foreach (['coordinator', 'academics'] as $role) {
            $user = User::factory()->create(['role' => $role, 'access_status' => 'active']);
            $this->withSession(['user_id' => $user->id])
                ->getJson('/api/office/users')
                ->assertForbidden()
                ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
        }

        $office = User::factory()->create(['role' => 'research-office', 'access_status' => 'active']);
        $this->withSession(['user_id' => $office->id])
            ->getJson('/api/office/users')
            ->assertOk();

        $admin = User::factory()->create(['role' => 'admin', 'is_admin' => true, 'access_status' => 'active']);
        $this->withSession(['user_id' => $admin->id])
            ->getJson('/api/office/users')
            ->assertOk();
    }

    public function test_unassigned_reviewer_cannot_generic_archive_or_access_another_document(): void
    {
        [$owner, $first] = $this->research();
        [, $second] = $this->research();
        $reviewer = User::factory()->create(['role' => 'adviser', 'access_status' => 'active']);
        ReviewAssignment::query()->create([
            'research_document_id' => $first->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => User::factory()->create(['role' => 'research-office'])->id,
            'review_role' => 'adviser',
            'is_active' => true,
        ]);

        $this->withSession(['user_id' => $reviewer->id])
            ->getJson('/api/research/'.$second->id)
            ->assertForbidden();
        $this->withSession(['user_id' => $reviewer->id])
            ->patchJson('/api/research/'.$first->id.'/status', ['submission_status' => 'archived'], ['Origin' => 'http://localhost:5173'])
            ->assertUnprocessable();
        $this->withSession(['user_id' => $reviewer->id])
            ->patchJson('/api/research/'.$first->id, ['visibility' => 'public'], ['Origin' => 'http://localhost:5173'])
            ->assertForbidden();
        $this->withSession(['user_id' => $reviewer->id])
            ->postJson('/api/research/'.$first->id.'/similarity/results', [], ['Origin' => 'http://localhost:5173'])
            ->assertNotFound();
    }

    public function test_owner_cannot_make_draft_public_and_public_authors_hide_internal_ids(): void
    {
        [$owner, $research] = $this->research();
        $this->withSession(['user_id' => $owner->id])
            ->patchJson('/api/research/'.$research->id, ['visibility' => 'public'], ['Origin' => 'http://localhost:5173'])
            ->assertUnprocessable();

        $research->update(['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'public']);
        $this->getJson('/api/repository/'.$research->id)
            ->assertOk()
            ->assertJsonMissingPath('data.authors.0.id')
            ->assertJsonMissingPath('data.authors.0.user_id');
    }

    /** @return array{User, ResearchDocument} */
    private function research(): array
    {
        $owner = User::factory()->create(['access_status' => 'active']);
        $category = Category::query()->create(['name' => 'Category '.fake()->unique()->word(), 'slug' => 'category-'.fake()->unique()->numberBetween(1, 999999)]);
        $research = app(ResearchService::class)->createDraft($owner, [
            'category_id' => $category->id,
            'title' => 'Research '.fake()->unique()->word(),
            'abstract' => 'Abstract',
            'keywords' => 'research',
            'publication_year' => 2025,
            'research_stage' => 'title_proposal',
        ], [['user_id' => $owner->id, 'author_name' => 'Owner']]);

        return [$owner, $research];
    }
}
