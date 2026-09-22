<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\DocumentFile;
use App\Models\FeedbackComment;
use App\Models\PdfAnnotation;
use App\Models\ResearchDocument;
use App\Models\ReviewAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PdfAnnotationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_reviewers_only_receive_their_own_annotations_while_researchers_receive_the_consolidated_list(): void
    {
        Storage::fake('researchnav_private');
        [$owner, $research, $file] = $this->researchWithPdf();
        $first = User::factory()->create(['role' => 'adviser', 'first_name' => 'First', 'last_name' => 'Reviewer']);
        $second = User::factory()->create(['role' => 'adviser', 'first_name' => 'Second', 'last_name' => 'Reviewer']);
        $this->assignReviewer($research, $first);
        $this->assignReviewer($research, $second);

        $firstAnnotation = $this->as($first)->postJson($this->url($research, $file), $this->payload('First confidential note.'), $this->origin())
            ->assertCreated()
            ->assertHeader('cache-control', 'no-store, private')
            ->assertJsonPath('data.author_name', 'First Reviewer')
            ->json('data');
        $this->as($second)->postJson($this->url($research, $file), $this->payload('Second confidential note.'), $this->origin())->assertCreated();

        $this->as($first)->getJson($this->url($research, $file))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $firstAnnotation['id'])
            ->assertJsonMissing(['body' => 'Second confidential note.']);
        $this->as($second)->getJson($this->url($research, $file))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonMissing(['body' => 'First confidential note.']);
        $this->as($owner)->getJson($this->url($research, $file))
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['body' => 'First confidential note.'])
            ->assertJsonFragment(['body' => 'Second confidential note.']);
    }

    public function test_co_researcher_receives_consolidated_annotations_and_assigned_panel_has_a_private_review_view(): void
    {
        Storage::fake('researchnav_private');
        [, $research, $file] = $this->researchWithPdf();
        $coResearcher = User::factory()->create(['role' => 'researcher']);
        $this->assignResearcherToDocument($coResearcher, $research);
        $panel = User::factory()->create(['role' => 'panel']);
        $this->assignReviewer($research, $panel, 'panel');
        PdfAnnotation::query()->create($this->annotationAttributes($research, $file, User::factory()->create(['role' => 'research-office'])));

        $this->as($coResearcher)->getJson($this->url($research, $file))->assertOk()->assertJsonCount(1, 'data');
        $this->as($panel)->getJson($this->url($research, $file))->assertOk()->assertJsonCount(0, 'data');
        $this->as($panel)->postJson($this->url($research, $file), $this->payload('Panel note.'), $this->origin())->assertCreated();
        $feedback = $this->as($panel)->postJson('/api/research/'.$research->id.'/feedback', [
            'document_file_id' => $file->id,
            'comment' => 'Revise this explanation.',
            'feedback_type' => 'revision_request',
        ], $this->origin())->assertCreated()->assertJsonPath('data.feedback_status', 'open')->json('data');
        $this->as($panel)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback['id'], ['feedback_status' => 'resolved'], $this->origin())
            ->assertOk()->assertJsonPath('data.feedback_status', 'resolved');
        $this->as($panel)->patchJson('/api/research/'.$research->id.'/feedback/'.$feedback['id'], ['feedback_status' => 'open'], $this->origin())
            ->assertOk()->assertJsonPath('data.feedback_status', 'open');
        $this->as(User::factory()->create(['role' => 'researcher']))->getJson($this->url($research, $file))->assertForbidden();
    }

    public function test_annotation_creation_rejects_cross_research_files_docx_and_invalid_rectangles(): void
    {
        Storage::fake('researchnav_private');
        [, $research, $file] = $this->researchWithPdf();
        [, $otherResearch, $otherFile] = $this->researchWithPdf();
        $office = User::factory()->create(['role' => 'research-office']);

        $this->as($office)->postJson($this->url($research, $otherFile), $this->payload('No.'), $this->origin())->assertNotFound();

        $docx = $this->file($research, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 'docx-content');
        $this->as($office)->postJson($this->url($research, $docx), $this->payload('No.'), $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('document_file_id');

        $payload = $this->payload('No.');
        $payload['anchor']['rects'][0] = ['x' => 0.8, 'y' => 0.2, 'width' => 0.3, 'height' => 0.1];
        $this->as($office)->postJson($this->url($research, $file), $payload, $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('anchor.rects.0');
        $this->assertSame($otherResearch->id, $otherFile->research_document_id);
    }

    public function test_annotated_file_cannot_be_deleted_and_audit_does_not_contain_comment_text(): void
    {
        Storage::fake('researchnav_private');
        [$owner, $research, $file] = $this->researchWithPdf();
        $office = User::factory()->create(['role' => 'research-office']);
        $secret = 'Sensitive reviewer wording.';

        $this->as($office)->postJson($this->url($research, $file), $this->payload($secret), $this->origin())->assertCreated();
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'PDF_ANNOTATION_CREATED',
            'description' => 'Added a confidential annotation to a private PDF.',
        ]);
        $this->assertDatabaseMissing('audit_logs', ['description' => $secret]);
        $this->as($owner)->deleteJson('/api/research/'.$research->id.'/files/'.$file->id, [], $this->origin())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('document_file_id');
        Storage::disk('researchnav_private')->assertExists($file->file_path);
    }

    public function test_legacy_feedback_is_also_private_between_reviewers_and_consolidated_for_researchers(): void
    {
        Storage::fake('researchnav_private');
        [$owner, $research] = $this->researchWithPdf();
        $first = User::factory()->create(['role' => 'adviser']);
        $second = User::factory()->create(['role' => 'adviser']);
        $this->assignReviewer($research, $first);
        $this->assignReviewer($research, $second);
        FeedbackComment::query()->create([
            'research_document_id' => $research->id,
            'user_id' => $first->id,
            'comment' => 'First private feedback.',
            'feedback_type' => 'comment',
            'feedback_status' => 'open',
        ]);
        FeedbackComment::query()->create([
            'research_document_id' => $research->id,
            'user_id' => $second->id,
            'comment' => 'Second private feedback.',
            'feedback_type' => 'comment',
            'feedback_status' => 'open',
        ]);

        $this->as($first)->getJson('/api/research/'.$research->id.'/feedback')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['comment' => 'First private feedback.'])
            ->assertJsonMissing(['comment' => 'Second private feedback.']);
        $this->as($owner)->getJson('/api/research/'.$research->id.'/feedback')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_removed_submitter_loses_consolidated_feedback_and_annotation_access(): void
    {
        Storage::fake('researchnav_private');
        [$owner, $research, $file] = $this->researchWithPdf();
        $reviewer = User::factory()->create(['role' => 'adviser']);
        $this->assignReviewer($research, $reviewer);
        PdfAnnotation::query()->create($this->annotationAttributes($research, $file, $reviewer));
        FeedbackComment::query()->create([
            'research_document_id' => $research->id,
            'user_id' => $reviewer->id,
            'comment' => 'Private feedback.',
            'feedback_type' => 'comment',
            'feedback_status' => 'open',
        ]);
        DB::table('class_section_members')
            ->where('research_document_id', $research->id)
            ->where('user_id', $owner->id)
            ->delete();

        $this->as($owner)->getJson($this->url($research, $file))->assertForbidden();
        $this->as($owner)->getJson('/api/research/'.$research->id.'/feedback')->assertForbidden();
    }

    /** @return array{User, ResearchDocument, DocumentFile} */
    private function researchWithPdf(): array
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $category = Category::query()->create(['name' => fake()->unique()->words(2, true), 'slug' => fake()->unique()->slug()]);
        $research = ResearchDocument::factory()->create(['submitted_by' => $owner->id, 'category_id' => $category->id]);
        $this->assignResearcherToDocument($owner, $research);
        $file = $this->file($research, 'application/pdf', 'pdf', "%PDF-1.4\n");

        return [$owner, $research, $file];
    }

    private function file(ResearchDocument $research, string $mime, string $extension, string $content): DocumentFile
    {
        $uploader = User::factory()->create(['role' => 'researcher']);
        $filename = fake()->uuid().'.'.$extension;
        $path = 'research/'.$research->id.'/'.$filename;
        Storage::disk('researchnav_private')->put($path, $content);

        return DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $uploader->id,
            'document_type' => $extension === 'pdf' ? 'draft' : 'attachment',
            'version_number' => DocumentFile::query()->where('research_document_id', $research->id)->count() + 1,
            'original_filename' => 'manuscript.'.$extension,
            'stored_filename' => $filename,
            'file_path' => $path,
            'file_extension' => $extension,
            'mime_type' => $mime,
            'file_size' => strlen($content),
            'is_current' => true,
            'uploaded_at' => now(),
        ]);
    }

    private function assignReviewer(ResearchDocument $research, User $reviewer, ?string $role = null): void
    {
        ReviewAssignment::query()->create([
            'research_document_id' => $research->id,
            'reviewer_id' => $reviewer->id,
            'assigned_by' => User::factory()->create(['role' => 'instructor'])->id,
            'review_role' => $role ?? $reviewer->role,
            'is_active' => true,
        ]);
    }

    private function annotationAttributes(ResearchDocument $research, DocumentFile $file, User $author): array
    {
        return [
            'research_document_id' => $research->id,
            'document_file_id' => $file->id,
            'author_id' => $author->id,
            'author_role' => $author->role,
            'kind' => 'comment',
            'body' => 'Consolidated note.',
            'anchor_schema_version' => 1,
            'page_number' => 1,
            'selected_text' => 'Selected paragraph',
            'rects' => [['x' => 0.1, 'y' => 0.2, 'width' => 0.4, 'height' => 0.05]],
        ];
    }

    private function payload(string $body): array
    {
        return [
            'kind' => 'comment',
            'body' => $body,
            'anchor' => [
                'schema_version' => 1,
                'page_number' => 1,
                'exact' => 'Selected paragraph',
                'prefix' => 'Before',
                'suffix' => 'After',
                'rects' => [['x' => 0.1, 'y' => 0.2, 'width' => 0.4, 'height' => 0.05]],
            ],
        ];
    }

    private function url(ResearchDocument $research, DocumentFile $file): string
    {
        return '/api/research/'.$research->id.'/files/'.$file->id.'/annotations';
    }

    private function as(User $user): static
    {
        return $this->withSession(['user_id' => $user->id]);
    }

    private function origin(): array
    {
        return ['Origin' => 'http://localhost:5173'];
    }
}
