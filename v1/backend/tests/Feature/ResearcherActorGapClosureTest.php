<?php

namespace Tests\Feature;

use App\Http\Resources\TitleValidationResource;
use App\Models\DocumentFile;
use App\Models\PendingPrivateFileDeletion;
use App\Models\ResearchDocument;
use App\Models\TitleValidation;
use App\Models\User;
use App\Services\DocumentService;
use App\Services\SimilarityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class ResearcherActorGapClosureTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_researcher_cannot_upload_a_final_manuscript_during_revision_but_can_upload_a_revised_manuscript(): void
    {
        Storage::fake('researchnav_private');
        $researcher = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($researcher, 'revision_required');
        $service = app(DocumentService::class);

        $revised = $service->upload($researcher, $research, $this->pdf('revised.pdf'), 'revised_manuscript');
        $this->assertSame('revised_manuscript', $revised->document_type);

        $this->expectValidationException(fn () => $service->upload($researcher, $research, $this->pdf('final.pdf'), 'final_manuscript'));
        $this->assertDatabaseCount('document_files', 1);
    }

    public function test_active_admin_can_only_upload_final_manuscripts_after_approval_and_office_can_upload_them_when_approved(): void
    {
        Storage::fake('researchnav_private');
        $owner = User::factory()->create(['role' => 'researcher']);
        $admin = User::factory()->create(['role' => 'admin']);
        $office = User::factory()->create(['role' => 'research-office']);
        $research = $this->research($owner, 'draft');
        $service = app(DocumentService::class);

        $this->expectValidationException(fn () => $service->upload($admin, $research, $this->pdf('admin-final.pdf'), 'final_manuscript'));

        $research->update(['submission_status' => 'approved']);
        $adminFinal = $service->upload($admin, $research, $this->pdf('admin-approved-final.pdf'), 'final_manuscript');
        $officeFinal = $service->upload($office, $research, $this->pdf('office-approved-final.pdf'), 'final_manuscript');

        $this->assertSame($admin->id, $adminFinal->uploaded_by);
        $this->assertSame($office->id, $officeFinal->uploaded_by);
    }

    public function test_direct_upload_reauthorizes_the_locked_parent_state(): void
    {
        Storage::fake('researchnav_private');
        $researcher = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($researcher, 'revision_required');
        $staleResearch = $research->fresh();
        $research->update(['submission_status' => 'under_review']);

        $this->expectValidationException(fn () => app(DocumentService::class)->upload($researcher, $staleResearch, $this->pdf('revised.pdf'), 'revised_manuscript'));
        $this->assertDatabaseCount('document_files', 0);
    }

    public function test_researcher_cannot_rename_or_delete_after_the_research_leaves_an_editable_state(): void
    {
        Storage::fake('researchnav_private');
        $researcher = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($researcher, 'draft');
        $service = app(DocumentService::class);
        $file = $service->upload($researcher, $research, $this->pdf('draft.pdf'), 'draft');
        $research->update(['submission_status' => 'under_review']);

        $this->expectValidationException(fn () => $service->rename($researcher, $file, 'renamed.pdf'));
        $this->expectValidationException(fn () => $service->delete($researcher, $file));

        $this->assertDatabaseHas('document_files', ['id' => $file->id, 'original_filename' => 'draft.pdf']);
        Storage::disk('researchnav_private')->assertExists($file->file_path);
    }

    public function test_document_management_matches_the_allowed_status_and_type_combinations(): void
    {
        Storage::fake('researchnav_private');
        $owner = User::factory()->create(['role' => 'researcher']);
        $admin = User::factory()->create(['role' => 'admin']);
        $office = User::factory()->create(['role' => 'research-office']);
        $research = $this->research($owner, 'draft');
        $service = app(DocumentService::class);
        $draft = $service->upload($owner, $research, $this->pdf('draft.pdf'), 'draft');

        $final = DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'final.pdf',
            'stored_filename' => 'final.pdf',
            'file_path' => 'research/'.$research->id.'/final.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 1,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);

        $this->expectValidationException(fn () => $service->rename($owner, $final, 'owner-final.pdf'));
        $this->assertDatabaseHas('document_files', ['id' => $final->id, 'original_filename' => 'final.pdf']);
        $this->expectValidationException(fn () => $service->rename($office, $draft, 'office-draft.pdf'));
        $this->assertDatabaseHas('document_files', ['id' => $draft->id, 'original_filename' => 'draft.pdf']);

        $research->update(['submission_status' => 'approved']);
        $service->rename($admin, $final, 'admin-final.pdf');
        $this->assertDatabaseHas('document_files', ['id' => $final->id, 'original_filename' => 'admin-final.pdf']);
        $service->rename($office, $final, 'office-final.pdf');
        $this->assertDatabaseHas('document_files', ['id' => $final->id, 'original_filename' => 'office-final.pdf']);

        foreach (['under_review', 'archived', 'rejected'] as $status) {
            $research->update(['submission_status' => $status]);
            $this->expectValidationException(fn () => $service->rename($admin, $final, "{$status}.pdf"));
            $this->assertDatabaseHas('document_files', ['id' => $final->id, 'original_filename' => 'office-final.pdf']);
        }
    }

    public function test_failed_storage_write_does_not_create_a_file_or_replace_the_current_version(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $current = DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'draft',
            'version_number' => 1,
            'original_filename' => 'current.pdf',
            'stored_filename' => 'current.pdf',
            'file_path' => 'research/'.$research->id.'/current.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 1,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);
        $storage = Mockery::mock();
        $storage->shouldReceive('putFileAs')->once()->andReturnFalse();
        $storage->shouldReceive('delete')->once()->andReturnTrue();
        Storage::shouldReceive('disk')->twice()->with('researchnav_private')->andReturn($storage);

        try {
            app(DocumentService::class)->upload($owner, $research, $this->pdf('failed.pdf'), 'draft');
            $this->fail('A failed storage write must abort the upload.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Unable to store the uploaded document.', $exception->getMessage());
        }

        $this->assertDatabaseCount('document_files', 1);
        $this->assertDatabaseHas('document_files', ['id' => $current->id, 'is_current' => true]);
    }

    public function test_deleting_the_current_file_promotes_the_newest_remaining_version(): void
    {
        Storage::fake('researchnav_private');
        $researcher = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($researcher, 'draft');
        $service = app(DocumentService::class);
        $first = $service->upload($researcher, $research, $this->pdf('draft-v1.pdf'), 'draft');
        $current = $service->upload($researcher, $research, $this->pdf('draft-v2.pdf'), 'draft');

        $service->delete($researcher, $current);

        $this->assertDatabaseMissing('document_files', ['id' => $current->id]);
        $this->assertDatabaseHas('document_files', ['id' => $first->id, 'is_current' => true]);
        Storage::disk('researchnav_private')->assertMissing($current->file_path);
        $this->assertDatabaseHas('audit_logs', ['entity_id' => (string) $current->id, 'action' => 'DOCUMENT_DELETED']);
    }

    public function test_attachment_management_matches_upload_policy_for_an_owner_and_active_admin(): void
    {
        Storage::fake('researchnav_private');
        $owner = User::factory()->create(['role' => 'researcher']);
        $admin = User::factory()->create(['role' => 'admin']);
        $research = $this->research($owner, 'revision_required');
        $service = app(DocumentService::class);

        $attachment = $service->upload($owner, $research, $this->pdf('evidence.pdf'), 'attachment');
        $service->rename($admin, $attachment, 'renamed-evidence.pdf');
        $service->delete($owner, $attachment);

        $this->assertDatabaseMissing('document_files', ['id' => $attachment->id]);
        $this->assertDatabaseCount('pending_private_file_deletions', 0);
    }

    public function test_failed_private_storage_deletion_is_durable_and_a_later_retry_clears_it(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner, 'draft');
        $path = 'research/'.$research->id.'/pending.pdf';
        $file = DocumentFile::query()->create([
            'research_document_id' => $research->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'draft', 'version_number' => 1,
            'original_filename' => 'pending.pdf', 'stored_filename' => 'pending.pdf',
            'file_path' => $path, 'file_extension' => 'pdf', 'mime_type' => 'application/pdf',
            'file_size' => 1, 'is_current' => true, 'uploaded_at' => now(),
        ]);
        $storage = Mockery::mock();
        $attempt = 0;
        $storage->shouldReceive('delete')->twice()->with($path)->andReturnUsing(function () use (&$attempt): bool {
            $attempt++;

            return $attempt === 2;
        });
        Storage::shouldReceive('disk')->twice()->with('researchnav_private')->andReturn($storage);

        app(DocumentService::class)->delete($owner, $file);

        $pending = PendingPrivateFileDeletion::query()->sole();
        $this->assertDatabaseMissing('document_files', ['id' => $file->id]);
        $this->assertSame(1, $pending->attempts);

        $this->assertTrue(app(DocumentService::class)->retryPendingDeletion($pending));
        $this->assertDatabaseCount('pending_private_file_deletions', 0);
    }

    public function test_thrown_private_storage_deletion_remains_retryable(): void
    {
        $owner = User::factory()->create(['role' => 'researcher']);
        $research = $this->research($owner);
        $pending = PendingPrivateFileDeletion::query()->create([
            'research_document_id' => $research->id,
            'storage_path' => 'research/'.$research->id.'/retry.pdf',
        ]);
        $storage = Mockery::mock();
        $attempt = 0;
        $storage->shouldReceive('delete')->twice()->andReturnUsing(function () use (&$attempt): bool {
            $attempt++;
            if ($attempt === 1) {
                throw new RuntimeException('storage unavailable');
            }

            return true;
        });
        Storage::shouldReceive('disk')->twice()->with('researchnav_private')->andReturn($storage);

        $this->assertFalse(app(DocumentService::class)->retryPendingDeletion($pending));
        $this->assertDatabaseHas('pending_private_file_deletions', ['id' => $pending->id, 'attempts' => 1]);

        $this->assertTrue(app(DocumentService::class)->retryPendingDeletion($pending));
        $this->assertDatabaseCount('pending_private_file_deletions', 0);
    }

    public function test_title_validation_resource_exposes_timestamps(): void
    {
        $researcher = User::factory()->create(['role' => 'researcher']);
        $validation = TitleValidation::query()->create([
            'research_document_id' => $this->research($researcher)->id,
            'validated_by' => $researcher->id,
            'validation_status' => 'pending',
        ])->fresh();

        $payload = (new TitleValidationResource($validation))->resolve();

        $this->assertSame($validation->created_at->toISOString(), $payload['created_at']);
        $this->assertSame($validation->updated_at->toISOString(), $payload['updated_at']);
    }

    public function test_related_studies_returns_only_the_latest_persisted_result_per_candidate_without_deleting_history(): void
    {
        $researcher = User::factory()->create(['role' => 'researcher']);
        $source = $this->research($researcher);
        $firstCandidate = $this->archivedResearch();
        $secondCandidate = $this->archivedResearch();
        $service = app(SimilarityService::class);

        $historical = $service->storeResult($researcher, $source, $this->resultData($firstCandidate, 'scored', '0.900000'));
        $latestUnavailable = $service->storeResult($researcher, $source, $this->resultData($firstCandidate, 'content_unavailable', '0.990000'));
        $latestScored = $service->storeResult($researcher, $source, $this->resultData($secondCandidate, 'scored', '0.500000'));

        $related = $service->relatedStudies($source);

        $this->assertSame([$latestScored->id, $latestUnavailable->id], $related->pluck('id')->all());
        $this->assertNotContains($historical->id, $related->pluck('id')->all());
        $this->assertDatabaseCount('similarity_results', 3);
    }

    public function test_related_studies_omit_exact_zero_scored_results_but_keep_unavailable_results(): void
    {
        $researcher = User::factory()->create(['role' => 'researcher']);
        $source = $this->research($researcher);
        $zeroCandidate = $this->archivedResearch();
        $unavailableCandidate = $this->archivedResearch();
        $service = app(SimilarityService::class);

        $service->storeResult($researcher, $source, $this->resultData($zeroCandidate, 'scored', '0.000000'));
        $unavailable = $service->storeResult($researcher, $source, $this->resultData($unavailableCandidate, 'content_unavailable', '0.000000'));

        $this->assertSame([$unavailable->id], $service->relatedStudies($source)->pluck('id')->all());
    }

    private function research(User $owner, string $status = 'draft'): ResearchDocument
    {
        return ResearchDocument::factory()->create([
            'submitted_by' => $owner->id,
            'submission_status' => $status,
        ]);
    }

    private function archivedResearch(): ResearchDocument
    {
        return ResearchDocument::factory()->create([
            'submission_status' => 'archived',
            'archive_status' => 'archived',
            'visibility' => 'public',
        ]);
    }

    private function pdf(string $filename): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($filename, '%PDF test');
    }

    /** @return array<string, int|string|null> */
    private function resultData(ResearchDocument $matched, string $status, string $score): array
    {
        return [
            'matched_research_id' => $matched->id,
            'title_similarity_score' => $score,
            'content_similarity_score' => $status === 'scored' ? $score : null,
            'analysis_type' => 'title',
        ];
    }

    private function expectValidationException(callable $action): void
    {
        try {
            $action();
            $this->fail('Expected validation to reject the operation.');
        } catch (ValidationException) {
            // Expected.
        }
    }
}
