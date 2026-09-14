<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A request from an authenticated Google account for a workspace role.
 *
 * This is deliberately not a registration record: the account already exists and
 * is already verified by Google before a request can be made. Approving a
 * request assigns the role and activates access; rejecting it leaves the account
 * blocked.
 */
class AccessRequest extends Model
{
    public const STATUSES = ['pending', 'approved', 'rejected'];

    protected $fillable = [
        'user_id', 'requested_role', 'status', 'full_name', 'program',
        'justification', 'decided_by', 'decision_remarks', 'requested_at', 'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'decided_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class)->withTrashed();
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by')->withTrashed();
    }
}
