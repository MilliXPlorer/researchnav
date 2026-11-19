<?php

namespace App\Http\Resources;

use App\Models\User;
use App\Services\DomainAuthorization;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FeedbackResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $actor = $request->attributes->get('current_user');

        return [
            'id' => $this->getRouteKey(),
            'research_document_id' => $this->research_document_id,
            'user_id' => $actor instanceof User && DomainAuthorization::isResearcher($actor) ? null : $this->user_id,
            'reviewer_name' => $this->whenLoaded('user', fn () => $this->user?->profileName() ?? 'Assigned reviewer'),
            'reviewer_role' => $this->whenLoaded('user', fn () => $this->reviewerRoleLabel($this->user)),
            'document_file_id' => $this->document_file_id,
            'comment' => $this->comment,
            'feedback_type' => $this->feedback_type,
            'feedback_status' => $this->feedback_status,
            'resolved_at' => $this->resolved_at?->toISOString(),
            'researcher_acknowledged_at' => $this->researcher_acknowledged_at?->toISOString(),
            'researcher_addressed_at' => $this->researcher_addressed_at?->toISOString(),
            'researcher_action_remarks' => $this->researcher_action_remarks,
            'attachment' => $this->whenLoaded('attachment', function () {
                if ($this->attachment === null) {
                    return null;
                }

                return [
                    'original_filename' => $this->attachment->original_filename,
                    'file_extension' => $this->attachment->file_extension,
                    'mime_type' => $this->attachment->mime_type,
                    'file_size' => (int) $this->attachment->file_size,
                    'url' => '/api/research/'.$this->research_document_id.'/feedback/'.$this->getRouteKey().'/attachment',
                ];
            }),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    private function reviewerRoleLabel(?User $user): string
    {
        if ($user === null) {
            return 'Research actor';
        }

        return match ($user->roleDefinition?->slug ?? $user->role) {
            'research_adviser', 'adviser' => 'Research Adviser',
            'research_instructor', 'instructor' => 'Research Instructor',
            'research_panelist', 'panel' => 'Research Panel',
            'research_office', 'research-office' => 'Research Office Representative',
            'statistician' => 'Statistician',
            'librarian' => 'Librarian',
            'research_editor' => 'Editor',
            default => ucwords(str_replace(['_', '-'], ' ', (string) ($user->roleDefinition?->slug ?? $user->role))),
        };
    }
}
