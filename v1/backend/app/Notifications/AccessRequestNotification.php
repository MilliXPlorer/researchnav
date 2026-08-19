<?php

namespace App\Notifications;

use App\Notifications\Channels\ResearchDatabaseChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Tells an applicant that their workspace access request was decided.
 *
 * It carries no research document, so the stored notification's
 * research_document_id stays null and the action only returns the user to the
 * application shell.
 */
class AccessRequestNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $event,
        private readonly string $title,
        private readonly string $message,
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
            'action_url' => '/app',
            'research_document_id' => null,
        ];
    }
}
