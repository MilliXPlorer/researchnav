<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ResearchAuthorResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'user_id' => $this->user_id, 'author_name' => $this->author_name, 'author_order' => $this->author_order, 'is_corresponding_author' => $this->is_corresponding_author];
    }
}
