<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Schema;

class ReviewAssignment extends Model
{
    public const ROLES = ['adviser', 'instructor', 'panel', 'statistician'];

    protected $table = 'research_review_assignments';

    protected $fillable = ['research_document_id', 'reviewer_id', 'assigned_by', 'review_role', 'is_active', 'designation'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function getTable(): string
    {
        return Schema::hasTable(parent::getTable()) ? parent::getTable() : 'research_assignments';
    }

    public static function column(string $legacyColumn): string
    {
        if ((new static)->getTable() !== 'research_assignments') {
            return $legacyColumn;
        }

        return match ($legacyColumn) {
            'reviewer_id' => 'user_id',
            'review_role' => 'assignment_role',
            'is_active' => 'status',
            default => $legacyColumn,
        };
    }

    public static function identityCompatible(): bool
    {
        $model = new static;
        if ($model->getTable() !== 'research_assignments') {
            return true;
        }

        return Schema::getColumnType('research_assignments', 'user_id') === Schema::getColumnType('users', 'id');
    }

    public function getAttribute($key): mixed
    {
        if ($this->getTable() === 'research_assignments') {
            if ($key === 'is_active') {
                return $this->getAttributeFromArray('status') === 'active';
            }
            $key = static::column((string) $key);
        }

        return parent::getAttribute($key);
    }

    public function setAttribute($key, $value): static
    {
        if ($this->getTable() === 'research_assignments') {
            if ($key === 'is_active') {
                return parent::setAttribute('status', $value ? 'active' : 'inactive');
            }
            $key = static::column((string) $key);
        }

        return parent::setAttribute($key, $value);
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, static::column('reviewer_id'))->withTrashed();
    }

    public function assigner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by')->withTrashed();
    }
}
