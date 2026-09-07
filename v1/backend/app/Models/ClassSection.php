<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClassSection extends Model
{
    use HasFactory;

    protected $fillable = ['instructor_id', 'name', 'academic_year', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function instructor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'instructor_id');
    }

    public function researchDocuments(): HasMany
    {
        return $this->hasMany(ResearchDocument::class, 'section_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'class_section_members')
            ->withTimestamps();
    }

    public function documentMembers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'class_section_members')
            ->withPivot('research_document_id')
            ->wherePivotNotNull('research_document_id')
            ->withTimestamps();
    }
}
