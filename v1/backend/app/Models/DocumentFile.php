<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use InvalidArgumentException;

class DocumentFile extends Model
{
    public const TYPES = ['title_proposal', 'draft', 'chapter', 'revised_manuscript', 'final_manuscript', 'attachment'];

    protected $fillable = [
        'research_document_id', 'uploaded_by', 'document_type', 'version_number', 'original_filename',
        'stored_filename', 'file_path', 'file_extension', 'mime_type', 'file_size', 'is_current', 'uploaded_at',
    ];

    protected function casts(): array
    {
        return ['version_number' => 'integer', 'file_size' => 'integer', 'is_current' => 'boolean', 'uploaded_at' => 'datetime'];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function manuscriptSearchDocument(): HasOne
    {
        return $this->hasOne(ManuscriptSearchDocument::class, 'source_document_file_id');
    }

    protected static function booted(): void
    {
        static::saving(function (self $file): void {
            if ($file->version_number === null || $file->version_number < 1) {
                throw new InvalidArgumentException('Document file versions must start at 1.');
            }
        });
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function feedbackComments(): HasMany
    {
        return $this->hasMany(FeedbackComment::class, FeedbackComment::column('document_file_id'));
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(Revision::class, Revision::column('document_file_id'));
    }

    public function scopeCurrent(Builder $query): Builder
    {
        return $query->where('is_current', true);
    }
}
