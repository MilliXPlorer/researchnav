<?php

namespace Tests\Feature;

use App\Models\DocumentFile;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class RoleWorkspaceApiSecondTest extends TestCase
{
    use RefreshDatabase;

    public function test_librarian_archiving_queue_metadata_and_retention_logs(): void
    {
        $librarian = $this->user(['role' => 'librarian']);
        $owner = $this->user(['role' => 'researcher']);
        $approved = $this->document('approved', $owner);
        ResearchAuthor::query()->create(['research_document_id' => $approved->id, 'author_name' => 'Filjoy Santos', 'author_order' => 1]);
        $this->document('draft', $owner);

        $this->as($librarian)->getJson('/api/librarian/archiving-queue')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.metadata_completeness.title', true)
            ->assertJsonPath('data.0.metadata_completeness.authors', true);
        $this->as($librarian)->getJson('/api/librarian/catalog')->assertOk();
        $this->as($librarian)->getJson('/api/librarian/metadata-standards')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->as($librarian)->putJson('/api/librarian/metadata/'.$approved->id, [
            'title_complete' => true, 'abstract_complete' => true, 'authors_complete' => true,
            'keywords_complete' => false, 'category_complete' => true, 'review_status' => 'complete',
        ], $this->origin())->assertOk()->assertJsonPath('data.review_status', 'complete');
        $this->assertDatabaseHas('audit_logs', ['action' => 'METADATA_REVIEWED']);

        $this->as($librarian)->postJson('/api/librarian/retention-logs', [
            'research_document_id' => $approved->id,
            'action' => 'final_archived',
            'remarks' => 'Final manuscript retained.',
        ], $this->origin())->assertCreated();
        $this->assertDatabaseHas('audit_logs', ['action' => 'RETENTION_LOGGED']);
        $this->as($librarian)->postJson('/api/librarian/retention-logs', ['action' => 'not-a-real-action'], $this->origin())
            ->assertUnprocessable();
        $this->as($librarian)->getJson('/api/librarian/retention-logs')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_office_compliance_user_management_and_reports(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $owner = $this->user(['role' => 'researcher']);
        $approved = $this->document('approved', $owner, 'pending_archiving');
        $this->document('draft', $owner);

        $this->as($office)->getJson('/api/office/compliance')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.submission_status', 'approved');
        $this->as($office)->putJson('/api/office/compliance/'.$approved->id, [
            'format_compliant' => true, 'attachments_compliant' => true, 'consent_forms_compliant' => true,
            'review_status' => 'endorsed',
        ], $this->origin())->assertOk()->assertJsonPath('data.review_status', 'endorsed');
        $this->as($office)->putJson('/api/office/compliance/'.$approved->id, ['review_status' => 'pending'], $this->origin())
            ->assertUnprocessable();

        $this->as($office)->getJson('/api/office/users')->assertOk()->assertJsonCount(2, 'data.data');
        $this->as($office)->patchJson('/api/office/users/'.$owner->id, ['access_status' => 'blocked'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.access_status', 'blocked');
        $admin = $this->user(['role' => 'admin', 'access_status' => 'active']);
        $this->as($office)->patchJson('/api/office/users/'.$admin->id, ['access_status' => 'blocked'], $this->origin())
            ->assertConflict()
            ->assertExactJson(['error' => 'ACCOUNT_MUTATION_NOT_ALLOWED']);

        $this->as($office)->getJson('/api/office/reports')
            ->assertOk()
            ->assertJsonPath('data.counts.total_users', 3)
            ->assertJsonPath('data.counts.pending_archiving', 1)
            ->assertJsonPath('data.counts.archived', 0);
    }

    public function test_office_report_logos_are_served_from_private_storage(): void
    {
        $office = $this->user(['role' => 'research-office']);

        foreach (['college', 'research-publications'] as $logo) {
            $this->as($office)
                ->get('/api/office/reports/logos/'.$logo)
                ->assertOk()
                ->assertHeader('Content-Type', 'image/jpeg');
        }

        $this->as($office)
            ->get('/api/office/reports/logos/unknown')
            ->assertNotFound();
    }

    public function test_office_report_sections_are_rendered_as_pdfs(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $owner = $this->user(['role' => 'researcher']);
        $this->document('approved', $owner, 'pending_archiving');

        foreach (['academic-units', 'submission-status', 'sdgs'] as $section) {
            $response = $this->as($office)->get('/api/office/reports/'.$section.'/pdf');

            $response->assertOk()
                ->assertHeader('Content-Type', 'application/pdf')
                ->assertHeader('Cache-Control', 'no-store, private');
            $this->assertStringStartsWith('%PDF-', $response->getContent());
        }

        $this->as($office)->get('/api/office/reports/unknown/pdf')->assertNotFound();
        $this->as($owner)->get('/api/office/reports/academic-units/pdf')->assertForbidden();
    }

    public function test_coordinator_report_provides_scoped_study_details_for_count_drill_down(): void
    {
        $coordinator = $this->user(['role' => 'coordinator', 'institute' => 'Institute of Computer Studies']);
        $owner = $this->user(['role' => 'researcher']);
        $visible = $this->document('revision_required', $owner);
        $visible->update(['institute' => 'Institute of Computer Studies', 'degree_program' => 'Bachelor of Science in Computer Science']);
        $hidden = $this->document('revision_required', $owner);
        $hidden->update(['institute' => 'Institute of Health Sciences']);

        $this->as($coordinator)->getJson('/api/coordinator/reports?institute=Institute%20of%20Computer%20Studies')
            ->assertOk()
            ->assertJsonPath('data.counts.revision_required', 1)
            ->assertJsonPath('data.studies.0.id', $visible->id)
            ->assertJsonCount(1, 'data.studies')
            ->assertJsonStructure(['data' => ['researchers', 'defense_schedules', 'evaluations', 'methodology_reviews', 'active_instructors_list', 'active_advisers_list']]);
    }

    public function test_reviewer_assignments_accept_panel_and_statistician_roles(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $panelist = $this->user(['role' => 'panel']);
        $statistician = $this->user(['role' => 'statistician']);
        $document = $this->document('submitted');

        $this->as($office)->putJson('/api/research/'.$document->id.'/reviewers', [
            'reviewers' => [
                ['reviewer_id' => $panelist->id, 'review_role' => 'panel'],
                ['reviewer_id' => $statistician->id, 'review_role' => 'statistician'],
            ],
        ], $this->origin())->assertOk();

        $this->assertDatabaseHas('research_review_assignments', ['research_document_id' => $document->id, 'reviewer_id' => $panelist->id, 'review_role' => 'panel', 'is_active' => true]);
        $this->assertDatabaseHas('research_review_assignments', ['research_document_id' => $document->id, 'reviewer_id' => $statistician->id, 'review_role' => 'statistician', 'is_active' => true]);

        $coordinator = $this->user(['role' => 'coordinator', 'institute' => 'Institute of Computer Studies']);
        $this->as($coordinator)->putJson('/api/research/'.$document->id.'/reviewers', [
            'reviewers' => [['reviewer_id' => $panelist->id, 'review_role' => 'panel']],
        ], $this->origin())->assertForbidden();

        $researcher = $this->user(['role' => 'researcher']);
        $this->as($researcher)->putJson('/api/research/'.$document->id.'/reviewers', [
            'reviewers' => [['reviewer_id' => $panelist->id, 'review_role' => 'panel']],
        ], $this->origin())->assertForbidden();
    }

    public function test_office_can_browse_institute_studies_from_database(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $owner = $this->user(['role' => 'researcher']);
        $document = ResearchDocument::factory()->create([
            'submitted_by' => $owner->id,
            'submission_status' => 'approved',
            'archive_status' => 'archived',
            'visibility' => 'public',
            'publication_year' => 2025,
            'institute' => 'Institute of Computer Studies',
            'title' => 'Sample Study',
        ]);

        $this->as($office)->getJson('/api/office/institutes/ICS/studies')
            ->assertOk()
            ->assertJsonPath('data.0.id', $document->id)
            ->assertJsonPath('data.0.year', '2025')
            ->assertJsonPath('data.0.title', 'Sample Study');
    }

    public function test_office_can_open_and_download_an_institute_study_from_private_storage(): void
    {
        Storage::fake('researchnav_private');
        $office = $this->user(['role' => 'research-office']);
        $owner = $this->user(['role' => 'researcher']);
        $document = ResearchDocument::factory()->create([
            'submitted_by' => $owner->id,
            'submission_status' => 'approved',
            'archive_status' => 'archived',
            'publication_year' => 2025,
            'institute' => 'Institute of Computer Studies',
            'title' => 'Sample Study',
        ]);
        $storedFilename = Str::uuid()->toString().'.pdf';
        DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $owner->id,
            'document_type' => 'final_manuscript',
            'version_number' => 1,
            'original_filename' => 'manuscript.pdf',
            'stored_filename' => $storedFilename,
            'file_path' => 'research/'.$document->id.'/'.$storedFilename,
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 21,
            'is_current' => true,
            'uploaded_at' => now(),
        ]);
        Storage::disk('researchnav_private')->put(
            'research/'.$document->id.'/'.$storedFilename,
            '%PDF-1.4 test content',
        );
        $studyPath = '/api/office/institutes/ICS/studies/2025/Sample%20Study';

        $this->as($office)->get($studyPath.'/open?id='.$document->id)
            ->assertOk()
            ->assertSee('manuscript.pdf')
            ->assertSee('Download all manuscripts (.zip)');

        $this->as($office)->get($studyPath.'/download?id='.$document->id)
            ->assertOk()
            ->assertDownload('Sample Study.zip')
            ->assertHeader('content-type', 'application/zip');
    }

    public function test_research_index_mine_filter_returns_only_own_submissions(): void
    {
        $researcher = $this->user(['role' => 'researcher']);
        $other = $this->user(['role' => 'researcher']);
        $own = $this->document('draft', $researcher);
        $this->document('draft', $other);
        $this->assignResearcherToDocument($researcher, $own);

        $response = $this->as($researcher)->getJson('/api/research?mine=1');
        $response->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $own->id);
    }

    private function document(string $status, ?User $owner = null, string $archive = 'not_archived'): ResearchDocument
    {
        return ResearchDocument::factory()->create([
            'submitted_by' => $owner?->id ?? $this->user()->id,
            'submission_status' => $status,
            'archive_status' => $archive,
            'visibility' => $status === 'archived' ? 'public' : 'private',
        ]);
    }

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
}
