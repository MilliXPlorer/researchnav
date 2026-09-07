<?php

namespace Tests\Feature\Database;

use App\Http\Resources\SimilarityResultResource;
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
            'title_validations', 'audit_logs', 'research_review_assignments', 'class_sections',
            'class_section_members', 'defense_schedules', 'evaluations', 'methodology_reviews',
            'compliance_reviews', 'metadata_reviews', 'saved_library_items', 'retention_logs', 'privacy_logs',
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
            'source_title', 'matched_title', 'tfidf_score', 'title_similarity_score',
            'content_similarity_score', 'score_status', 'cosine_score', 'fasttext_score',
            'final_similarity_score', 'threshold', 'is_flagged', 'title_weight', 'content_weight',
            'overall_similarity_score', 'classification', 'overall_flagged', 'title_match_alert',
            'adviser_review_required', 'flag_reason', 'contextual_analysis', 'matched_terms',
            'analysis_type', 'algorithm_version', 'source_content_sha256', 'matched_content_sha256', 'analyzed_at',
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
        $this->assertTrue(Schema::hasColumn('research_documents', 'section_id'));
        $this->assertTrue(Schema::hasColumns('class_sections', ['instructor_id', 'name', 'academic_year', 'is_active']));
        $this->assertTrue(Schema::hasColumns('class_section_members', ['class_section_id', 'research_document_id', 'user_id']));
        $this->assertTrue(Schema::hasColumns('defense_schedules', ['research_document_id', 'created_by', 'scheduled_at', 'status']));
        $this->assertTrue(Schema::hasColumns('evaluations', ['research_document_id', 'panelist_id', 'originality', 'methodology', 'clarity', 'submitted_at']));
        $this->assertTrue(Schema::hasColumns('methodology_reviews', ['research_document_id', 'statistician_id', 'design_fit', 'sample_size', 'review_status']));
        $this->assertTrue(Schema::hasColumns('compliance_reviews', ['research_document_id', 'reviewed_by', 'format_compliant', 'review_status', 'decided_at']));
        $this->assertTrue(Schema::hasColumns('metadata_reviews', ['research_document_id', 'reviewed_by', 'title_complete', 'review_status']));
        $this->assertTrue(Schema::hasColumns('saved_library_items', ['user_id', 'research_document_id']));
        $this->assertTrue(Schema::hasColumns('retention_logs', ['research_document_id', 'performed_by', 'action', 'activity_date']));
        $this->assertTrue(Schema::hasColumns('privacy_logs', ['user_id', 'performed_by', 'action', 'details', 'activity_date']));
        $this->assertFalse(Schema::hasColumn('retention_logs', 'updated_at'));
        $this->assertFalse(Schema::hasColumn('privacy_logs', 'updated_at'));
    }

    public function test_workflow_review_roles_and_unique_keys_are_migrated(): void
    {
        $this->assertTrue(Schema::hasColumns('research_review_assignments', ['review_role', 'is_active']));
        foreach ([
            ['research_review_assignments', 'research_review_assignment_unique'],
            ['class_section_members', 'section_document_user_unique'],
            ['evaluations', 'evaluation_document_panelist_unique'],
            ['methodology_reviews', 'methodology_review_document_statistician_unique'],
            ['compliance_reviews', 'compliance_review_document_unique'],
            ['metadata_reviews', 'metadata_review_document_unique'],
            ['saved_library_items', 'saved_library_user_document_unique'],
        ] as [$table, $index]) {
            $indexes = collect(Schema::getIndexes($table))->keyBy('name');
            $this->assertTrue($indexes->has($index), $index.' was not migrated on '.$table.'.');
            $this->assertTrue((bool) $indexes->get($index)['unique'], $index.' on '.$table.' is not unique.');
        }
    }

    public function test_section_memberships_reference_research_documents_with_the_required_index(): void
    {
        $indexes = collect(Schema::getIndexes('class_section_members'))->keyBy('name');
        $index = $indexes->get('section_document_user_idx');

        $this->assertNotNull($index, 'section_document_user_idx was not migrated on class_section_members.');
        $this->assertSame(['research_document_id', 'user_id'], $index['columns']);

        $foreignKey = collect(Schema::getForeignKeys('class_section_members'))
            ->first(fn (array $foreignKey): bool => $foreignKey['columns'] === ['research_document_id']);

        $this->assertNotNull($foreignKey, 'class_section_members.research_document_id foreign key was not migrated.');
        $this->assertSame('research_documents', $foreignKey['foreign_table']);
        $this->assertSame(['id'], $foreignKey['foreign_columns']);
        $this->assertSame('restrict', $foreignKey['on_update']);
        $this->assertSame('cascade', $foreignKey['on_delete']);
    }

    public function test_similarity_latest_pair_index_is_migrated_in_query_order(): void
    {
        $index = collect(Schema::getIndexes('similarity_results'))
            ->keyBy('name')
            ->get('similarity_results_latest_pair_idx');

        $this->assertNotNull($index, 'similarity_results_latest_pair_idx was not migrated.');
        $this->assertSame(['source_research_id', 'matched_research_id', 'id'], $index['columns']);

        (require database_path('migrations/2026_09_01_000038_add_similarity_latest_pair_index.php'))->down();
        $this->assertTrue(Schema::hasIndex('similarity_results', 'similarity_results_latest_pair_idx'));
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

    public function test_current_similarity_decisions_are_derived_from_normalized_weighted_components(): void
    {
        $user = User::factory()->create();
        $source = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $match = ResearchDocument::factory()->create(['submitted_by' => $user->id]);

        $result = SimilarityResult::query()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $match->id,
            'source_title' => $source->title,
            'matched_title' => $match->title,
            'title_similarity_score' => '0.800000000000',
            'content_similarity_score' => '0.800000000000',
            'algorithm_version' => 'title-content-weighted-v1',
            'analysis_type' => 'title',
            'analyzed_at' => now(),
            'is_flagged' => false,
        ]);

        $result = $result->fresh();
        $this->assertSame('0.800000000000', $result->overall_similarity_score);
        $this->assertTrue($result->overall_flagged);
        $this->assertTrue($result->is_flagged);
        $this->assertTrue($result->adviser_review_required);
        $this->assertSame('overall_high_similarity', $result->flag_reason);
    }

    public function test_current_similarity_boundaries_and_self_match_protection_are_explicit(): void
    {
        $user = User::factory()->create();
        $source = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $match = ResearchDocument::factory()->create(['submitted_by' => $user->id]);

        foreach ([['0.699900000000', false], ['0.700000000000', true], ['0.750000000000', true]] as [$score, $flagged]) {
            $result = SimilarityResult::factory()->create([
                'source_research_id' => $source->id,
                'matched_research_id' => $match->id,
                'title_similarity_score' => $score,
                'content_similarity_score' => $score,
            ]);
            $this->assertSame($flagged, $result->fresh()->overall_flagged);
            $this->assertSame($flagged, $result->fresh()->is_flagged);
        }

        $this->expectException(InvalidArgumentException::class);
        SimilarityResult::factory()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $source->id,
        ]);
    }

    public function test_legacy_rows_keep_their_original_score_and_version_but_expose_a_canonical_decision(): void
    {
        $user = User::factory()->create();
        $source = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $match = ResearchDocument::factory()->create(['submitted_by' => $user->id]);
        $legacy = SimilarityResult::factory()->legacy()->create([
            'source_research_id' => $source->id,
            'matched_research_id' => $match->id,
            'final_similarity_score' => '0.730000000000',
            'cosine_score' => '0.730000000000',
            'is_flagged' => true,
        ])->fresh();

        $this->assertSame('title-tfidf-cosine-v1', $legacy->algorithm_version);
        $this->assertSame('0.730000000000', $legacy->final_similarity_score);
        $this->assertTrue($legacy->adviser_review_required);
        $this->assertSame('overall_high_similarity', $legacy->flag_reason);
        $payload = (new SimilarityResultResource($legacy))->resolve();
        $this->assertNull($payload['overall_similarity_score']);
        $this->assertSame('0.730000000000', $payload['final_similarity_score']);
        $this->assertArrayNotHasKey('is_flagged', $payload);
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
