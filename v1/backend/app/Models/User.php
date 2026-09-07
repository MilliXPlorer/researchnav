<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;
use InvalidArgumentException;

class User extends Authenticatable
{
    use HasFactory, HasUuids, Notifiable, SoftDeletes;

    public const LEGACY_ROLES = ['admin', 'researcher', 'adviser', 'instructor', 'panel', 'statistician', 'coordinator', 'librarian', 'research-office', 'academics'];

    public const ACCOUNT_STATUSES = ['active', 'inactive', 'suspended', 'pending'];

    public const ACCESS_STATUSES = ['active', 'invited', 'blocked'];

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'email', 'google_sub', 'role', 'role_id', 'access_status', 'account_status', 'is_admin',
        'student_employee_id', 'first_name', 'middle_name', 'last_name', 'password', 'email_verified_at',
        'invited_by', 'invitation_sent_at', 'confirmed_at', 'last_login_at', 'remember_token',
    ];

    protected $hidden = [
        'password', 'remember_token', 'google_sub',
        'profile_photo_path', 'profile_photo_mime_type', 'profile_photo_size', 'profile_photo_version',
    ];

    protected function casts(): array
    {
        return [
            'is_admin' => 'boolean',
            'email_verified_at' => 'datetime',
            'invitation_sent_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $user): void {
            $dirty = $user->getDirty();

            if (array_key_exists('role', $dirty) || $user->role_id === null) {
                $slug = self::canonicalSlugForLegacyRole($user->role ?? 'researcher');
                $user->role_id = UserRole::query()->where('slug', $slug)->value('id');
                if ($user->role_id === null) {
                    throw new InvalidArgumentException("Canonical role [{$slug}] does not exist.");
                }
                $user->is_admin = $slug === UserRole::ADMINISTRATOR;
            } elseif (array_key_exists('role_id', $dirty)) {
                $slug = UserRole::query()->whereKey($user->role_id)->value('slug');
                if ($slug === null) {
                    throw new InvalidArgumentException("Canonical role ID [{$user->role_id}] does not exist.");
                }
                $user->role = self::legacyRoleForCanonicalSlug($slug);
                $user->is_admin = $slug === UserRole::ADMINISTRATOR;
            }

            if (array_key_exists('access_status', $dirty)) {
                $user->account_status = self::accountStatusForAccessStatus($user->access_status);
            } elseif (array_key_exists('account_status', $dirty) || (! $user->exists && $user->account_status !== null)) {
                $user->access_status = self::accessStatusForAccountStatus($user->account_status);
            }
        });
    }

    public static function canonicalSlugForLegacyRole(string $role): string
    {
        return match ($role) {
            'admin' => UserRole::ADMINISTRATOR,
            'researcher' => UserRole::RESEARCHER,
            'adviser' => UserRole::RESEARCH_ADVISER,
            'instructor' => UserRole::RESEARCH_INSTRUCTOR,
            'panel' => UserRole::RESEARCH_PANELIST,
            'statistician' => UserRole::STATISTICIAN,
            'librarian' => UserRole::LIBRARIAN,
            'coordinator', 'research-office', 'academics' => UserRole::RESEARCH_OFFICE,
            default => throw new InvalidArgumentException("Unknown legacy role [{$role}]."),
        };
    }

    public static function legacyRoleForCanonicalSlug(string $slug): string
    {
        return match ($slug) {
            UserRole::ADMINISTRATOR => 'admin',
            UserRole::RESEARCHER => 'researcher',
            UserRole::RESEARCH_ADVISER => 'adviser',
            UserRole::RESEARCH_INSTRUCTOR => 'instructor',
            UserRole::RESEARCH_OFFICE => 'research-office',
            UserRole::STATISTICIAN => 'statistician',
            UserRole::LIBRARIAN => 'librarian',
            UserRole::RESEARCH_PANELIST => 'panel',
            UserRole::RESEARCH_EDITOR => 'academics',
            default => throw new InvalidArgumentException("Unknown canonical role [{$slug}]."),
        };
    }

    public static function accountStatusForAccessStatus(string $accessStatus): string
    {
        return match ($accessStatus) {
            'active' => 'active',
            'invited', 'blocked' => 'pending',
            default => throw new InvalidArgumentException("Unknown access status [{$accessStatus}]."),
        };
    }

    public static function accessStatusForAccountStatus(string $accountStatus): string
    {
        return match ($accountStatus) {
            'active' => 'active',
            'pending' => 'invited',
            'inactive', 'suspended' => 'blocked',
            default => throw new InvalidArgumentException("Unknown account status [{$accountStatus}]."),
        };
    }

    public function newUniqueId(): string
    {
        return (string) Str::uuid();
    }

    public function displayName(): string
    {
        $name = trim(implode(' ', array_filter([$this->first_name, $this->middle_name, $this->last_name])));

        return $name !== '' ? $name : $this->email;
    }

    public function profileName(): ?string
    {
        $name = trim(implode(' ', array_filter([$this->first_name, $this->middle_name, $this->last_name])));

        return $name !== '' ? $name : null;
    }

    protected static function newFactory(): UserFactory
    {
        return UserFactory::new();
    }

    public function roleDefinition(): BelongsTo
    {
        return $this->belongsTo(UserRole::class, 'role_id');
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(self::class, 'invited_by')->withTrashed();
    }

    public function submittedDocuments(): HasMany
    {
        return $this->hasMany(ResearchDocument::class, 'submitted_by');
    }

    public function authoredResearch(): HasMany
    {
        return $this->hasMany(ResearchAuthor::class);
    }

    public function feedbackComments(): HasMany
    {
        return $this->hasMany(FeedbackComment::class, FeedbackComment::column('user_id'));
    }

    public function uploadedFiles(): HasMany
    {
        return $this->hasMany(DocumentFile::class, 'uploaded_by');
    }

    public function requestedRevisions(): HasMany
    {
        return $this->hasMany(Revision::class, Revision::column('requested_by'));
    }

    public function monitoringLogs(): HasMany
    {
        return $this->hasMany(MonitoringLog::class, MonitoringLog::column('performed_by'));
    }

    public function titleValidations(): HasMany
    {
        return $this->hasMany(TitleValidation::class, TitleValidation::column('validated_by'));
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class, AuditLog::column('user_id'));
    }

    public function reviewAssignments(): HasMany
    {
        return $this->hasMany(ReviewAssignment::class, 'reviewer_id');
    }

    public function assignedReviewers(): HasMany
    {
        return $this->hasMany(ReviewAssignment::class, 'assigned_by');
    }

    public function classSections(): HasMany
    {
        return $this->hasMany(ClassSection::class, 'instructor_id');
    }

    public function enrolledSections(): BelongsToMany
    {
        return $this->belongsToMany(ClassSection::class, 'class_section_members')
            ->withTimestamps();
    }

    public function createdSchedules(): HasMany
    {
        return $this->hasMany(DefenseSchedule::class, 'created_by');
    }

    public function evaluations(): HasMany
    {
        return $this->hasMany(Evaluation::class, Evaluation::column('panelist_id'));
    }

    public function methodologyReviews(): HasMany
    {
        return $this->hasMany(MethodologyReview::class, MethodologyReview::column('statistician_id'));
    }

    public function savedLibraryItems(): HasMany
    {
        return $this->hasMany(SavedLibraryItem::class);
    }

    public function complianceReviews(): HasMany
    {
        return $this->hasMany(ComplianceReview::class, ComplianceReview::column('reviewed_by'));
    }

    public function metadataReviews(): HasMany
    {
        return $this->hasMany(MetadataReview::class, MetadataReview::column('reviewed_by'));
    }

    public function retentionLogs(): HasMany
    {
        return $this->hasMany(RetentionLog::class, RetentionLog::column('performed_by'));
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('account_status', 'active');
    }
}
