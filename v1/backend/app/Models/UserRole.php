<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class UserRole extends Model
{
    use HasFactory;

    public const RESEARCHER = 'researcher';

    public const RESEARCH_INSTRUCTOR = 'research_instructor';

    public const RESEARCH_ADVISER = 'research_adviser';

    public const RESEARCH_OFFICE = 'research_office';

    public const ADMINISTRATOR = 'administrator';

    public const STATISTICIAN = 'statistician';

    public const LIBRARIAN = 'librarian';

    public const RESEARCH_PANELIST = 'research_panelist';

    protected $fillable = ['name', 'slug', 'description', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'role_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }
}
