<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ManuscriptSearchDocument extends Model
{
    public const SOURCE_KINDS = ['final_manuscript', 'canonical_import'];

    public const SOURCE_EXTENSIONS = ['pdf', 'docx', 'doc'];

    public const EXTRACTION_STATUSES = ['pending', 'ready', 'no_source', 'unsupported', 'failed'];

    protected $fillable = [
        'research_document_id',
        'source_document_file_id',
        'source_kind',
        'source_extension',
        'source_sha256',
        'source_size_bytes',
        'source_file_updated_at',
        'body_text',
        'body_text_bytes',
        'body_text_chars',
        'extraction_status',
        'error_code',
        'extractor_version',
        'last_attempted_at',
        'indexed_at',
    ];

    protected function casts(): array
    {
        return [
            'source_size_bytes' => 'integer',
            'source_file_updated_at' => 'datetime',
            'body_text_bytes' => 'integer',
            'body_text_chars' => 'integer',
            'last_attempted_at' => 'datetime',
            'indexed_at' => 'datetime',
        ];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function sourceDocumentFile(): BelongsTo
    {
        return $this->belongsTo(DocumentFile::class, 'source_document_file_id');
    }

    public function sdgClassification(): HasOne
    {
        return $this->hasOne(ManuscriptSdgClassification::class);
    }
}
