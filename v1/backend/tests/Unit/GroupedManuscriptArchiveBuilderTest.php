<?php

namespace Tests\Unit;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Services\GroupedManuscriptArchiveBuilder;
use App\Services\GroupedManuscriptArchiveException;
use App\Services\PrivateDocumentFileResolver;
use Illuminate\Support\Collection;
use Tests\TestCase;

class GroupedManuscriptArchiveBuilderTest extends TestCase
{
    public function test_failed_archive_construction_removes_its_temporary_file(): void
    {
        $directory = storage_path('app/private/grouped-downloads');
        $before = glob($directory.'/researchnav-zip-*') ?: [];
        $resolver = new class extends PrivateDocumentFileResolver
        {
            public function __construct() {}

            public function resolve(ResearchDocument $research, DocumentFile $file): array
            {
                return ['path' => 'missing', 'absolute_path' => storage_path('app/private/missing.pdf'), 'size' => 1];
            }
        };

        try {
            (new GroupedManuscriptArchiveBuilder($resolver))->build(
                new ResearchDocument(['title' => 'Study']),
                new Collection([new DocumentFile(['original_filename' => 'manuscript.pdf', 'file_order' => 1])]),
            );
            $this->fail('Expected the archive builder to reject an unreadable source file.');
        } catch (GroupedManuscriptArchiveException) {
            $this->assertSame($before, glob($directory.'/researchnav-zip-*') ?: []);
        }
    }
}
