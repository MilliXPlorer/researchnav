<?php

namespace Tests\Feature;

use App\Http\Resources\PublicResearchDocumentResource;
use App\Http\Resources\ResearchDocumentResource;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class ResearchStudyImportCommandTest extends TestCase
{
    use RefreshDatabase;

    private string $fixtureRoot;

    private string $storageRoot;

    protected function setUp(): void
    {
        parent::setUp();

        $suffix = Str::uuid()->toString();
        $this->fixtureRoot = sys_get_temp_dir().DIRECTORY_SEPARATOR.'research-study-import-'.$suffix;
        $this->storageRoot = storage_path('framework/testing/research-study-import-'.$suffix);
        config()->set('filesystems.disks.researchnav_private.root', $this->storageRoot);
        File::ensureDirectoryExists($this->fixtureRoot);
        File::ensureDirectoryExists($this->storageRoot);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->fixtureRoot);
        File::deleteDirectory($this->storageRoot);

        parent::tearDown();
    }

    public function test_default_source_is_the_private_backend_import_directory(): void
    {
        $expected = storage_path('app/private/research_studies/ics');

        $this->assertSame($expected, config('researchnav.research_study_import_source'));
    }

    public function test_it_imports_the_validated_ten_study_catalog_idempotently(): void
    {
        $source = $this->createFixture();
        $owner = User::factory()->create(['email' => 'owner@example.test', 'access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('Imported: 10; updated: 0; skipped duplicate files: 1.')
            ->assertSuccessful();

        $this->assertDatabaseCount('research_documents', 10);
        $this->assertDatabaseCount('research_authors', 20);
        $this->assertDatabaseCount('document_files', 10);
        $this->assertDatabaseCount('monitoring_logs', 10);
        $this->assertDatabaseCount('audit_logs', 10);

        $document = ResearchDocument::query()->where('title', 'Study 1')->firstOrFail();
        $this->assertSame($owner->id, $document->submitted_by);
        $this->assertSame('ongoing', $document->research_stage);
        $this->assertSame('archived', $document->submission_status);
        $this->assertSame('archived', $document->archive_status);
        $this->assertSame('public', $document->visibility);
        $this->assertNull($document->submitted_at);
        $this->assertNull($document->approved_at);
        $this->assertNotNull($document->archived_at);
        $this->assertSame(hash_file('sha256', $source.DIRECTORY_SEPARATOR.'study-1.docx'), $document->import_source_sha256);
        $this->assertSame('study-1.docx', $document->import_source_filename);
        $this->assertSame(['Author 1A', 'Author 1B'], $document->authors()->orderBy('author_order')->pluck('author_name')->all());
        $this->assertSame([false, false], $document->authors()->orderBy('author_order')->pluck('is_corresponding_author')->map(fn ($value): bool => (bool) $value)->all());

        $file = $document->files()->firstOrFail();
        $this->assertSame('draft', $file->document_type);
        $this->assertSame(1, $file->version_number);
        $this->assertTrue($file->is_current);
        $this->assertSame('study-1.docx', $file->original_filename);
        $this->assertSame($document->import_source_sha256, pathinfo($file->stored_filename, PATHINFO_FILENAME));
        $this->assertTrue(Storage::disk('researchnav_private')->exists($file->file_path));

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('Imported: 0; updated: 10; skipped duplicate files: 1.')
            ->assertSuccessful();

        $this->assertDatabaseCount('research_documents', 10);
        $this->assertDatabaseCount('research_authors', 20);
        $this->assertDatabaseCount('document_files', 10);
        $this->assertDatabaseCount('monitoring_logs', 10);
        $this->assertDatabaseCount('audit_logs', 10);
    }

    public function test_imported_manuscripts_are_available_only_to_repository_office_accounts(): void
    {
        $source = $this->createFixture();
        $owner = User::factory()->create(['email' => 'owner@example.test', 'access_status' => 'active']);
        $viewer = User::factory()->create(['access_status' => 'active']);
        $office = User::factory()->create(['role' => 'research-office', 'access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])->assertSuccessful();

        $document = ResearchDocument::query()->where('title', 'Study 1')->firstOrFail();
        $file = $document->files()->firstOrFail();
        $filesUrl = '/api/research/'.$document->id.'/files';
        $downloadUrl = $filesUrl.'/'.$file->id.'/download';

        foreach ([$owner, $viewer] as $actor) {
            $this->withSession(['user_id' => $actor->id])->getJson('/api/research/'.$document->id)->assertOk()->assertJsonMissingPath('data.files');
            $this->withSession(['user_id' => $actor->id])->getJson($filesUrl)->assertOk()->assertExactJson(['data' => []]);
            $this->withSession(['user_id' => $actor->id])->getJson($downloadUrl)->assertForbidden();
        }

        $this->withSession(['user_id' => $office->id])->getJson($filesUrl)->assertOk()->assertJsonCount(1, 'data');
        $this->withSession(['user_id' => $office->id])->get($downloadUrl)->assertDownload('study-1.docx');
    }

    public function test_it_rejects_title_collisions_without_overwriting_existing_documents(): void
    {
        $source = $this->createFixture();
        $owner = User::factory()->create(['access_status' => 'active']);
        $existing = ResearchDocument::factory()->create(['title' => 'Study 1', 'submitted_by' => $owner->id]);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import cannot overwrite an existing study with the same title.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 1);
        $this->assertDatabaseHas('research_documents', ['id' => $existing->id, 'title' => 'Study 1', 'submission_status' => 'draft']);
    }

    public function test_it_rejects_reruns_with_a_different_owner_without_changing_ownership(): void
    {
        $source = $this->createFixture();
        $owner = User::factory()->create(['email' => 'owner@example.test', 'access_status' => 'active']);
        $otherOwner = User::factory()->create(['email' => 'other-owner@example.test', 'access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])->assertSuccessful();
        $this->artisan('research:import-studies', ['--owner' => $otherOwner->email, '--source' => $source])
            ->expectsOutput('The import owner must match the existing imported study owner.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 10);
        $this->assertDatabaseHas('research_documents', ['title' => 'Study 1', 'submitted_by' => $owner->id]);
    }

    public function test_it_rejects_checksum_matched_reruns_when_another_document_claims_the_changed_title(): void
    {
        $source = $this->createFixture();
        $owner = User::factory()->create(['email' => 'owner@example.test', 'access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])->assertSuccessful();
        $imported = ResearchDocument::query()->where('title', 'Study 1')->firstOrFail();
        $catalog = json_decode((string) file_get_contents($source.DIRECTORY_SEPARATOR.'catalog.json'), true, 512, JSON_THROW_ON_ERROR);
        $catalog['studies'][0]['title'] = 'Study 1 Revised';
        file_put_contents($source.DIRECTORY_SEPARATOR.'catalog.json', json_encode($catalog, JSON_THROW_ON_ERROR));
        $conflict = ResearchDocument::factory()->create([
            'title' => 'A different title',
            'normalized_title' => 'study 1 revised',
            'submitted_by' => $owner->id,
        ]);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import cannot overwrite an existing study with the same title.')
            ->assertFailed();

        $this->assertSame('Study 1', $imported->fresh()->title);
        $this->assertSame('study 1', $imported->fresh()->normalized_title);
        $this->assertSame('A different title', $conflict->fresh()->title);
    }

    public function test_it_rejects_source_identity_changes_without_superseding_the_original_import(): void
    {
        $source = $this->createFixture();
        $owner = User::factory()->create(['email' => 'owner@example.test', 'access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])->assertSuccessful();
        $original = ResearchDocument::query()->where('title', 'Study 1')->firstOrFail();
        $replacement = $this->writeMinimalDocx($source.DIRECTORY_SEPARATOR.'study-1.docx', 'Study 1 revised');
        $catalog = json_decode((string) file_get_contents($source.DIRECTORY_SEPARATOR.'catalog.json'), true, 512, JSON_THROW_ON_ERROR);
        $catalog['studies'][0]['source_sha256'] = hash('sha256', $replacement);
        file_put_contents($source.DIRECTORY_SEPARATOR.'catalog.json', json_encode($catalog, JSON_THROW_ON_ERROR));

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import cannot overwrite an existing study with the same title.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 10);
        $this->assertSame($original->import_source_sha256, $original->fresh()->import_source_sha256);
        $this->assertSame('study-1.docx', $original->fresh()->import_source_filename);
    }

    public function test_it_rejects_unknown_source_files_before_writing_the_database(): void
    {
        $source = $this->createFixture();
        file_put_contents($source.DIRECTORY_SEPARATOR.'unlisted.docx', 'unlisted');
        $owner = User::factory()->create(['access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import source contains an unlisted or missing DOCX file.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 0);
    }

    public function test_it_rejects_checksum_mismatches_before_writing_the_database(): void
    {
        $source = $this->createFixture();
        file_put_contents($source.DIRECTORY_SEPARATOR.'study-1.docx', 'changed');
        $owner = User::factory()->create(['access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import source DOCX checksum does not match the catalog.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 0);
    }

    public function test_it_rejects_malformed_docx_files_even_when_the_checksum_matches(): void
    {
        $source = $this->createFixture();
        $contents = 'renamed plain text file';
        file_put_contents($source.DIRECTORY_SEPARATOR.'study-1.docx', $contents);
        $catalog = json_decode((string) file_get_contents($source.DIRECTORY_SEPARATOR.'catalog.json'), true, 512, JSON_THROW_ON_ERROR);
        $catalog['studies'][0]['source_sha256'] = hash('sha256', $contents);
        file_put_contents($source.DIRECTORY_SEPARATOR.'catalog.json', json_encode($catalog, JSON_THROW_ON_ERROR));
        $owner = User::factory()->create(['access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import source DOCX is not a valid OOXML document.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 0);
    }

    public function test_it_rejects_malformed_ooxml_xml_even_when_the_checksum_matches(): void
    {
        $source = $this->createFixture();
        $contents = $this->writeOoxmlPackage(
            $source.DIRECTORY_SEPARATOR.'study-1.docx',
            $this->contentTypesXml(),
            $this->relationshipsXml(),
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
        );
        $this->replaceSourceHash($source, $contents);
        $owner = User::factory()->create(['access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import source DOCX is not a valid OOXML document.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 0);
    }

    public function test_it_rejects_wrong_ooxml_main_document_content_types_even_when_the_checksum_matches(): void
    {
        $source = $this->createFixture();
        $contents = $this->writeOoxmlPackage(
            $source.DIRECTORY_SEPARATOR.'study-1.docx',
            $this->contentTypesXml('application/octet-stream'),
            $this->relationshipsXml(),
            $this->documentXml('Study 1'),
        );
        $this->replaceSourceHash($source, $contents);
        $owner = User::factory()->create(['access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import source DOCX is not a valid OOXML document.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 0);
    }

    public function test_it_rejects_symlinked_catalog_and_docx_paths_when_supported(): void
    {
        $source = $this->createFixture();
        $owner = User::factory()->create(['access_status' => 'active']);
        $catalogPath = $source.DIRECTORY_SEPARATOR.'catalog.json';
        $catalogTarget = $this->fixtureRoot.DIRECTORY_SEPARATOR.'catalog-target.json';
        rename($catalogPath, $catalogTarget);
        if (! function_exists('symlink') || ! @symlink($catalogTarget, $catalogPath)) {
            $this->markTestSkipped('Symbolic links are not available in this environment.');
        }

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import catalog must not be a symbolic link.')
            ->assertFailed();

        unlink($catalogPath);
        rename($catalogTarget, $catalogPath);
        $docxPath = $source.DIRECTORY_SEPARATOR.'study-1.docx';
        $docxTarget = $this->fixtureRoot.DIRECTORY_SEPARATOR.'outside.docx';
        copy($docxPath, $docxTarget);
        unlink($docxPath);
        if (! @symlink($docxTarget, $docxPath)) {
            $this->markTestSkipped('Symbolic links are not available in this environment.');
        }

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import source DOCX files must not be symbolic links.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 0);
    }

    public function test_it_requires_exactly_ten_studies(): void
    {
        $source = $this->createFixture();
        $catalog = json_decode((string) file_get_contents($source.DIRECTORY_SEPARATOR.'catalog.json'), true, 512, JSON_THROW_ON_ERROR);
        array_pop($catalog['studies']);
        file_put_contents($source.DIRECTORY_SEPARATOR.'catalog.json', json_encode($catalog, JSON_THROW_ON_ERROR));
        $owner = User::factory()->create(['access_status' => 'active']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import catalog must be version 1 with exactly ten studies.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 0);
    }

    public function test_it_requires_an_active_existing_owner(): void
    {
        $source = $this->createFixture();
        $owner = User::factory()->create(['account_status' => 'inactive']);

        $this->artisan('research:import-studies', ['--owner' => $owner->email, '--source' => $source])
            ->expectsOutput('The import owner must be an active existing account.')
            ->assertFailed();

        $this->assertDatabaseCount('research_documents', 0);
    }

    public function test_public_and_internal_resources_expose_import_metadata_without_file_paths(): void
    {
        $document = ResearchDocument::factory()->create([
            'institution_name' => 'Tangub City Global College',
            'institution_location' => 'Tangub City',
            'academic_unit' => 'Institute of Computer Studies',
            'degree_program' => 'Bachelor of Science in Computer Science',
            'manuscript_date_label' => 'May 2026',
            'abstract_provenance' => 'Synthesized from source manuscript.',
        ]);

        $public = (new PublicResearchDocumentResource($document))->resolve(new Request);
        $internal = (new ResearchDocumentResource($document))->resolve(new Request);

        foreach ([$public, $internal] as $resource) {
            $this->assertSame('Tangub City Global College', $resource['institution_name']);
            $this->assertSame('Tangub City', $resource['institution_location']);
            $this->assertSame('Institute of Computer Studies', $resource['academic_unit']);
            $this->assertSame('Bachelor of Science in Computer Science', $resource['degree_program']);
            $this->assertSame('May 2026', $resource['manuscript_date_label']);
            $this->assertSame('Synthesized from source manuscript.', $resource['abstract_provenance']);
            $this->assertArrayNotHasKey('file_path', $resource);
            $this->assertArrayNotHasKey('import_source_sha256', $resource);
            $this->assertArrayNotHasKey('import_source_filename', $resource);
        }
    }

    private function createFixture(): string
    {
        $source = $this->fixtureRoot.DIRECTORY_SEPARATOR.'source';
        File::ensureDirectoryExists($source);
        $studies = [];
        for ($number = 1; $number <= 10; $number++) {
            $filename = "study-{$number}.docx";
            $contents = $this->writeMinimalDocx($source.DIRECTORY_SEPARATOR.$filename, "Study {$number}");
            $study = [
                'source_filename' => $filename,
                'source_sha256' => hash('sha256', $contents),
                'title' => "Study {$number}",
                'authors' => ["Author {$number}A", "Author {$number}B"],
                'institution_name' => 'Tangub City Global College',
                'institution_location' => 'Tangub City',
                'academic_unit' => 'Institute of Computer Studies',
                'degree_program' => 'Bachelor of Science in Computer Science',
                'manuscript_date_label' => 'May 2026',
                'publication_year' => 2026,
                'research_stage' => $number === 1 ? 'ongoing' : 'title_proposal',
                'category' => [
                    'name' => 'Institutional Information Systems',
                    'slug' => 'institutional-information-systems',
                    'description' => 'Information systems for institutional services and records.',
                ],
                'abstract_provenance' => 'Synthesized from source manuscript.',
                'abstract' => trim(str_repeat('word ', 100)),
                'keywords' => ['repository', 'research'],
            ];
            if ($number === 2) {
                $duplicate = 'study-2-copy.docx';
                file_put_contents($source.DIRECTORY_SEPARATOR.$duplicate, $contents);
                $study['duplicate_filenames'] = [$duplicate];
            }
            $studies[] = $study;
        }
        file_put_contents($source.DIRECTORY_SEPARATOR.'catalog.json', json_encode(['version' => 1, 'studies' => $studies], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));

        return $source;
    }

    private function writeMinimalDocx(string $path, string $text): string
    {
        return $this->writeOoxmlPackage($path, $this->contentTypesXml(), $this->relationshipsXml(), $this->documentXml($text));
    }

    private function writeOoxmlPackage(string $path, string $contentTypes, string $relationships, string $document): string
    {
        $archive = new \ZipArchive;
        $this->assertSame(true, $archive->open($path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE));
        $archive->addFromString('[Content_Types].xml', $contentTypes);
        $archive->addFromString('_rels/.rels', $relationships);
        $archive->addFromString('word/document.xml', $document);
        $archive->close();

        return (string) file_get_contents($path);
    }

    private function contentTypesXml(string $mainDocumentMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="'.$mainDocumentMime.'"/></Types>';
    }

    private function relationshipsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    }

    private function documentXml(string $text): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'.htmlspecialchars($text, ENT_XML1).'</w:t></w:r></w:p></w:body></w:document>';
    }

    private function replaceSourceHash(string $source, string $contents): void
    {
        $catalogPath = $source.DIRECTORY_SEPARATOR.'catalog.json';
        $catalog = json_decode((string) file_get_contents($catalogPath), true, 512, JSON_THROW_ON_ERROR);
        $catalog['studies'][0]['source_sha256'] = hash('sha256', $contents);
        file_put_contents($catalogPath, json_encode($catalog, JSON_THROW_ON_ERROR));
    }
}
