<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class CoordinatorRepositoryItemResource extends OfficeRepositoryItemResource
{
    public function toArray(Request $request): array
    {
        return [...parent::toArray($request), 'can_edit' => false, 'can_delete' => false, 'can_restore' => false];
    }
}
