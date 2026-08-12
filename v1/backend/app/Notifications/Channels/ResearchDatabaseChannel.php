<?php

namespace App\Notifications\Channels;

use Illuminate\Support\Str;

class ResearchDatabaseChannel
{
    public function send(object $notifiable, object $notification): void
    {
        $data = $notification->toResearchDatabase($notifiable);
        $notifiable->notifications()->create([
            'id' => (string) Str::uuid(),
            'type' => $notification::class,
            'data' => $data,
            'research_document_id' => $data['research_document_id'] ?? null,
        ]);
    }
}
