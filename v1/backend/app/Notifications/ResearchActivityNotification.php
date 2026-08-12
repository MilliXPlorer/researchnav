<?php

namespace App\Notifications;

use App\Models\ResearchDocument;
use App\Notifications\Channels\ResearchDatabaseChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class ResearchActivityNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly ResearchDocument $research, private readonly string $event, private readonly string $title, private readonly string $message) {}

    public function via(object $notifiable): array
    {
        return [ResearchDatabaseChannel::class];
    }

    public function toResearchDatabase(object $notifiable): array
    {
        return [
            'event' => $this->event,
            'type' => $this->event,
            'title' => $this->title,
            'message' => $this->message,
            'action_url' => '/research/'.$this->research->id,
            'research_document_id' => $this->research->id,
        ];
    }
}
