<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\DocumentFile;
use App\Models\ResearchAuthor;
use App\Models\ResearchDocument;
use App\Models\ResearchProjectTeamMember;
use App\Models\User;
use App\Services\ManuscriptSearchProjectionService;
use App\Services\OfficeRepositoryService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class OfficeRepositoryManagementTest extends TestCase
{
    use RefreshDatabase;

    public function createApplication(): Application
    {
        // The framework default infers the primary checkout from Composer's
        // first registered loader. Bootstrap this worktree explicitly instead.
        $app = require __DIR__.'/../../bootstrap/app.php';
        $app->instance('routes.cached', false);
        $app->make(Kernel::class)->bootstrap();
        $app['config']->set('app.key', 'base64:'.base64_encode(str_repeat('a', 32)));

        return $app;
    }

    public function test_only_the_five_office_repository_routes_have_the_required_middleware(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn ($route) => str_starts_with($route->uri(), 'api/office/repository'));

        $this->assertCount(5, $routes);
        $this->assertCount(1, $routes->filter(fn ($route) => in_array('GET', $route->methods(), true) && $route->uri() === 'api/office/repository'));
        $this->assertCount(1, $routes->filter(fn ($route) => in_array('GET', $route->methods(), true) && $route->uri() === 'api/office/repository/{researchDocument}'));
        $this->assertCount(1, $routes->filter(fn ($route) => in_array('PATCH', $route->methods(), true)));
        $this->assertCount(1, $routes->filter(fn ($route) => in_array('DELETE', $route->methods(), true)));
        $this->assertCount(1, $routes->filter(fn ($route) => in_array('POST', $route->methods(), true) && str_ends_with($route->uri(), '/restore')));

        foreach ($routes as $route) {
            $middleware = $route->gatherMiddleware();
            $this->assertContains('current.user', $middleware);
            $this->assertContains('account.active', $middleware);
            $this->assertContains('office.authority', $middleware);
            if (in_array($route->methods()[0], ['PATCH', 'DELETE', 'POST'], true)) {
                $this->assertContains('origin.allowed', $middleware);
                $this->assertContains('throttle:domain-mutations', $middleware);
            }

            if ($route->parameterNames() !== []) {
                $this->assertSame('[0-9]+', $route->wheres['researchDocument'] ?? null);
            }
        }
    }

    public function test_active_administrators_and_office_users_can_list_while_guests_inactive_and_foreign_roles_are_denied(): void
    {
        $this->document();
        $this->getJson('/api/office/repository')->assertUnauthorized()->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);

        foreach ([
            $this->actor('admin'),
            $this->actor('research-office'),
        ] as $actor) {
            $this->as($actor)->getJson('/api/office/repository')->assertOk()->assertJsonPath('schema_version', 1);
        }

        $inactive = $this->actor('research-office', ['access_status' => 'blocked']);
        $this->as($inactive)->getJson('/api/office/repository')->assertForbidden()->assertExactJson(['error' => 'ACCOUNT_ACCESS_PENDING']);
        foreach (['coordinator', 'researcher', 'adviser', 'instructor', 'panel', 'statistician', 'librarian', 'research_editor'] as $role) {
            $this->as($this->actor($role))->getJson('/api/office/repository')
                ->assertForbidden()
                ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
        }
    }

    public function test_buckets_filters_escaped_search_sort_and_pagination_are_exact_and_deterministic(): void
    {
        $ongoing = $this->document(['title' => '100% Complete_Study', 'archive_status' => 'not_archived', 'publication_year' => 2024]);
        $pending = $this->document([
            'title' => 'Pending record',
            'archive_status' => 'pending_archiving',
            'publication_year' => 2025,
            'institute' => 'Institute of Health Sciences',
            'degree_program' => 'Bachelor of Science in Midwifery',
        ]);
        $archived = $this->document(['title' => 'Archived record', 'archive_status' => 'archived', 'publication_year' => 2023]);
        $recycledArchived = $this->document(['title' => 'Recycled archived', 'archive_status' => 'archived']);
        $recycledArchived->delete();

        $office = $this->actor('research-office');
        $this->as($office)->getJson('/api/office/repository')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonMissing(['id' => $archived->id])
            ->assertJsonMissing(['id' => $recycledArchived->id]);
        $this->as($office)->getJson('/api/office/repository?bucket=archived')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $archived->id);
        $this->as($office)->getJson('/api/office/repository?bucket=recycle')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $recycledArchived->id);

        $this->as($office)->getJson('/api/office/repository?search=100%25%20Complete_Study')
            ->assertOk()
            ->assertJsonPath('data.0.id', $ongoing->id);
        $this->as($office)->getJson('/api/office/repository?search=100%25')
            ->assertOk()
            ->assertJsonCount(1, 'data');
        $this->as($office)->getJson('/api/office/repository?institute=Institute%20of%20Health%20Sciences')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $pending->id);
        $this->as($office)->getJson('/api/office/repository?publication_year=2025')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $pending->id);
        $this->as($office)->getJson('/api/office/repository?publication_year=2025&sort=publication_year&direction=asc&per_page=101')
            ->assertUnprocessable()
            ->assertJsonPath('error', 'VALIDATION_FAILED');
        $this->as($office)->getJson('/api/office/repository?publication_year=2025&sort=publication_year&direction=asc&per_page=1')
            ->assertOk()
            ->assertJsonPath('data.0.id', $pending->id)
            ->assertJsonPath('meta.per_page', 1)
            ->assertJsonPath('schema_version', 1);

        foreach ([
            ['bucket' => 'invalid'],
            ['search' => str_repeat('a', 201)],
            ['institute' => 'Unknown Institute'],
            ['publication_year' => 1900],
            ['sort' => 'archive_status'],
            ['direction' => 'sideways'],
            ['page' => 0],
            ['per_page' => 0],
        ] as $invalidQuery) {
            $this->as($office)->getJson('/api/office/repository?'.http_build_query($invalidQuery))
                ->assertUnprocessable()
                ->assertJsonPath('error', 'VALIDATION_FAILED');
        }
    }

    public function test_detail_resource_redacts_storage_locators_hashes_and_projection_data(): void
    {
        $document = $this->document(['archive_status' => 'archived', 'visibility' => 'public']);
        $file = $this->file($document, ['file_path' => 'research/'.$document->id.'/secret.pdf', 'stored_filename' => 'secret.pdf', 'relative_path' => 'private/subfolder', 'content_sha256' => str_repeat('a', 64)]);
        ResearchAuthor::query()->create(['research_document_id' => $document->id, 'author_name' => 'Repository Author', 'author_order' => 1]);
        $response = $this->as($this->actor('admin'))->getJson('/api/office/repository/'.$document->id)
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.files.0.id', $file->id)
            ->assertJsonPath('data.files.0.original_filename', 'manuscript.pdf')
            ->assertJsonPath('data.authors.0.author_name', 'Repository Author');

        $data = $response->json('data');
        $this->assertArrayNotHasKey('file_path', $data['files'][0]);
        $this->assertArrayNotHasKey('stored_filename', $data['files'][0]);
        $this->assertArrayNotHasKey('relative_path', $data['files'][0]);
        $this->assertArrayNotHasKey('content_sha256', $data['files'][0]);
        $this->assertArrayNotHasKey('manuscript_search_document', $data);
        $this->assertArrayNotHasKey('similarity_results', $data);
    }

    public function test_missing_ids_return_the_stable_not_found_error_for_each_detail_or_mutation_route(): void
    {
        $office = $this->actor('research-office');
        $missingId = 999999;

        $this->as($office)->getJson('/api/office/repository/'.$missingId)
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
        $this->as($office)->patchJson('/api/office/repository/'.$missingId, ['title' => 'Missing'], $this->origin())
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
        $this->as($office)->deleteJson('/api/office/repository/'.$missingId, [], $this->origin())
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
        $this->as($office)->postJson('/api/office/repository/'.$missingId.'/restore', [], $this->origin())
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
    }

    public function test_record_routes_reject_non_integer_and_overflowing_identifiers(): void
    {
        $office = $this->actor('research-office');

        $this->as($office)->getJson('/api/office/repository/1suffix')
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
        $this->as($office)->patchJson('/api/office/repository/1.5', ['title' => 'Nope'], $this->origin())
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
        $this->as($office)->deleteJson('/api/office/repository/'.str_repeat('9', 100), [], $this->origin())
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
        $this->as($office)->postJson('/api/office/repository/1e2/restore', [], $this->origin())
            ->assertNotFound()
            ->assertExactJson(['error' => 'NOT_FOUND']);
    }

    public function test_update_is_allowlisted_normalizes_title_syncs_sdgs_and_records_evidence(): void
    {
        $document = $this->document(['title' => 'Original title', 'import_source_sha256' => str_repeat('b', 64)]);
        $office = $this->actor('research-office');
        $secretPayload = 'Confidential manuscript text that must not enter audit descriptions.';
        $response = $this->as($office)->patchJson('/api/office/repository/'.$document->id, [
            'title' => 'An Updated: Title!',
            'abstract' => $secretPayload,
            'institute' => 'Institute of Computer Studies',
            'degree_program' => 'Bachelor of Science in Computer Science',
            'sdg_ids' => [1, 2],
        ], $this->origin());
        $response->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.normalized_title', 'an updated title')
            ->assertJsonPath('data.sdgs.0.id', 1);

        $document->refresh();
        $this->assertSame('Manually corrected by authorized Research Office personnel.', $document->abstract_provenance);
        $this->assertSame([1, 2], $document->sdgs()->pluck('sdgs.id')->all());
        $this->assertDatabaseHas('audit_logs', ['action' => 'OFFICE_REPOSITORY_UPDATED', 'entity_id' => (string) $document->id]);
        $this->assertDatabaseHas('monitoring_logs', ['activity_type' => 'OFFICE_REPOSITORY_UPDATED', 'research_document_id' => $document->id]);
        $auditDescription = AuditLog::query()
            ->where('action', 'OFFICE_REPOSITORY_UPDATED')
            ->where('entity_id', (string) $document->id)
            ->value('description');
        $this->assertSame("Updated repository metadata for {$document->submission_reference}.", $auditDescription);
        $this->assertStringNotContainsString($secretPayload, $auditDescription);

        $this->as($office)->patchJson('/api/office/repository/'.$document->id, ['visibility' => 'public'], $this->origin())
            ->assertUnprocessable()
            ->assertJsonPath('error', 'VALIDATION_FAILED');
        $this->as($office)->patchJson('/api/office/repository/'.$document->id, [
            'institute' => 'Institute of Computer Studies',
            'degree_program' => 'Bachelor of Science in Midwifery',
        ], $this->origin())->assertUnprocessable();
    }

    public function test_patch_only_revalidates_institute_program_when_the_pair_is_changed_and_rechecks_it_under_lock(): void
    {
        $office = $this->actor('research-office');
        $legacy = $this->document([
            'institute' => 'Legacy imported institute',
            'degree_program' => 'Legacy imported program',
        ]);

        $this->as($office)->patchJson('/api/office/repository/'.$legacy->id, ['title' => 'Corrected legacy title'], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.title', 'Corrected legacy title');
        $this->as($office)->patchJson('/api/office/repository/'.$legacy->id, ['institute' => 'Institute of Computer Studies'], $this->origin())
            ->assertUnprocessable()
            ->assertJsonPath('error', 'VALIDATION_FAILED');
        $this->as($office)->patchJson('/api/office/repository/'.$legacy->id, [
            'institute' => 'Institute of Computer Studies',
            'degree_program' => 'Bachelor of Science in Computer Science',
        ], $this->origin())->assertOk();

        $document = $this->document();
        try {
            app(OfficeRepositoryService::class)->update($office, $document->id, [
                'institute' => 'Institute of Health Sciences',
            ]);
            $this->fail('The locked effective institute/program pair must be validated.');
        } catch (ValidationException $exception) {
            $this->assertSame(['Select a program offered by the chosen institute.'], $exception->errors()['degree_program']);
        }
        $this->assertSame('Institute of Computer Studies', $document->fresh()->institute);
    }

    public function test_delete_and_restore_preserve_source_data_timestamps_and_lifecycle_fields(): void
    {
        $document = $this->document([
            'archive_status' => 'archived',
            'submission_status' => 'archived',
            'visibility' => 'public',
            'submitted_at' => now()->subDays(4),
            'approved_at' => now()->subDays(3),
            'archived_at' => now()->subDays(2),
            'import_source_sha256' => str_repeat('c', 64),
            'import_source_filename' => 'import-source.csv',
            'import_group_name' => 'Fall 2026 import',
        ]);
        $author = ResearchAuthor::query()->create(['research_document_id' => $document->id, 'author_name' => 'Preserved Author', 'author_order' => 1]);
        $file = $this->file($document, [
            'stored_filename' => 'opaque-preserved.pdf',
            'file_path' => 'research/'.$document->id.'/opaque-preserved.pdf',
            'relative_path' => 'private/preserved',
            'content_sha256' => str_repeat('d', 64),
        ]);
        Storage::fake('researchnav_private');
        Storage::disk('researchnav_private')->put((string) $file->file_path, 'preserved manuscript');
        $representative = $this->actor('research-office');
        $teamMembership = ResearchProjectTeamMember::query()->create([
            'research_document_id' => $document->id,
            'defense_type' => 'final',
            'user_id' => $representative->id,
            'team_role' => 'research_office_representative',
            'position' => 1,
            'assigned_by' => $representative->id,
        ]);
        $document->sdgs()->sync([3]);
        $before = $document->fresh()->only([
            'updated_at', 'submitted_at', 'approved_at', 'archived_at', 'import_source_sha256',
            'import_source_filename', 'import_group_name', 'submission_status', 'archive_status', 'visibility',
        ]);
        $office = $this->actor('research-office');

        $this->as($office)->deleteJson('/api/office/repository/'.$document->id, [], $this->origin())->assertNoContent();
        $trashed = ResearchDocument::onlyTrashed()->findOrFail($document->id);
        $this->assertNotNull($trashed->deleted_at);
        $this->assertSame($before['updated_at']->format('Y-m-d H:i:s.u'), $trashed->updated_at->format('Y-m-d H:i:s.u'));
        $this->assertDatabaseHas('research_authors', ['id' => $author->id, 'research_document_id' => $document->id]);
        $this->assertDatabaseHas('document_files', [
            'id' => $file->id,
            'research_document_id' => $document->id,
            'stored_filename' => 'opaque-preserved.pdf',
            'file_path' => 'research/'.$document->id.'/opaque-preserved.pdf',
            'relative_path' => 'private/preserved',
            'content_sha256' => str_repeat('d', 64),
        ]);
        Storage::disk('researchnav_private')->assertExists((string) $file->file_path);
        $this->assertDatabaseHas('research_project_team_members', [
            'id' => $teamMembership->id,
            'research_document_id' => $document->id,
            'user_id' => $representative->id,
            'team_role' => 'research_office_representative',
            'defense_type' => 'final',
        ]);
        $this->assertSame([3], $trashed->sdgs()->pluck('sdgs.id')->all());
        $this->assertDatabaseHas('audit_logs', ['action' => 'OFFICE_REPOSITORY_DELETED', 'entity_id' => (string) $document->id]);
        $this->assertDatabaseHas('monitoring_logs', ['activity_type' => 'OFFICE_REPOSITORY_DELETED', 'research_document_id' => $document->id]);
        $this->as($office)->deleteJson('/api/office/repository/'.$document->id, [], $this->origin())
            ->assertConflict()
            ->assertExactJson(['error' => 'REPOSITORY_RECORD_TRASHED']);
        $this->assertSame(1, AuditLog::query()->where('action', 'OFFICE_REPOSITORY_DELETED')->where('entity_id', (string) $document->id)->count());
        $this->as($office)->patchJson('/api/office/repository/'.$document->id, ['title' => 'Not allowed'], $this->origin())
            ->assertConflict()
            ->assertExactJson(['error' => 'REPOSITORY_RECORD_TRASHED']);

        $this->as($office)->postJson('/api/office/repository/'.$document->id.'/restore', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.deleted_at', null);
        $restored = $document->fresh();
        foreach (['updated_at', 'submitted_at', 'approved_at', 'archived_at'] as $field) {
            $this->assertSame($before[$field]->format('Y-m-d H:i:s.u'), $restored->{$field}->format('Y-m-d H:i:s.u'));
        }
        $this->assertSame($before['import_source_sha256'], $restored->import_source_sha256);
        $this->assertSame($before['import_source_filename'], $restored->import_source_filename);
        $this->assertSame($before['import_group_name'], $restored->import_group_name);
        $this->assertDatabaseHas('research_authors', ['id' => $author->id]);
        $this->assertDatabaseHas('document_files', [
            'id' => $file->id,
            'stored_filename' => 'opaque-preserved.pdf',
            'file_path' => 'research/'.$document->id.'/opaque-preserved.pdf',
            'relative_path' => 'private/preserved',
            'content_sha256' => str_repeat('d', 64),
        ]);
        Storage::disk('researchnav_private')->assertExists((string) $file->file_path);
        $this->assertDatabaseHas('research_project_team_members', [
            'id' => $teamMembership->id,
            'research_document_id' => $document->id,
            'user_id' => $representative->id,
            'team_role' => 'research_office_representative',
            'defense_type' => 'final',
        ]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'OFFICE_REPOSITORY_RESTORED', 'entity_id' => (string) $document->id]);
        $this->assertDatabaseHas('monitoring_logs', ['activity_type' => 'OFFICE_REPOSITORY_RESTORED', 'research_document_id' => $document->id]);
        $this->as($office)->postJson('/api/office/repository/'.$document->id.'/restore', [], $this->origin())
            ->assertConflict()
            ->assertExactJson(['error' => 'REPOSITORY_RECORD_NOT_TRASHED']);
        $this->assertSame(1, AuditLog::query()->where('action', 'OFFICE_REPOSITORY_RESTORED')->where('entity_id', (string) $document->id)->count());
    }

    public function test_delete_and_restore_accept_legacy_noncanonical_institute_program_metadata(): void
    {
        $document = $this->document([
            'institute' => 'Legacy imported institute',
            'degree_program' => 'Legacy imported program',
        ]);
        $office = $this->actor('research-office');

        $this->as($office)->deleteJson('/api/office/repository/'.$document->id, [], $this->origin())
            ->assertNoContent();
        $this->as($office)->postJson('/api/office/repository/'.$document->id.'/restore', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.institute', 'Legacy imported institute')
            ->assertJsonPath('data.degree_program', 'Legacy imported program');
    }

    public function test_restore_succeeds_when_best_effort_reindex_fails_and_no_permanent_delete_route_exists(): void
    {
        $document = $this->document(['archive_status' => 'archived', 'submission_status' => 'archived', 'visibility' => 'public']);
        $document->delete();
        $projection = Mockery::mock(ManuscriptSearchProjectionService::class);
        $projection->shouldReceive('reindex')->once()->with((int) $document->id, true, true)->andThrow(new RuntimeException('unavailable'));
        $this->app->instance(ManuscriptSearchProjectionService::class, $projection);

        $this->as($this->actor('admin'))->postJson('/api/office/repository/'.$document->id.'/restore', [], $this->origin())
            ->assertOk()
            ->assertJsonPath('data.id', $document->id);
        $this->assertNull($document->fresh()->deleted_at);
        $this->assertFalse(collect(Route::getRoutes()->getRoutes())->contains(fn ($route) => str_contains($route->uri(), 'office/repository') && in_array('DELETE', $route->methods(), true) && str_contains($route->uri(), 'permanent')));
    }

    public function test_eligible_reindex_runs_only_after_the_containing_transaction_commits_and_not_after_rollback(): void
    {
        $office = $this->actor('research-office');
        $document = $this->document(['archive_status' => 'archived', 'submission_status' => 'archived', 'visibility' => 'public']);
        $document->delete();
        $calls = 0;
        $projection = Mockery::mock(ManuscriptSearchProjectionService::class);
        $projection->shouldReceive('reindex')->once()->with((int) $document->id, true, true)->andReturnUsing(function () use (&$calls): void {
            $calls++;
        });
        $this->app->instance(ManuscriptSearchProjectionService::class, $projection);
        $service = app(OfficeRepositoryService::class);

        DB::transaction(function () use ($service, $office, $document, &$calls): void {
            $service->restore($office, $document->id);
            $this->assertSame(0, $calls);
        });
        $this->assertSame(1, $calls);

        $document->delete();
        try {
            DB::transaction(function () use ($service, $office, $document): void {
                $service->restore($office, $document->id);
                throw new RuntimeException('Force rollback.');
            });
        } catch (RuntimeException) {
            // The rollback is intentional; its callback must be discarded.
        }
        $this->assertSame(1, $calls);
        $this->assertNotNull(ResearchDocument::onlyTrashed()->find($document->id));
    }

    public function test_repository_queries_select_only_resource_columns_and_relation_keys(): void
    {
        $document = $this->document(['archive_status' => 'archived']);
        $this->file($document, ['file_path' => 'research/'.$document->id.'/private.pdf', 'content_sha256' => str_repeat('e', 64)]);
        ResearchAuthor::query()->create(['research_document_id' => $document->id, 'author_name' => 'Projected author', 'author_order' => 1]);
        $office = $this->actor('research-office');

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->as($office)->getJson('/api/office/repository?bucket=archived')->assertOk();
        $listQuery = collect(DB::getQueryLog())->pluck('query')->first(fn (string $query) => str_contains($query, 'select "id", "submission_reference"') && str_contains($query, 'from "research_documents"'));
        $this->assertNotNull($listQuery);
        $this->assertStringContainsString('select "id", "submission_reference", "title"', $listQuery);
        $this->assertStringNotContainsString('select *', strtolower($listQuery));

        DB::flushQueryLog();
        $this->as($office)->getJson('/api/office/repository/'.$document->id)->assertOk();
        $fileQuery = collect(DB::getQueryLog())->pluck('query')->first(fn (string $query) => str_contains($query, 'from "document_files"'));
        $this->assertNotNull($fileQuery);
        $this->assertStringContainsString('"research_document_id"', $fileQuery);
        $this->assertStringNotContainsString('"file_path"', $fileQuery);
        $this->assertStringNotContainsString('"content_sha256"', $fileQuery);
        DB::disableQueryLog();
    }

    /** @param array<string, mixed> $attributes */
    private function actor(string $role, array $attributes = []): User
    {
        return User::factory()->create(array_merge(['role' => $role, 'access_status' => 'active'], $attributes));
    }

    /** @param array<string, mixed> $attributes */
    private function document(array $attributes = []): ResearchDocument
    {
        $owner = $this->actor('researcher');

        return ResearchDocument::factory()->create(array_merge([
            'submitted_by' => $owner->id,
            'institute' => 'Institute of Computer Studies',
            'degree_program' => 'Bachelor of Science in Computer Science',
        ], $attributes));
    }

    /** @param array<string, mixed> $attributes */
    private function file(ResearchDocument $document, array $attributes = []): DocumentFile
    {
        return DocumentFile::query()->create(array_merge([
            'research_document_id' => $document->id,
            'uploaded_by' => $document->submitted_by,
            'document_type' => 'final_manuscript',
            'upload_purpose' => 'final_revision',
            'version_number' => 1,
            'original_filename' => 'manuscript.pdf',
            'stored_filename' => 'opaque.pdf',
            'file_path' => 'research/'.$document->id.'/opaque.pdf',
            'file_extension' => 'pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 123,
            'is_current' => true,
            'uploaded_at' => now(),
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
