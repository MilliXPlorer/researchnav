<?php

namespace App\Notifications;

use App\Models\ResearchDocument;
use App\Notifications\Channels\ResearchDatabaseChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class ResearchActivityNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly ResearchDocument $research,
        private readonly string $event,
        private readonly string $title,
        private readonly string $message,
        private readonly ?string $actionUrl = null,
    ) {}

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
            'research_title' => $this->research->title,
            'submission_reference' => $this->research->submission_reference,
            'details' => trim($this->message.' · '.$this->research->title),
            'action_url' => $this->actionUrl ?? '/research/'.$this->research->id,
            'research_document_id' => $this->research->id,
        ];
    }
}
