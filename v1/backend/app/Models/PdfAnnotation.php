<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PdfAnnotation extends Model
{
    public const KINDS = ['highlight', 'comment'];

    protected $fillable = [
        'research_document_id', 'document_file_id', 'author_id', 'author_role', 'kind', 'body',
        'anchor_schema_version', 'page_number', 'selected_text', 'text_prefix', 'text_suffix', 'rects',
    ];

    protected function casts(): array
    {
        return [
            'anchor_schema_version' => 'integer',
            'page_number' => 'integer',
            'rects' => 'array',
        ];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function documentFile(): BelongsTo
    {
        return $this->belongsTo(DocumentFile::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id')->withTrashed();
    }
}
