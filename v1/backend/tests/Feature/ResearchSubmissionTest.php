<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ResearchSubmissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_update_editable_metadata_and_authors_on_their_draft(): void
    {
        $owner = User::factory()->create();
        $originalCategory = Category::query()->create(['name' => 'Education', 'slug' => 'education']);
        $updatedCategory = Category::query()->create(['name' => 'Information Systems', 'slug' => 'information-systems']);
        $draft = ResearchDocument::factory()->create([
            'submitted_by' => $owner->id,
            'category_id' => $originalCategory->id,
            'title' => 'Original title',
            'abstract' => 'Original abstract.',
            'keywords' => 'original',
            'publication_year' => 2025,
            'research_stage' => 'title_proposal',
        ]);
        ResearchAuthor::factory()->create([
            'research_document_id' => $draft->id,
            'author_name' => 'Original Author',
        ]);

        $this->as($owner)->patchJson('/api/research/'.$draft->id, [
            'category_id' => $updatedCategory->id,
            'title' => 'Updated owner study',
            'abstract' => 'The researcher updated this abstract.',
            'keywords' => 'repository, ownership, editing',
            'publication_year' => 2026,
            'research_stage' => 'ongoing',
            'authors' => [
                [
                    'user_id' => $owner->id,
                    'author_name' => 'Research Owner',
                    'is_corresponding_author' => true,
                ],
                [
                    'user_id' => null,
                    'author_name' => 'Research Collaborator',
                    'is_corresponding_author' => false,
                ],
            ],
        ], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.abstract', 'The researcher updated this abstract.')
            ->assertJsonPath('data.keywords', 'repository, ownership, editing')
            ->assertJsonPath('data.publication_year', 2026)
            ->assertJsonPath('data.research_stage', 'ongoing')
            ->assertJsonPath('data.category.id', $updatedCategory->id)
            ->assertJsonPath('data.authors.0.author_name', 'Research Owner')
            ->assertJsonPath('data.authors.1.author_name', 'Research Collaborator');

        $draft->refresh();
        $this->assertSame('Updated owner study', $draft->title);
        $this->assertSame('updated owner study', $draft->normalized_title);
        $this->assertSame('The researcher updated this abstract.', $draft->abstract);
        $this->assertSame('repository, ownership, editing', $draft->keywords);
        $this->assertSame(2026, $draft->publication_year);
        $this->assertSame('ongoing', $draft->research_stage);
        $this->assertSame($updatedCategory->id, $draft->category_id);
        $this->assertSame('draft', $draft->submission_status);
        $this->assertSame('private', $draft->visibility);
        $this->assertDatabaseMissing('research_authors', [
            'research_document_id' => $draft->id,
            'author_name' => 'Original Author',
        ]);
        $this->assertDatabaseHas('research_authors', [
            'research_document_id' => $draft->id,
            'user_id' => $owner->id,
            'author_name' => 'Research Owner',
            'author_order' => 1,
            'is_corresponding_author' => true,
        ]);
        $this->assertDatabaseHas('research_authors', [
            'research_document_id' => $draft->id,
            'author_name' => 'Research Collaborator',
            'author_order' => 2,
            'is_corresponding_author' => false,
        ]);
        $this->assertDatabaseHas('monitoring_logs', [
            'research_document_id' => $draft->id,
            'performed_by' => $owner->id,
            'activity_type' => 'RESEARCH_UPDATED',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'entity_id' => (string) $draft->id,
            'user_id' => $owner->id,
            'action' => 'RESEARCH_UPDATED',
        ]);
    }

    public function test_owner_can_update_the_abstract_when_revision_is_required(): void
    {
        $owner = User::factory()->create();
        $research = ResearchDocument::factory()->create([
            'submitted_by' => $owner->id,
            'submission_status' => 'revision_required',
            'abstract' => 'Abstract before revision.',
        ]);

        $this->as($owner)->patchJson('/api/research/'.$research->id, [
            'abstract' => 'Revised abstract responding to reviewer feedback.',
        ], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.abstract', 'Revised abstract responding to reviewer feedback.')
            ->assertJsonPath('data.submission_status', 'revision_required');

        $this->assertDatabaseHas('research_documents', [
            'id' => $research->id,
            'submitted_by' => $owner->id,
            'abstract' => 'Revised abstract responding to reviewer feedback.',
            'submission_status' => 'revision_required',
        ]);
    }

    public function test_owner_cannot_edit_studies_in_locked_workflow_states(): void
    {
        $owner = User::factory()->create();

        foreach (['submitted', 'under_review', 'approved', 'archived'] as $status) {
            $research = ResearchDocument::factory()->create([
                'submitted_by' => $owner->id,
                'submission_status' => $status,
                'archive_status' => $status === 'archived' ? 'archived' : 'not_archived',
                'abstract' => 'Locked abstract.',
            ]);

            $this->as($owner)->patchJson('/api/research/'.$research->id, [
                'abstract' => 'This must not be saved.',
            ], $this->origin())->assertForbidden();

            $this->assertSame('Locked abstract.', $research->refresh()->abstract);
        }
    }

    public function test_disabled_researcher_role_revokes_owner_edit_access(): void
    {
        $owner = User::factory()->create();
        $research = ResearchDocument::factory()->create([
            'submitted_by' => $owner->id,
            'abstract' => 'Protected abstract.',
        ]);
        UserRole::query()->where('slug', UserRole::RESEARCHER)->update(['is_active' => false]);

        $this->as($owner)->patchJson('/api/research/'.$research->id, [
            'abstract' => 'This must not be saved.',
        ], $this->origin())->assertForbidden();

        $this->assertSame('Protected abstract.', $research->refresh()->abstract);
    }

    public function test_foreign_user_is_denied_before_update_field_validation(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $research = ResearchDocument::factory()->create([
            'submitted_by' => $owner->id,
            'abstract' => 'Owner abstract.',
        ]);

        $this->as($intruder)->patchJson('/api/research/'.$research->id, [
            'category_id' => 999999,
            'abstract' => 'Intruder abstract.',
            'authors' => [['user_id' => 'not-a-uuid', 'author_name' => 'Intruder']],
        ], $this->origin())
            ->assertForbidden()
            ->assertJsonMissingValidationErrors(['category_id', 'authors.0.user_id']);

        $this->assertSame('Owner abstract.', $research->refresh()->abstract);
    }

    public function test_owner_cannot_submit_a_draft_missing_required_metadata_and_authors(): void
    {
        $owner = User::factory()->create();
        $draft = ResearchDocument::factory()->create([
            'submitted_by' => $owner->id,
            'category_id' => null,
            'title' => '   ',
        ]);

        $this->as($owner)->postJson('/api/research/'.$draft->id.'/submit', [], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['title', 'category_id', 'authors']);

        $this->assertSame('draft', $draft->refresh()->submission_status);
        $this->assertNull($draft->submitted_at);
    }

    public function test_owner_cannot_submit_with_an_inactive_category(): void
    {
        $owner = User::factory()->create();
        $category = Category::query()->create(['name' => 'Inactive', 'slug' => 'inactive', 'is_active' => false]);
        $draft = ResearchDocument::factory()->create(['submitted_by' => $owner->id, 'category_id' => $category->id]);
        ResearchAuthor::factory()->create(['research_document_id' => $draft->id]);

        $this->as($owner)->postJson('/api/research/'.$draft->id.'/submit', [], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['category_id']);
    }

    public function test_complete_draft_is_submitted_and_records_activity(): void
    {
        $owner = User::factory()->create();
        $category = Category::query()->create(['name' => 'Education', 'slug' => 'education']);
        $draft = ResearchDocument::factory()->create(['submitted_by' => $owner->id, 'category_id' => $category->id]);
        ResearchAuthor::factory()->create(['research_document_id' => $draft->id, 'user_id' => $owner->id]);

        $this->as($owner)->postJson('/api/research/'.$draft->id.'/submit', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.submission_status', 'submitted');

        $this->assertNotNull($draft->refresh()->submitted_at);
        $this->assertDatabaseHas('monitoring_logs', ['research_document_id' => $draft->id, 'activity_type' => 'RESEARCH_SUBMITTED']);
        $this->assertDatabaseHas('audit_logs', ['entity_id' => (string) $draft->id, 'action' => 'RESEARCH_SUBMITTED']);
        $this->assertDatabaseCount('notifications', 1);
    }

    public function test_foreign_user_is_denied_before_draft_completeness_is_disclosed(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $draft = ResearchDocument::factory()->create(['submitted_by' => $owner->id, 'category_id' => null]);

        $this->as($intruder)->postJson('/api/research/'.$draft->id.'/submit', [], $this->origin())
            ->assertForbidden()
            ->assertJsonMissingValidationErrors(['category_id', 'authors']);
    }

    public function test_linked_co_researcher_can_view_and_edit_an_editable_research_record(): void
    {
        $owner = User::factory()->create();
        $coResearcher = User::factory()->create();
        $intruder = User::factory()->create();
        $draft = ResearchDocument::factory()->create(['submitted_by' => $owner->id]);
        ResearchAuthor::factory()->create([
            'research_document_id' => $draft->id,
            'user_id' => $coResearcher->id,
            'author_name' => 'Linked Co Researcher',
        ]);

        $this->as($coResearcher)->getJson('/api/research?mine=1')
            ->assertOk()
            ->assertJsonPath('data.0.id', $draft->id);
        $this->as($coResearcher)->patchJson('/api/research/'.$draft->id, [
            'title' => 'Updated by linked co researcher',
        ], $this->origin())->assertOk();
        $this->as($coResearcher)->patchJson('/api/research/'.$draft->id, [
            'authors' => [[
                'user_id' => $intruder->id,
                'author_name' => 'Unauthorized participant',
                'is_corresponding_author' => false,
            ]],
        ], $this->origin())->assertUnprocessable();
        $this->as($intruder)->patchJson('/api/research/'.$draft->id, [
            'title' => 'Unauthorized update',
        ], $this->origin())->assertForbidden();

        $this->assertSame('Updated by linked co researcher', $draft->refresh()->title);
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
