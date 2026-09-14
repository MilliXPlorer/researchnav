<?php

namespace Tests\Feature;

use App\Models\ClassSection;
use App\Models\MonitoringLog;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class MonitoringProgressUpdatesTest extends TestCase
{
    use RefreshDatabase;

    public function test_progress_updates_require_an_authenticated_adviser_or_instructor(): void
    {
        $this->getJson('/api/monitoring/progress-updates')
            ->assertUnauthorized()
            ->assertExactJson(['error' => 'AUTHENTICATION_REQUIRED']);

        $this->as($this->user(['role' => 'researcher']))
            ->getJson('/api/monitoring/progress-updates')
            ->assertForbidden()
            ->assertExactJson(['error' => 'ROLE_NOT_AUTHORIZED']);
    }

    public function test_adviser_progress_updates_are_assignment_scoped_filtered_ordered_and_capped(): void
    {
        $adviser = $this->user(['role' => 'adviser']);
        $office = $this->user(['role' => 'research-office']);
        $researcher = $this->user(['role' => 'researcher', 'first_name' => 'Rhea', 'last_name' => 'Search']);
        $assigned = $this->document();
        $secondAssigned = $this->document();
        $other = $this->document();
        $inactive = $this->document();
        $this->assign($office, $assigned, $adviser, 'adviser');
        $this->assign($office, $secondAssigned, $adviser, 'adviser');
        $inactive->reviewAssignments()->create([
            'reviewer_id' => $adviser->id,
            'assigned_by' => $office->id,
            'review_role' => 'adviser',
            'is_active' => false,
        ]);

        for ($index = 0; $index < 11; $index++) {
            MonitoringLog::query()->create([
                'research_document_id' => $assigned->id,
                'performed_by' => $researcher->id,
                'activity_type' => 'RESEARCHER_PROGRESS_REPORTED',
                'remarks' => "Progress {$index}",
                'monitoring_status' => 'on_track',
                'activity_date' => now()->subMinutes(10 - $index),
            ]);
            MonitoringLog::query()->create([
                'research_document_id' => $secondAssigned->id,
                'performed_by' => $researcher->id,
                'activity_type' => 'RESEARCHER_PROGRESS_REPORTED',
                'remarks' => "Second progress {$index}",
                'monitoring_status' => 'on_track',
                'activity_date' => now()->subMinutes(10 - $index),
            ]);
        }
        MonitoringLog::query()->create([
            'research_document_id' => $assigned->id,
            'performed_by' => $researcher->id,
            'activity_type' => 'RESEARCH_UPDATED',
            'remarks' => 'This is not a researcher progress update.',
            'activity_date' => now()->addMinute(),
        ]);
        MonitoringLog::query()->create([
            'research_document_id' => $other->id,
            'performed_by' => $researcher->id,
            'activity_type' => 'RESEARCHER_PROGRESS_REPORTED',
            'remarks' => 'Unassigned research.',
            'monitoring_status' => 'delayed',
            'activity_date' => now(),
        ]);
        MonitoringLog::query()->create([
            'research_document_id' => $inactive->id,
            'performed_by' => $researcher->id,
            'activity_type' => 'RESEARCHER_PROGRESS_REPORTED',
            'remarks' => 'Inactive assignment.',
            'monitoring_status' => 'on_track',
            'activity_date' => now(),
        ]);

        $response = $this->as($adviser)->getJson('/api/monitoring/progress-updates');
        $response
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonCount(2, 'data')
            ->assertJsonMissing(['remarks' => 'Progress 0'])
            ->assertJsonMissing(['remarks' => 'This is not a researcher progress update.'])
            ->assertJsonMissing(['research_document_id' => $other->id])
            ->assertJsonMissing(['research_document_id' => $inactive->id]);

        $folders = collect($response->json('data'))->keyBy('research_document_id');
        $this->assertCount(10, $folders->get($assigned->id)['progress_updates']);
        $this->assertCount(10, $folders->get($secondAssigned->id)['progress_updates']);
        $this->assertSame('Progress 10', $folders->get($assigned->id)['progress_updates'][0]['remarks']);
        $this->assertSame('Rhea Search', $folders->get($assigned->id)['progress_updates'][0]['performer_name']);
        $this->assertSame('on_track', $folders->get($assigned->id)['progress_updates'][0]['status']);
    }

    public function test_instructor_progress_updates_include_section_owned_research(): void
    {
        $instructor = $this->user(['role' => 'instructor']);
        $otherInstructor = $this->user(['role' => 'instructor']);
        $researcher = $this->user(['role' => 'researcher']);
        $ownedSection = ClassSection::query()->create(['instructor_id' => $instructor->id, 'name' => 'ICS 4A']);
        $otherSection = ClassSection::query()->create(['instructor_id' => $otherInstructor->id, 'name' => 'ICS 4B']);
        $owned = $this->document(['section_id' => $ownedSection->id]);
        $other = $this->document(['section_id' => $otherSection->id]);
        MonitoringLog::query()->create([
            'research_document_id' => $owned->id,
            'performed_by' => $researcher->id,
            'activity_type' => 'RESEARCHER_PROGRESS_REPORTED',
            'remarks' => 'Section-owned update.',
            'monitoring_status' => 'on_track',
            'activity_date' => now(),
        ]);

        $this->as($instructor)->getJson('/api/monitoring/progress-updates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $owned->id)
            ->assertJsonPath('data.0.progress_updates.0.remarks', 'Section-owned update.')
            ->assertJsonMissing(['research_document_id' => $other->id]);
    }

    public function test_adviser_and_instructor_queue_stage_filters_are_validated_and_exact(): void
    {
        $office = $this->user(['role' => 'research-office']);
        $adviser = $this->user(['role' => 'adviser']);
        $instructor = $this->user(['role' => 'instructor']);
        $proposal = $this->document(['research_stage' => 'title_proposal', 'submission_status' => 'submitted']);
        $manuscript = $this->document(['research_stage' => 'ongoing', 'submission_status' => 'submitted']);
        $this->assign($office, $proposal, $adviser, 'adviser');
        $this->assign($office, $manuscript, $adviser, 'adviser');
        $this->assign($office, $proposal, $instructor, 'instructor');
        $this->assign($office, $manuscript, $instructor, 'instructor');

        $this->as($adviser)->getJson('/api/adviser/pending-reviews?stage=title_proposal')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $proposal->id);
        $this->as($adviser)->getJson('/api/adviser/pending-reviews?stage=manuscript')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $manuscript->id);
        $this->as($adviser)->getJson('/api/adviser/pending-reviews?stage=invalid')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('stage');

        $this->as($instructor)->getJson('/api/instructor/submissions?stage=title_proposal')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $proposal->id);
        $this->as($instructor)->getJson('/api/instructor/submissions?stage=manuscript')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.research_document_id', $manuscript->id);
        $this->as($instructor)->getJson('/api/instructor/submissions?stage=invalid')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('stage');
    }

    private function assign(User $office, ResearchDocument $document, User $reviewer, string $role): void
    {
        $document->reviewAssignments()->create([
            'reviewer_id' => $reviewer->id,
            'assigned_by' => $office->id,
            'review_role' => $role,
            'is_active' => true,
        ]);
    }

    private function document(array $attributes = []): ResearchDocument
    {
        return ResearchDocument::factory()->create($attributes);
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
}
