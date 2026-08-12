<?php

namespace App\Policies;

use App\Models\ResearchDocument;
use App\Models\TitleValidation;
use App\Models\User;
use App\Services\DomainAuthorization;

class TitleValidationPolicy
{
    public function create(User $user, ResearchDocument $research): bool
    {
        return DomainAuthorization::canReview($user, $research);
    }

    public function update(User $user, TitleValidation $validation): bool
    {
        return $validation->validated_by === $user->id && DomainAuthorization::canReview($user, $validation->researchDocument);
    }
}
