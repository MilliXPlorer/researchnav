<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProfileService
{
    private const MIME_EXTENSIONS = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
    ];

    public function __construct(private readonly AuditService $audit) {}

    /** @param array<string, mixed> $data */
    public function update(User $actor, array $data, ?Request $request = null): User
    {
        return DB::transaction(function () use ($actor, $data, $request): User {
            $user = User::query()->lockForUpdate()->findOrFail($actor->id);
            $user->forceFill(array_intersect_key($data, array_flip([
                'first_name', 'middle_name', 'last_name',
            ])))->save();
            $this->audit->log($user, 'PROFILE_UPDATED', $user, 'Updated own profile details.', $request);

            return $user->fresh();
        });
    }

    public function uploadPhoto(User $actor, UploadedFile $upload, ?Request $request = null): User
    {
        $mime = (string) $upload->getMimeType();
        $extension = self::MIME_EXTENSIONS[$mime] ?? null;
        if ($extension === null || ! $upload->isValid() || ($upload->getSize() ?: 0) > 2 * 1024 * 1024) {
            throw ValidationException::withMessages(['photo' => ['The uploaded profile photo is not supported.']]);
        }

        $version = Str::uuid()->toString();
        $directory = 'profile-photos/'.$actor->id;
        $filename = $version.'.'.$extension;
        $newPath = $directory.'/'.$filename;
        Storage::disk('researchnav_private')->putFileAs($directory, $upload, $filename);

        $oldPhoto = null;
        try {
            $user = DB::transaction(function () use ($actor, $mime, $upload, $version, $newPath, $request, &$oldPhoto): User {
                $user = User::query()->lockForUpdate()->findOrFail($actor->id);
                $oldPhoto = $this->photoMetadata($user);
                $user->forceFill([
                    'profile_photo_path' => $newPath,
                    'profile_photo_mime_type' => $mime,
                    'profile_photo_size' => $upload->getSize(),
                    'profile_photo_version' => $version,
                ])->save();
                $this->audit->log($user, 'PROFILE_PHOTO_UPDATED', $user, 'Updated own private profile photo.', $request);

                return $user->fresh();
            });
        } catch (\Throwable $exception) {
            Storage::disk('researchnav_private')->delete($newPath);
            throw $exception;
        }

        $this->deleteReferencedPhoto($actor->id, $oldPhoto);

        return $user;
    }

    public function removePhoto(User $actor, ?Request $request = null): User
    {
        $oldPhoto = null;
        $user = DB::transaction(function () use ($actor, $request, &$oldPhoto): User {
            $user = User::query()->lockForUpdate()->findOrFail($actor->id);
            $oldPhoto = $this->photoMetadata($user);
            $user->forceFill([
                'profile_photo_path' => null,
                'profile_photo_mime_type' => null,
                'profile_photo_size' => null,
                'profile_photo_version' => null,
            ])->save();
            $this->audit->log($user, 'PROFILE_PHOTO_REMOVED', $user, 'Removed own private profile photo.', $request);

            return $user->fresh();
        });

        $this->deleteReferencedPhoto($actor->id, $oldPhoto);

        return $user;
    }

    /** @return array{path: string, mime: string, size: int, version: string}|null */
    public function currentPhoto(User $actor, string $version): ?array
    {
        $user = User::query()->findOrFail($actor->id);
        $photo = $this->photoMetadata($user);
        if ($photo === null || ! hash_equals($photo['version'], $version) || ! $this->isCanonicalPhoto($user->id, $photo)) {
            return null;
        }
        if (! Storage::disk('researchnav_private')->exists($photo['path'])) {
            return null;
        }

        return $photo;
    }

    /** @return array{path: string, mime: string, size: int, version: string}|null */
    private function photoMetadata(User $user): ?array
    {
        if (! is_string($user->profile_photo_path) || ! is_string($user->profile_photo_mime_type)
            || ! is_string($user->profile_photo_version) || ! is_numeric($user->profile_photo_size)) {
            return null;
        }

        return [
            'path' => $user->profile_photo_path,
            'mime' => $user->profile_photo_mime_type,
            'size' => (int) $user->profile_photo_size,
            'version' => $user->profile_photo_version,
        ];
    }

    /** @param array{path: string, mime: string, size: int, version: string}|null $photo */
    private function deleteReferencedPhoto(string $userId, ?array $photo): void
    {
        if ($photo !== null && $this->isCanonicalPhoto($userId, $photo)) {
            try {
                Storage::disk('researchnav_private')->delete($photo['path']);
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
    }

    /** @param array{path: string, mime: string, size: int, version: string} $photo */
    private function isCanonicalPhoto(string $userId, array $photo): bool
    {
        $extension = self::MIME_EXTENSIONS[$photo['mime']] ?? null;

        return $extension !== null
            && Str::isUuid($photo['version'])
            && $photo['size'] >= 1
            && $photo['size'] <= 2 * 1024 * 1024
            && $photo['path'] === 'profile-photos/'.$userId.'/'.$photo['version'].'.'.$extension;
    }
}
