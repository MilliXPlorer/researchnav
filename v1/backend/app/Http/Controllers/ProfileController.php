<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateProfileRequest;
use App\Http\Requests\UploadProfilePhotoRequest;
use App\Services\ProfileService;
use App\Services\UserSessionMapper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

class ProfileController extends DomainController
{
    public function show(Request $request): Response
    {
        return $this->profileResponse($this->actor($request));
    }

    public function update(UpdateProfileRequest $request, ProfileService $service): Response
    {
        return $this->profileResponse($service->update($this->actor($request), $request->validated(), $request));
    }

    public function uploadPhoto(UploadProfilePhotoRequest $request, ProfileService $service): Response
    {
        return $this->profileResponse($service->uploadPhoto($this->actor($request), $request->file('photo'), $request));
    }

    public function removePhoto(Request $request, ProfileService $service): Response
    {
        return $this->profileResponse($service->removePhoto($this->actor($request), $request));
    }

    public function photo(Request $request, string $version, ProfileService $service): Response
    {
        $photo = $service->currentPhoto($this->actor($request), $version);
        abort_if($photo === null, 404);
        $extension = match ($photo['mime']) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
        };

        return Storage::disk('researchnav_private')->response(
            $photo['path'],
            'profile-photo.'.$extension,
            [
                'Content-Type' => $photo['mime'],
                'Content-Length' => (string) $photo['size'],
                'Cache-Control' => 'private, no-store',
                'Vary' => 'Cookie',
            ],
            'inline',
        );
    }

    private function profileResponse($user): Response
    {
        return response()->json(['user' => UserSessionMapper::map($user, true)])
            ->header('Cache-Control', 'private, no-store')
            ->header('Vary', 'Cookie');
    }
}
