<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\ClassSection;
use App\Models\DocumentFile;
use App\Models\FeedbackComment;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\Revision;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ResearcherAuthorizationHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_researcher_owners_cannot_start_or_operate_researcher_workflow_actions(): void
    {
        foreach (['adviser', 'instructor', 'panel', 'statistician', 'coordinator', 'librarian', 'research-office', 'research_editor'] as $role) {
            $actor = User::factory()->create(['role' => $role]);
            $category = Category::query()->create(['name' => 'Category '.$role, 'slug' => 'category-'.$role]);
            $research = ResearchDocument::factory()->create(['submitted_by' => $actor->id, 'category_id' => $category->id, 'submission_status' => 'draft']);
            ResearchAuthor::factory()->create(['research_document_id' => $research->id, 'user_id' => $actor->id]);
            $feedback = FeedbackComment::query()->create(['research_document_id' => $research->id, 'user_id' => User::factory()->create(['role' => 'adviser'])->id, 'comment' => 'Clarify this.', 'feedback_type' => 'suggestion', 'feedback_status' => 'open']);
            $research->update(['submission_status' => 'revision_required']);
            $revision = Revision::query()->create(['research_document_id' => $research->id, 'requested_by' => $feedback->user_id, 'revision_number' => 1, 'revision_remarks' => 'Revise.', 'revision_status' => 'requested', 'requested_at' => now()]);

            $this->as($actor)->postJson('/api/research', $this->draftPayload($category->id), $this->origin())->assertForbidden();
            $this->as($actor)->patchJson('/api/research/'.$research->id, ['title' => 'Hijacked'], $this->origin())->assertForbidden();
            $this->as($actor)->postJson('/api/research/'.$research->id.'/submit', [], $this->origin())->assertForbidden();
            $this->as($actor)->postJson('/api/research/'.$research->id.'/monitoring', ['progress_status' => 'on_track', 'remarks' => 'Not permitted.'], $this->origin())->assertForbidden();
            $this->as($actor)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', ['action' => 'acknowledge'], $this->origin())->assertForbidden();
            $this->as($actor)->patchJson('/api/research/'.$research->id.'/revisions/'.$revision->id.'/resubmit', [], $this->origin())->assertForbidden();

            $this->as($actor)->postJson('/api/research/'.$research->id.'/validation', [], $this->origin())->assertForbidden();
        }
    }

    public function test_researchers_can_only_work_in_instructor_assigned_research_folders(): void
    {
        $researcher = User::factory()->create(['role' => 'researcher']);
        $instructor = User::factory()->create(['role' => 'instructor']);
        $category = Category::query()->create(['name' => 'Computing', 'slug' => 'computing']);
        $section = ClassSection::query()->create([
            'instructor_id' => $instructor->id,
            'name' => 'Capstone 1',
        ]);
        $assigned = ResearchDocument::factory()->create([
            'submitted_by' => $instructor->id,
            'section_id' => $section->id,
            'category_id' => $category->id,
            'submission_status' => 'draft',
        ]);
        $unassigned = ResearchDocument::factory()->create([
            'submitted_by' => $researcher->id,
            'category_id' => $category->id,
            'submission_status' => 'draft',
        ]);
        ResearchAuthor::factory()->create([
            'research_document_id' => $unassigned->id,
            'user_id' => $researcher->id,
        ]);

        $this->as($researcher)
            ->postJson('/api/research', $this->draftPayload($category->id), $this->origin())
            ->assertForbidden();
        $this->as($researcher)
            ->patchJson('/api/research/'.$unassigned->id, ['title' => 'Not allowed'], $this->origin())
            ->assertForbidden();
        $this->as($researcher)
            ->postJson('/api/research/'.$unassigned->id.'/submit', [], $this->origin())
            ->assertForbidden();

        DB::table('class_section_members')->insert([
            'class_section_id' => $section->id,
            'research_document_id' => $assigned->id,
            'user_id' => $researcher->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->as($researcher)->getJson('/api/research?mine=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $assigned->id)
            ->assertJsonPath('data.0.submission_status', 'draft')
            ->assertJsonPath('data.0.archive_status', 'not_archived')
            ->assertJsonPath('data.0.section_id', $section->id)
            ->assertJsonPath('data.0.can_update_metadata', true);
        $this->as($researcher)->getJson('/api/research/'.$assigned->id)
            ->assertOk()
            ->assertJsonPath('data.submission_status', 'draft')
            ->assertJsonPath('data.section_id', $section->id)
            ->assertJsonPath('data.can_update_metadata', true);
        $this->as($researcher)->getJson('/api/research/'.$assigned->id.'/folders')
            ->assertOk()
            ->assertExactJson(['data' => [
                'Chapter 1',
                'Chapter 2',
                'Chapter 3',
                'Chapter 4',
                'Chapter 5',
                'Chapter 6',
                'Full Manuscript',
            ]]);
        $this->as($researcher)
            ->patchJson('/api/research/'.$assigned->id, ['title' => 'Assigned folder title'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.title', 'Assigned folder title');
    }

    public function test_researcher_mutation_contracts_reject_unknown_and_client_activity_dates(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $this->assignToResearch($owner, $research);
        $feedback = FeedbackComment::query()->create(['research_document_id' => $research->id, 'user_id' => User::factory()->create(['role' => 'adviser'])->id, 'comment' => 'Clarify this.', 'feedback_type' => 'suggestion', 'feedback_status' => 'open']);

        $this->as($owner)->postJson('/api/research/'.$research->id.'/monitoring', ['progress_status' => 'on_track', 'remarks' => 'Done.', 'activity_date' => now()->addYear()->toIso8601String()], $this->origin())
            ->assertUnprocessable()->assertJsonValidationErrors('activity_date');
        $this->as($owner)->postJson('/api/research/'.$research->id.'/monitoring', ['progress_status' => 'on_track', 'remarks' => 'Done.', 'activity_date' => now()->subYear()->toIso8601String()], $this->origin())
            ->assertUnprocessable()->assertJsonValidationErrors('activity_date');
        $this->as($owner)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', ['action' => 'acknowledge', 'unexpected' => true], $this->origin())
            ->assertUnprocessable()->assertJsonValidationErrors('unexpected');
        $this->as($owner)->postJson('/api/research/'.$research->id.'/submit', ['unexpected' => true], $this->origin())
            ->assertUnprocessable()->assertJsonValidationErrors('unexpected');
        $this->as($owner)->postJson('/api/research/'.$research->id.'/validation', ['validated_by' => $owner->id], $this->origin())
            ->assertUnprocessable()->assertJsonValidationErrors('validated_by');
        $this->as($owner)->patchJson('/api/research/'.$research->id, ['authors' => [['author_name' => 'Owner', 'untrusted' => true]]], $this->origin())
            ->assertUnprocessable()->assertJsonValidationErrors('authors.0.untrusted');
    }

    public function test_unrelated_archived_users_see_only_the_current_final_manuscript(): void
    {
        Storage::fake('researchnav_private');
        $owner = User::factory()->create(['role' => 'researcher']);
        $viewer = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner, ['submission_status' => 'archived', 'archive_status' => 'archived', 'visibility' => 'registered_only']);
        $final = $this->file($research, $owner, 'final_manuscript', 'final.pdf');
        $draft = $this->file($research, $owner, 'draft', 'draft.pdf');
        Storage::disk('researchnav_private')->put($final->file_path, '%PDF-1.4 final');
        Storage::disk('researchnav_private')->put($draft->file_path, '%PDF-1.4 draft');

        $this->as($viewer)->getJson('/api/research/'.$research->id.'/files')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $final->id);
        $this->as($viewer)->get('/api/research/'.$research->id.'/files/'.$final->id.'/download')->assertOk();
        $this->as($viewer)->get('/api/research/'.$research->id.'/files/'.$draft->id.'/download')->assertForbidden();
        $this->as($viewer)->get('/api/research/'.$research->id.'/files/'.$draft->id.'/preview')->assertForbidden();
    }

    public function test_private_file_path_and_pdf_tampering_are_rejected(): void
    {
        Storage::fake('researchnav_private');
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $this->assignToResearch($owner, $research);
        $file = $this->file($research, $owner, 'draft', 'unsafe.pdf');
        Storage::disk('researchnav_private')->put($file->file_path, 'not a PDF');

        $this->as($owner)->get('/api/research/'.$research->id.'/files/'.$file->id.'/preview')->assertNotFound();
        $file->update(['file_path' => 'research/'.$research->id.'/../secret.pdf']);
        $this->as($owner)->get('/api/research/'.$research->id.'/files/'.$file->id.'/download')->assertNotFound();
    }

    private function research(User $owner, array $attributes = []): ResearchDocument
    {
        $category = Category::query()->create(['name' => 'Category '.fake()->unique()->word(), 'slug' => 'category-'.fake()->unique()->numberBetween(1, 999999)]);
        $research = ResearchDocument::factory()->create(array_merge(['submitted_by' => $owner->id, 'category_id' => $category->id], $attributes));
        ResearchAuthor::factory()->create(['research_document_id' => $research->id, 'user_id' => $owner->id]);

        return $research;
    }

    private function file(ResearchDocument $research, User $owner, string $type, string $filename): DocumentFile
    {
        return DocumentFile::query()->create(['research_document_id' => $research->id, 'uploaded_by' => $owner->id, 'document_type' => $type, 'version_number' => 1, 'original_filename' => $filename, 'stored_filename' => $filename, 'file_path' => 'research/'.$research->id.'/'.$filename, 'file_extension' => 'pdf', 'mime_type' => 'application/pdf', 'file_size' => 1, 'is_current' => true, 'uploaded_at' => now()]);
    }

    private function assignToResearch(User $researcher, ResearchDocument $research): void
    {
        $section = ClassSection::query()->create([
            'instructor_id' => User::factory()->create(['role' => 'instructor'])->id,
            'name' => 'Assigned section '.fake()->unique()->numberBetween(1, 999999),
        ]);
        $research->update(['section_id' => $section->id]);
        DB::table('class_section_members')->insert([
            'class_section_id' => $section->id,
            'research_document_id' => $research->id,
            'user_id' => $researcher->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @return array<string, mixed> */
    private function draftPayload(int $categoryId): array
    {
        return ['category_id' => $categoryId, 'title' => 'Blocked draft', 'research_stage' => 'title_proposal', 'authors' => [['author_name' => 'Blocked actor']]];
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
