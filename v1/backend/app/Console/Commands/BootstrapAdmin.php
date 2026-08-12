<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BootstrapAdmin extends Command
{
    protected $signature = 'admin:bootstrap {email? : Administrator email address (defaults to BOOTSTRAP_ADMIN_EMAIL)}';

    protected $description = 'Create or promote an active ResearchNAV administrator without a password';

    public function handle(): int
    {
        $email = Str::lower(trim((string) ($this->argument('email') ?: config('researchnav.bootstrap_admin_email'))));

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('Provide a valid email argument or set BOOTSTRAP_ADMIN_EMAIL.');

            return self::FAILURE;
        }

        DB::transaction(function () use ($email): void {
            $admin = User::query()->where('email', $email)->lockForUpdate()->first();

            if ($admin === null) {
                $admin = User::query()->create([
                    'email' => $email,
                    'role' => 'admin',
                    'access_status' => 'active',
                    'is_admin' => true,
                ]);
            } else {
                $admin->forceFill([
                    'role' => 'admin',
                    'access_status' => 'active',
                    'is_admin' => true,
                ])->save();
            }

            $admin->forceFill([
                'confirmed_at' => $admin->confirmed_at ?? now(),
            ])->save();
        }, 3);

        $this->info('Administrator account provisioned.');

        return self::SUCCESS;
    }
}
