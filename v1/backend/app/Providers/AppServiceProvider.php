<?php

namespace App\Providers;

use App\Contracts\GoogleIdTokenVerifier;
use App\Models\ResearchDocument;
use App\Models\User;
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
        RateLimiter::for('research-upload', fn (Request $request) => Limit::perMinute(10)->by((string) $request->ip()));
        RateLimiter::for('similarity-results', function (Request $request): array {
            $source = $request->route('researchDocument');
            $sourceId = $source instanceof ResearchDocument ? $source->getKey() : (string) $source;
            $userId = (string) $request->session()->get('user_id', $request->ip());

            return [
                Limit::perMinute(2)->by($userId.':'.$sourceId),
                Limit::perMinute(2)->by($userId),
            ];
        });
        RateLimiter::for('public-search', fn (Request $request) => Limit::perMinute(60)->by((string) $request->ip()));
        RateLimiter::for('public-repository-similarity', fn (Request $request): array => [
            Limit::perMinute(2)->by((string) $request->ip()),
            Limit::perHour(20)->by((string) $request->ip()),
        ]);
        // The authenticated title check is iterative by nature: a researcher
        // refines a proposed title and re-checks it. Key the limit on the
        // account rather than the IP so a shared campus network cannot exhaust
        // one visitor's budget for everyone, while still bounding worker spawns.
        RateLimiter::for('similarity-query', function (Request $request): array {
            $actor = $request->attributes->get('current_user');
            $key = $actor instanceof User ? 'user:'.$actor->id : 'ip:'.$request->ip();

            return [Limit::perMinute(15)->by($key), Limit::perHour(180)->by($key)];
        });
        RateLimiter::for('domain-mutations', fn (Request $request) => Limit::perMinute(30)->by((string) $request->ip()));
    }
}
