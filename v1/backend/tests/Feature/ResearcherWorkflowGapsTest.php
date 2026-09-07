<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\ClassSection;
use App\Models\DocumentFile;
use App\Models\FeedbackComment;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ResearcherWorkflowGapsTest extends TestCase
{
    use RefreshDatabase;

    public function test_draft_gets_a_stable_submission_reference_and_owner_can_read_assigned_people(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $instructor = User::factory()->create(['role' => 'instructor', 'first_name' => 'Ina', 'last_name' => 'Structor']);
        $adviser = User::factory()->create(['role' => 'adviser', 'first_name' => 'Ada', 'last_name' => 'Viser']);
        $section = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'ICS 4A']);
        $research = $this->research($owner, ['section_id' => $section->id]);
        ReviewAssignment::query()->create(['research_document_id' => $research->id, 'reviewer_id' => $adviser->id, 'assigned_by' => $instructor->id, 'review_role' => 'adviser', 'is_active' => true]);

        $this->assertMatchesRegularExpression('/^RN-\d{4}-[A-Z0-9]{8}$/', (string) $research->submission_reference);
        $reference = $research->submission_reference;
        $research->update(['title' => 'Updated title']);
        $this->assertSame($reference, $research->refresh()->submission_reference);

        $this->as($owner)->getJson('/api/research/'.$research->id.'/people')
            ->assertOk()
            ->assertJsonPath('data.section.name', 'ICS 4A')
            ->assertJsonPath('data.section.instructor_name', 'Ina Structor')
            ->assertJsonPath('data.reviewers.0.name', 'Ada Viser');

        $this->as(User::factory()->create())->getJson('/api/research/'.$research->id.'/people')->assertForbidden();
    }

    public function test_owner_can_report_progress_but_another_researcher_cannot(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner, ['research_stage' => 'ongoing']);

        $this->as($owner)->postJson('/api/research/'.$research->id.'/monitoring', [
            'progress_status' => 'on_track', 'remarks' => 'Chapter two data collection is complete.',
        ], $this->origin())
            ->assertCreated()
            ->assertJsonPath('data.activity_type', 'RESEARCHER_PROGRESS_REPORTED')
            ->assertJsonPath('data.monitoring_status', 'on_track');
        $this->assertDatabaseHas('audit_logs', ['action' => 'RESEARCHER_PROGRESS_REPORTED']);

        $this->as(User::factory()->create(['role' => 'researcher']))->postJson('/api/research/'.$research->id.'/monitoring', [
            'progress_status' => 'on_track', 'remarks' => 'Unauthorized update.',
        ], $this->origin())->assertForbidden();
    }

    public function test_researcher_feedback_actions_do_not_change_reviewer_resolution_status(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $adviser = User::factory()->create(['role' => 'adviser']);
        $research = $this->research($owner);
        $feedback = FeedbackComment::query()->create([
            'research_document_id' => $research->id, 'user_id' => $adviser->id, 'comment' => 'Clarify the sample.', 'feedback_type' => 'suggestion', 'feedback_status' => 'open',
        ]);

        $this->as($owner)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', ['action' => 'acknowledge'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.feedback_status', 'open')
            ->assertJsonPath('data.researcher_addressed_at', null);
        $this->as($owner)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback->id.'/researcher-action', ['action' => 'address', 'remarks' => 'Updated the sampling section.'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.feedback_status', 'open')
            ->assertJsonPath('data.researcher_action_remarks', 'Updated the sampling section.');
        $this->assertNotNull($feedback->refresh()->researcher_acknowledged_at);
        $this->assertNotNull($feedback->researcher_addressed_at);
    }

    public function test_owner_can_request_one_pending_title_validation_and_see_linked_evidence(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner, ['submission_status' => 'submitted']);

        $this->as($owner)->postJson('/api/research/'.$research->id.'/validation', [], $this->origin())
            ->assertCreated()
            ->assertJsonPath('data.validation_status', 'pending');
        $this->as($owner)->postJson('/api/research/'.$research->id.'/validation', [], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('validation_status');
    }

    public function test_owner_can_preview_an_owned_pdf_but_not_a_docx(): void
    {
        Storage::fake('researchnav_private');
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $pdf = $this->file($research, $owner, 'application/pdf', 'pdf');
        $docx = $this->file($research, $owner, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 'attachment');
        Storage::disk('researchnav_private')->put($pdf->file_path, "%PDF-1.4\n");
        Storage::disk('researchnav_private')->put($docx->file_path, 'docx');

        $this->as($owner)->get('/api/research/'.$research->id.'/files/'.$pdf->id.'/preview')->assertOk()->assertHeader('content-type', 'application/pdf');
        $this->as($owner)->get('/api/research/'.$research->id.'/files/'.$docx->id.'/preview')->assertNotFound();
    }

    private function research(User $owner, array $attributes = []): ResearchDocument
    {
        $category = Category::query()->create(['name' => 'Education '.fake()->unique()->word(), 'slug' => 'education-'.fake()->unique()->numberBetween(1, 999999)]);
        $research = ResearchDocument::factory()->create(array_merge(['submitted_by' => $owner->id, 'category_id' => $category->id], $attributes));
        ResearchAuthor::factory()->create(['research_document_id' => $research->id, 'user_id' => $owner->id]);

        return $research;
    }

    private function file(ResearchDocument $research, User $owner, string $mime, string $extension, string $type = 'draft'): DocumentFile
    {
        return DocumentFile::query()->create([
            'research_document_id' => $research->id, 'uploaded_by' => $owner->id, 'document_type' => $type, 'version_number' => 1,
            'original_filename' => "file.{$extension}", 'stored_filename' => "file-{$extension}.{$extension}", 'file_path' => "research/{$research->id}/file-{$extension}.{$extension}",
            'file_extension' => $extension, 'mime_type' => $mime, 'file_size' => 1, 'is_current' => true, 'uploaded_at' => now(),
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
