<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AdminUserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'student_employee_id' => $this->student_employee_id,
            'names' => [
                'first_name' => $this->first_name,
                'middle_name' => $this->middle_name,
                'last_name' => $this->last_name,
            ],
            'role' => $this->roleDefinition?->slug === 'research_editor' ? 'research_editor' : $this->role,
            'access_status' => $this->access_status,
            'is_admin' => $this->is_admin,
            'invitation_sent_at' => $this->invitation_sent_at?->toISOString(),
            'confirmed_at' => $this->confirmed_at?->toISOString(),
            'last_login_at' => $this->last_login_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
