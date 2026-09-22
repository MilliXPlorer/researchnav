<?php

namespace Tests\Feature;

use App\Models\FeedbackComment;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class FinalReviewStorageCompatibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_file_feedback_keeps_the_final_storage_document_file_column(): void
    {
        Schema::create('research_reviews', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->unsignedBigInteger('document_file_id')->nullable();
            $table->uuid('reviewer_id');
            $table->string('reviewer_role');
            $table->string('review_type');
            $table->text('remarks')->nullable();
            $table->string('status');
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('researcher_acknowledged_at')->nullable();
            $table->timestamp('researcher_addressed_at')->nullable();
            $table->longText('researcher_action_remarks')->nullable();
            $table->timestamps();
        });
        Schema::drop('feedback_comments');

        $feedback = new FeedbackComment;
        $feedback->fill([
            'research_document_id' => 10,
            'document_file_id' => 20,
            'user_id' => '9a06e340-f43d-4bf5-a654-ced7c251bf02',
            'reviewer_role' => 'adviser',
            'feedback_type' => 'suggestion',
            'comment' => 'Clarify this section.',
            'feedback_status' => 'open',
            'reviewed_at' => now(),
        ]);

        $this->assertSame(20, $feedback->document_file_id);
        $this->assertArrayHasKey('document_file_id', $feedback->getAttributes());
        $this->assertArrayNotHasKey('file_id', $feedback->getAttributes());

        $feedback->save();

        $this->assertDatabaseHas('research_reviews', [
            'id' => $feedback->id,
            'document_file_id' => 20,
            'reviewer_id' => '9a06e340-f43d-4bf5-a654-ced7c251bf02',
            'review_type' => 'suggestion',
            'remarks' => 'Clarify this section.',
            'status' => 'open',
        ]);
    }
}
