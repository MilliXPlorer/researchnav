<?php

namespace App\Models;

use Database\Factories\ResearchDocumentFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class ResearchDocument extends Model
{
    use HasFactory, SoftDeletes;

    public const RESEARCH_STAGES = ['title_proposal', 'ongoing', 'completed'];

    public const SUBMISSION_STATUSES = ['draft', 'submitted', 'under_review', 'revision_required', 'approved', 'archived'];

    public const ARCHIVE_STATUSES = ['not_archived', 'pending_archiving', 'archived'];

    public const VISIBILITIES = ['private', 'registered_only', 'public'];

    protected $fillable = [
        'submitted_by', 'submission_reference', 'category_id', 'section_id', 'title', 'normalized_title', 'abstract', 'keywords', 'publication_year',
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

    protected static function booted(): void
    {
        static::creating(function (self $document): void {
            if ($document->submission_reference !== null) {
                return;
            }

            do {
                $reference = 'RN-'.now()->format('Y').'-'.strtoupper(Str::random(8));
            } while (self::query()->where('submission_reference', $reference)->exists());
            $document->submission_reference = $reference;
        });

        static::deleted(function (self $document): void {
            ManuscriptSearchDocument::query()
                ->where('research_document_id', $document->id)
                ->delete();
        });
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function section(): BelongsTo
    {
        return $this->belongsTo(ClassSection::class, 'section_id');
    }

    public function authors(): HasMany
    {
        return $this->hasMany(ResearchAuthor::class)->orderBy('author_order');
    }

    public function files(): HasMany
    {
        return $this->hasMany(DocumentFile::class);
    }

    public function manuscriptSearchDocument(): HasOne
    {
        return $this->hasOne(ManuscriptSearchDocument::class);
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

    public function defenseSchedules(): HasMany
    {
        return $this->hasMany(DefenseSchedule::class);
    }

    public function evaluations(): HasMany
    {
        return $this->hasMany(Evaluation::class);
    }

    public function methodologyReviews(): HasMany
    {
        return $this->hasMany(MethodologyReview::class);
    }

    public function complianceReview(): HasOne
    {
        return $this->hasOne(ComplianceReview::class);
    }

    public function metadataReview(): HasOne
    {
        return $this->hasOne(MetadataReview::class);
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
