<?php

namespace App\Providers;

use App\Contracts\GoogleIdTokenVerifier;
use App\Models\ResearchDocument;
use App\Models\User;
use App\Models\UserRole;
use App\Services\AccountService;
use App\Services\DomainAuthorization;
use App\Services\GoogleClientVerifier;
use App\Support\ProductionConfiguration;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(GoogleIdTokenVerifier::class, GoogleClientVerifier::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        ProductionConfiguration::validate();
        RateLimiter::for('auth-google', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));
        RateLimiter::for('provision-coordinators', fn (Request $request) => Limit::perHour(30)->by($request->ip()));
        RateLimiter::for('provision-instructors', fn (Request $request) => Limit::perHour(60)->by($request->ip()));
        RateLimiter::for('research-upload', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $userKey = $actor instanceof User ? 'user:'.$actor->id : 'user:'.$request->session()->get('user_id', $request->ip());

            return [Limit::perMinute(10)->by($userKey), Limit::perMinute(30)->by('ip:'.$request->ip())];
        });
        RateLimiter::for('research-bulk-preview', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $userKey = $actor instanceof User ? 'user:'.$actor->id : 'user:'.$request->session()->get('user_id', $request->ip());

            return [Limit::perMinute(300)->by($userKey), Limit::perMinute(600)->by('ip:'.$request->ip())];
        });
        RateLimiter::for('research-bulk-import', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $userKey = $actor instanceof User ? 'user:'.$actor->id : 'user:'.$request->session()->get('user_id', $request->ip());

            return [Limit::perHour(1000)->by($userKey), Limit::perHour(1500)->by('ip:'.$request->ip())];
        });
        RateLimiter::for('profile-upload', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $userKey = $actor instanceof User ? 'user:'.$actor->id : 'user:'.$request->session()->get('user_id', $request->ip());

            return [
                Limit::perMinute(10)->by($userKey),
                Limit::perHour(60)->by($userKey),
                Limit::perHour(120)->by('ip:'.$request->ip()),
            ];
        });
        RateLimiter::for('similarity-results', function (Request $request): array {
            if ($this->hasUnlimitedSimilarityAccess($request)) {
                return [Limit::none()];
            }

            $source = $request->route('researchDocument');
            $sourceId = $source instanceof ResearchDocument ? $source->getKey() : (string) $source;
            $userId = (string) $request->session()->get('user_id', $request->ip());

            return [
                Limit::perMinute(2)->by($userId.':'.$sourceId),
                Limit::perMinute(2)->by($userId),
            ];
        });
        RateLimiter::for('public-search', fn (Request $request) => Limit::perMinute(60)->by((string) $request->ip()));
        RateLimiter::for('public-repository-similarity', function (Request $request): array {
            if ($this->hasUnlimitedSimilarityAccess($request)) {
                return [Limit::none()];
            }

            return [
                Limit::perMinute(10)->by((string) $request->ip()),
                Limit::perHour(20)->by((string) $request->ip()),
            ];
        });
        // The authenticated title check is iterative by nature: a researcher
        // refines a proposed title and re-checks it. Key the limit on the
        // account rather than the IP so a shared campus network cannot exhaust
        // one visitor's budget for everyone, while still bounding worker spawns.
        RateLimiter::for('similarity-query', function (Request $request): array {
            if ($this->hasUnlimitedSimilarityAccess($request)) {
                return [Limit::none()];
            }

            $actor = $request->attributes->get('current_user');
            $key = $actor instanceof User ? 'user:'.$actor->id : 'ip:'.$request->ip();

            return [Limit::perMinute(15)->by($key), Limit::perHour(180)->by($key)];
        });
        RateLimiter::for('domain-mutations', fn (Request $request) => Limit::perMinute(30)->by((string) $request->ip()));
        RateLimiter::for('researcher-mutations', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $userKey = $actor instanceof User ? 'user:'.$actor->id : 'user:'.$request->session()->get('user_id', $request->ip());

            return [Limit::perMinute(20)->by($userKey), Limit::perMinute(60)->by('ip:'.$request->ip())];
        });
        RateLimiter::for('research-file-access', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $userKey = $actor instanceof User ? 'user:'.$actor->id : 'user:'.$request->session()->get('user_id', $request->ip());

            return [Limit::perMinute(30)->by($userKey), Limit::perMinute(90)->by('ip:'.$request->ip())];
        });
        RateLimiter::for('researcher-file-mutations', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $userKey = $actor instanceof User ? 'user:'.$actor->id : 'user:'.$request->session()->get('user_id', $request->ip());

            return [Limit::perMinute(15)->by($userKey), Limit::perMinute(45)->by('ip:'.$request->ip())];
        });
        RateLimiter::for('catalog-download', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $userKey = $actor instanceof User ? 'user:'.$actor->id : 'user:'.$request->session()->get('user_id', $request->ip());

            return [Limit::perMinute(10)->by($userKey), Limit::perHour(60)->by('ip:'.$request->ip())];
        });
    }

    private function hasUnlimitedSimilarityAccess(Request $request): bool
    {
        $actor = $request->attributes->get('current_user');
        if (! $actor instanceof User && $request->hasSession()) {
            $id = $request->session()->get('user_id');
            $actor = is_string($id) && $id !== ''
                ? app(AccountService::class)->findById($id)
                : null;
        }

        if (! $actor instanceof User || ! DomainAuthorization::isActiveAccount($actor)) {
            return false;
        }

        return in_array($actor->roleDefinition?->slug, [UserRole::RESEARCH_OFFICE, UserRole::ADMINISTRATOR], true);
    }
}
