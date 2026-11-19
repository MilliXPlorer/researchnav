<?php

namespace Tests\Feature;

use App\Models\ResearchDocument;
use App\Services\ReportingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SdgReportingTest extends TestCase
{
    use RefreshDatabase;

    public function test_institutional_report_counts_each_alignment_and_excludes_deleted_research(): void
    {
        $active = ResearchDocument::factory()->create();
        $active->sdgs()->sync([4, 13]);
        $deleted = ResearchDocument::factory()->create();
        $deleted->sdgs()->sync([13]);
        $deleted->delete();

        $rows = collect(app(ReportingService::class)->officeInstitutional()['by_sdg'])->keyBy('id');

        $this->assertCount(17, $rows);
        $this->assertSame(1, $rows[4]['total']);
        $this->assertSame(1, $rows[13]['total']);
        $this->assertSame(0, $rows[17]['total']);
    }
}
