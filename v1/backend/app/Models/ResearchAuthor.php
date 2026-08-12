<?php

namespace App\Models;

use Database\Factories\ResearchAuthorFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResearchAuthor extends Model
{
    use HasFactory;

    protected $fillable = ['research_document_id', 'user_id', 'author_name', 'author_order', 'is_corresponding_author'];

    protected function casts(): array
    {
        return ['author_order' => 'integer', 'is_corresponding_author' => 'boolean'];
    }

    protected static function newFactory(): ResearchAuthorFactory
    {
        return ResearchAuthorFactory::new();
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }
}
