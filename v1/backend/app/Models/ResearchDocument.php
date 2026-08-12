<?php

namespace App\Models;

use Database\Factories\ResearchDocumentFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ResearchDocument extends Model
{
    use HasFactory, SoftDeletes;

    public const RESEARCH_STAGES = ['title_proposal', 'ongoing', 'completed'];

    public const SUBMISSION_STATUSES = ['draft', 'submitted', 'under_review', 'revision_required', 'approved', 'archived'];

    public const ARCHIVE_STATUSES = ['not_archived', 'pending_archiving', 'archived'];

    public const VISIBILITIES = ['private', 'registered_only', 'public'];

    protected $fillable = [
        'submitted_by', 'category_id', 'title', 'normalized_title', 'abstract', 'keywords', 'publication_year',
        'institution_name', 'institution_location', 'academic_unit', 'degree_program', 'manuscript_date_label', 'abstract_provenance',
        'research_stage', 'submission_status', 'archive_status', 'visibility', 'submitted_at', 'approved_at', 'archived_at',
        'import_source_sha256', 'import_source_filename',
    ];

    protected function casts(): array
    {
        return [
            'publication_year' => 'integer',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }

    protected static function newFactory(): ResearchDocumentFactory
    {
        return ResearchDocumentFactory::new();
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function authors(): HasMany
    {
        return $this->hasMany(ResearchAuthor::class)->orderBy('author_order');
    }

    public function files(): HasMany
    {
        return $this->hasMany(DocumentFile::class);
    }

    public function feedbackComments(): HasMany
    {
        return $this->hasMany(FeedbackComment::class);
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(Revision::class);
    }

    public function monitoringLogs(): HasMany
    {
        return $this->hasMany(MonitoringLog::class);
    }

    public function titleValidations(): HasMany
    {
        return $this->hasMany(TitleValidation::class);
    }

    public function reviewAssignments(): HasMany
    {
        return $this->hasMany(ReviewAssignment::class);
    }

    public function sourceSimilarityResults(): HasMany
    {
        return $this->hasMany(SimilarityResult::class, 'source_research_id');
    }

    public function matchedSimilarityResults(): HasMany
    {
        return $this->hasMany(SimilarityResult::class, 'matched_research_id');
    }

    public function scopeVisibleToRegisteredUsers(Builder $query): Builder
    {
        return $query->whereIn('visibility', ['registered_only', 'public']);
    }

    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('submission_status', 'approved');
    }
}
