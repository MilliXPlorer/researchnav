<?php

namespace Tests\Feature\Database;

use App\Models\DocumentFile;
use App\Models\ResearchDocument;
use App\Models\SimilarityResult;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use InvalidArgumentException;
use Tests\TestCase;

class CanonicalResearchSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_canonical_tables_and_user_adoption_columns_are_migrated(): void
    {
        foreach ([
            'user_roles', 'users', 'categories', 'research_documents', 'research_authors', 'document_files',
            'similarity_results', 'feedback_comments', 'revisions', 'monitoring_logs', 'notifications',
            'title_validations', 'audit_logs',
        ] as $table) {
            $this->assertTrue(Schema::hasTable($table), $table.' was not migrated.');
        }

        $this->assertTrue(Schema::hasColumns('users', [
            'id', 'role_id', 'student_employee_id', 'first_name', 'middle_name', 'last_name', 'password',
            'account_status', 'email_verified_at', 'remember_token', 'deleted_at', 'role', 'access_status',
        ]));
        $this->assertFalse(Schema::hasTable('app_users'));
        $this->assertSame(8, UserRole::query()->count());

        $this->assertTrue(Schema::hasColumns('similarity_results', [
            'source_title', 'matched_title', 'tfidf_score', 'cosine_score', 'fasttext_score',
            'final_similarity_score', 'threshold', 'is_flagged', 'contextual_analysis', 'matched_terms',
            'analysis_type', 'analyzed_at',
        ]));
        $this->assertFalse(Schema::hasColumn('similarity_results', 'source_title_snapshot'));
        $this->assertTrue(Schema::hasColumns('document_files', ['file_extension', 'file_size', 'version_number']));
        $this->assertFalse(Schema::hasColumn('document_files', 'extension'));
        $this->assertTrue(Schema::hasColumns('feedback_comments', ['feedback_type', 'feedback_status']));
        $this->assertFalse(Schema::hasColumn('feedback_comments', 'resolved_at'));
        $this->assertTrue(Schema::hasColumns('revisions', [
            'research_document_id', 'requested_by', 'document_file_id', 'revision_number', 'revision_remarks',
            'revision_status', 'requested_at', 'submitted_at', 'resolved_at',
        ]));
        $this->assertTrue(Schema::hasColumns('monitoring_logs', [
            'research_document_id', 'performed_by', 'activity_type', 'remarks', 'previous_status', 'new_status',
            'monitoring_status', 'activity_date', 'created_at',
        ]));
        $this->assertFalse(Schema::hasColumn('monitoring_logs', 'updated_at'));
        $this->assertTrue(Schema::hasColumns('title_validations', [
            'research_document_id', 'similarity_result_id', 'validated_by', 'validation_status', 'adviser_remarks',
            'validated_at',
        ]));
        $this->assertTrue(Schema::hasColumns('audit_logs', [
            'user_id', 'action', 'entity_type', 'entity_id', 'description', 'ip_address', 'user_agent', 'created_at',
        ]));
    }

    public function test_new_user_writes_keep_canonical_and_legacy_access_fields_in_sync(): void
    {
        $user = User::query()->create([
            'email' => 'canonical@example.test',
            'role' => 'instructor',
            'access_status' => 'active',
        ]);

        $this->assertSame(UserRole::RESEARCH_INSTRUCTOR, $user->roleDefinition->slug);
        $this->assertSame('active', $user->account_status);
        $this->assertSame('instructor', $user->role);
    }

    public function test_all_legacy_role_mappings_and_admin_demotion_are_explicit(): void
    {
        $expected = [
            'admin' => UserRole::ADMINISTRATOR,
            'researcher' => UserRole::RESEARCHER,
            'adviser' => UserRole::RESEARCH_ADVISER,
            'instructor' => UserRole::RESEARCH_INSTRUCTOR,
            'panel' => UserRole::RESEARCH_PANELIST,
            'statistician' => UserRole::STATISTICIAN,
            'coordinator' => UserRole::RESEARCH_OFFICE,
            'librarian' => UserRole::LIBRARIAN,
            'research-office' => UserRole::RESEARCH_OFFICE,
            'academics' => UserRole::RESEARCH_OFFICE,
        ];

        foreach ($expected as $legacyRole => $canonicalRole) {
            $this->assertSame($canonicalRole, User::canonicalSlugForLegacyRole($legacyRole));
        }

        $admin = User::factory()->create(['role' => 'admin']);
        $this->assertTrue($admin->is_admin);
        $admin->role = 'researcher';
        $admin->save();
        $this->assertFalse($admin->fresh()->is_admin);

        $admin->role_id = UserRole::query()->where('slug', UserRole::RESEARCH_OFFICE)->value('id');
        $admin->save();
        $this->assertSame('research-office', $admin->fresh()->role);
        $this->assertFalse($admin->fresh()->is_admin);
    }

    public function test_similarity_flag_is_derived_from_the_normalized_final_score(): void
    {
        $user = User::factory()->create();
        $source = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $match = ResearchDocument::factory()->create(['submitted_by' => $user->id]);

        $result = SimilarityResult::query()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $match->id,
            'source_title' => $source->title,
            'matched_title' => $match->title,
            'cosine_score' => '0.700000',
            'final_similarity_score' => '0.700000',
            'analysis_type' => 'title',
            'analyzed_at' => now(),
            'is_flagged' => false,
        ]);

        $this->assertTrue($result->fresh()->is_flagged);
    }

    public function test_similarity_flags_use_the_threshold_and_reject_self_matches(): void
    {
        $user = User::factory()->create();
        $source = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $match = ResearchDocument::factory()->create(['submitted_by' => $user->id]);

        foreach ([['0.699900', false], ['0.700000', true], ['0.750000', true]] as [$score, $flagged]) {
            $result = SimilarityResult::factory()->create([
                'source_research_id' => $source->id,
                'matched_research_id' => $match->id,
                'final_similarity_score' => $score,
                'threshold' => '0.700000',
            ]);
            $this->assertSame($flagged, $result->fresh()->is_flagged);
        }

        $this->expectException(InvalidArgumentException::class);
        SimilarityResult::factory()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $source->id,
        ]);
    }

    public function test_requested_model_relationships_are_available(): void
    {
        $user = User::factory()->create();
        $document = ResearchDocument::factory()->create(['submitted_by' => $user->id]);

        $this->assertInstanceOf(HasMany::class, $user->uploadedFiles());
        $this->assertInstanceOf(HasMany::class, $user->feedbackComments());
        $this->assertInstanceOf(HasMany::class, $user->requestedRevisions());
        $this->assertInstanceOf(HasMany::class, $user->monitoringLogs());
        $this->assertInstanceOf(HasMany::class, $user->titleValidations());
        $this->assertInstanceOf(HasMany::class, $user->auditLogs());
        $this->assertInstanceOf(HasMany::class, $document->monitoringLogs());
    }

    public function test_document_file_versions_must_start_at_one(): void
    {
        $user = User::factory()->create();
        $document = ResearchDocument::factory()->create(['submitted_by' => $user->id]);

        $this->expectException(InvalidArgumentException::class);
        DocumentFile::query()->create([
            'research_document_id' => $document->id,
            'uploaded_by' => $user->id,
            'document_type' => 'draft',
            'version_number' => 0,
            'original_filename' => 'draft.pdf',
            'stored_filename' => 'draft.pdf',
            'file_path' => 'documents/draft.pdf',
            'uploaded_at' => now(),
        ]);
    }
}
