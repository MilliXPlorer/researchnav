<?php

namespace App\Providers;

use App\Contracts\GoogleIdTokenVerifier;
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
        RateLimiter::for('similarity-results', fn (Request $request) => Limit::perMinute(30)->by((string) $request->ip()));
        RateLimiter::for('public-search', fn (Request $request) => Limit::perMinute(60)->by((string) $request->ip()));
        RateLimiter::for('domain-mutations', fn (Request $request) => Limit::perMinute(30)->by((string) $request->ip()));
    }
}
