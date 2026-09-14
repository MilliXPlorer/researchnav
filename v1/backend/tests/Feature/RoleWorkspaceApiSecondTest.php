<?php

namespace Tests\Feature;

use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\SupabaseStorageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
            ->assertJsonPath('data.counts.pending_archiving', 1);
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

        $coordinator = $this->user(['role' => 'coordinator']);
        $this->as($coordinator)->putJson('/api/research/'.$document->id.'/reviewers', [
            'reviewers' => [['reviewer_id' => $panelist->id, 'review_role' => 'panel']],
        ], $this->origin())->assertForbidden();

        $researcher = $this->user(['role' => 'researcher']);
        $this->as($researcher)->putJson('/api/research/'.$document->id.'/reviewers', [
            'reviewers' => [['reviewer_id' => $panelist->id, 'review_role' => 'panel']],
        ], $this->origin())->assertForbidden();
    }

    public function test_office_can_browse_and_open_supabase_institute_studies(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $storage = $this->createStub(SupabaseStorageService::class);
        $storage->method('studiesForInstitute')->willReturn([
            ['year' => '2025', 'title' => 'Sample Study'],
        ]);
        $storage->method('filesForStudy')->willReturn([
            ['name' => 'sample.pdf', 'path' => 'Institute of Computer Studies/2025/Sample Study/sample.pdf', 'extension' => 'pdf'],
            ['name' => 'appendix.docx', 'path' => 'Institute of Computer Studies/2025/Sample Study/appendix.docx', 'extension' => 'docx'],
        ]);
        $storage->method('download')->willReturnCallback(fn (string $path): string => str_ends_with($path, '.pdf') ? '%PDF-sample' : 'DOCX-sample');
        $this->app->instance(SupabaseStorageService::class, $storage);

        $this->as($office)->getJson('/api/office/institutes/ICS/studies')
            ->assertOk()
            ->assertJsonPath('data.0.title', 'Sample Study');
        $this->as($office)->get('/api/office/institutes/ICS/studies/2025/Sample%20Study/open')
            ->assertOk()
            ->assertSee('sample.pdf')
            ->assertSee('appendix.docx')
            ->assertSee('Download all manuscripts (.zip)');
        $this->as($office)->get('/api/office/institutes/ICS/studies/2025/Sample%20Study/open?file=sample.pdf')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('Content-Disposition', 'inline; filename="sample.pdf"')
            ->assertContent('%PDF-sample');
        $this->as($office)->get('/api/office/institutes/ICS/studies/2025/Sample%20Study/open?file=missing.pdf')
            ->assertNotFound();

        if (class_exists(\ZipArchive::class)) {
            $response = $this->as($office)->get('/api/office/institutes/ICS/studies/2025/Sample%20Study/download')
                ->assertOk()
                ->assertDownload('Sample Study.zip')
                ->assertHeader('content-type', 'application/zip');
            $archive = new \ZipArchive;
            $this->assertTrue($archive->open($response->baseResponse->getFile()->getPathname()) === true);
            $this->assertSame('%PDF-sample', $archive->getFromName('Sample Study/sample.pdf'));
            $this->assertSame('DOCX-sample', $archive->getFromName('Sample Study/appendix.docx'));
            $archive->close();
        }
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
