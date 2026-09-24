<?php

namespace App\Services;

use App\Exceptions\CoordinatorInstituteRequiredException;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class CoordinatorInstituteScope
{
    public function institute(User $actor): ?string
    {
        if (DomainAuthorization::isActiveAdministrator($actor->loadMissing('roleDefinition'))) {
            return null;
        }

        if ($actor->role !== 'coordinator') {
            abort(403, 'ROLE_NOT_AUTHORIZED');
        }

        $institute = trim((string) $actor->institute);
        if ($institute === '') {
            throw new CoordinatorInstituteRequiredException;
        }

        return $institute;
    }

    public function users(User $actor): Builder
    {
        $query = User::query();
        $institute = $this->institute($actor);

        return $institute === null ? $query : $query->where('institute', $institute);
    }

    public function documents(User $actor): Builder
    {
        $query = ResearchDocument::query();
        $institute = $this->institute($actor);

        return $institute === null ? $query : $query->where('institute', $institute);
    }
}
