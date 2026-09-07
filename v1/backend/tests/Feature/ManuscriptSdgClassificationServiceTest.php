<?php

namespace Tests\Feature;

use App\Models\ManuscriptSearchDocument;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Services\ManuscriptSdgClassificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Tests\TestCase;

class ManuscriptSdgClassificationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_classifies_only_the_current_persisted_ready_body_and_persists_no_evidence(): void
    {
        config()->set('researchnav.sdg.detector_version', 'test-detector/1');
        $projection = $this->projection('SDGs 4, 13 and 4');
        $projection->body_text = 'SDG 1';

        $classification = app(ManuscriptSdgClassificationService::class)->classify($projection);

        $this->assertSame('test-detector/1', $classification->detector_version);
        $this->assertSame([4, 13], $classification->detections->sortBy('sdg_number')->pluck('sdg_number')->all());
        $this->assertSame(
            ['id', 'manuscript_search_document_id', 'detector_version', 'projection_indexed_at', 'classified_at', 'created_at', 'updated_at'],
            array_keys($classification->getAttributes()),
        );
        $this->assertSame(
            ['id', 'manuscript_sdg_classification_id', 'sdg_number', 'created_at', 'updated_at'],
            array_keys($classification->detections->first()->getAttributes()),
        );
        $this->assertTrue(app(ManuscriptSdgClassificationService::class)->isCurrent($projection));
    }

    public function test_it_persists_a_complete_zero_detection_result(): void
    {
        $projection = $this->projection('Climate action is a topic, not a declaration.');

        $classification = app(ManuscriptSdgClassificationService::class)->classify($projection);

        $this->assertDatabaseHas('manuscript_sdg_classifications', ['id' => $classification->id]);
        $this->assertDatabaseCount('manuscript_sdg_detections', 0);
        $this->assertTrue(app(ManuscriptSdgClassificationService::class)->isCurrent($projection));
    }

    public function test_reclassification_replaces_the_detection_set_and_tracks_freshness(): void
    {
        $service = app(ManuscriptSdgClassificationService::class);
        $projection = $this->projection('SDG 4');
        $firstClassification = $service->classify($projection);

        $projection->update([
            'body_text' => 'SDGs 3 and 13',
            'indexed_at' => now()->addSecond(),
        ]);

        $this->assertFalse($service->isCurrent($projection));
        $classification = $service->classify($projection);

        $this->assertSame($firstClassification->id, $classification->id);
        $this->assertSame([3, 13], $classification->detections->sortBy('sdg_number')->pluck('sdg_number')->all());
        $this->assertDatabaseCount('manuscript_sdg_detections', 2);
        $this->assertTrue($service->isCurrent($projection));
    }

    public function test_detector_version_changes_make_a_ready_classification_stale(): void
    {
        $service = app(ManuscriptSdgClassificationService::class);
        $projection = $this->projection('SDG 4');
        $service->classify($projection);

        config()->set('researchnav.sdg.detector_version', 'test-detector/2');

        $this->assertFalse($service->isCurrent($projection));
        $this->assertSame('test-detector/2', $service->classify($projection)->detector_version);
        $this->assertTrue($service->isCurrent($projection));
    }

    public function test_it_rejects_a_non_ready_projection(): void
    {
        $service = app(ManuscriptSdgClassificationService::class);
        $projection = $this->projection('SDG 4', 'failed');

        $this->expectException(InvalidArgumentException::class);
        $service->classify($projection);
    }

    public function test_it_rejects_an_unpersisted_projection(): void
    {
        $this->expectException(InvalidArgumentException::class);

        app(ManuscriptSdgClassificationService::class)->classify(new ManuscriptSearchDocument([
            'body_text' => 'SDG 4',
            'extraction_status' => 'ready',
            'indexed_at' => now(),
        ]));
    }

    public function test_invalidation_removes_the_classification_and_its_detections(): void
    {
        $service = app(ManuscriptSdgClassificationService::class);
        $projection = $this->projection('SDG 4');
        $classification = $service->classify($projection);

        $service->invalidate($projection);

        $this->assertDatabaseMissing('manuscript_sdg_classifications', ['id' => $classification->id]);
        $this->assertDatabaseCount('manuscript_sdg_detections', 0);
        $this->assertFalse($service->isCurrent($projection));
    }

    private function projection(string $bodyText, string $status = 'ready'): ManuscriptSearchDocument
    {
        $user = User::factory()->create();
        $document = ResearchDocument::factory()->create(['submitted_by' => $user->id]);

        return ManuscriptSearchDocument::query()->create([
            'research_document_id' => $document->id,
            'body_text' => $status === 'ready' ? $bodyText : null,
            'body_text_bytes' => $status === 'ready' ? strlen($bodyText) : null,
            'body_text_chars' => $status === 'ready' ? mb_strlen($bodyText) : null,
            'extraction_status' => $status,
            'indexed_at' => $status === 'ready' ? now() : null,
        ]);
    }
}
