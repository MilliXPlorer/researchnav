<?php

namespace App\Services;

use Illuminate\Support\Facades\Mail;

class InvitationMailer
{
    public function send(string $email, string $roleLabel, bool $alreadyActive): void
    {
        $url = config('researchnav.frontend_url');
        $message = $alreadyActive
            ? "Your ResearchNAV {$roleLabel} access has been updated. Visit {$url}."
            : "You have been invited to ResearchNAV as a {$roleLabel}. Sign in with your Google account at {$url} to activate access.";

        Mail::raw($message, function ($mail) use ($email, $roleLabel): void {
            $mail->to($email)->subject("ResearchNAV {$roleLabel} invitation");
        });
    }
}
