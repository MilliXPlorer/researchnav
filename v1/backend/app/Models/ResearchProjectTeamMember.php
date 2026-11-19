<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ResearchProjectTeamMember extends Model
{
    public const ROLES = ['adviser', 'research_office_representative', 'chair', 'panel_member'];

    protected $fillable = [
        'research_document_id',
        'defense_type',
        'user_id',
        'team_role',
        'position',
        'assigned_by',
    ];

    protected function casts(): array
    {
        return ['position' => 'integer'];
    }

    public function researchDocument(): BelongsTo
    {
        return $this->belongsTo(ResearchDocument::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
