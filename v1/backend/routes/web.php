<?php

use App\Http\Controllers\ApiController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\DocumentFileController;
use App\Http\Controllers\FeedbackController;
use App\Http\Controllers\MonitoringController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PublicRepositoryController;
use App\Http\Controllers\ResearchController;
use App\Http\Controllers\ReviewAssignmentController;
use App\Http\Controllers\RevisionController;
use App\Http\Controllers\SimilarityController;
use App\Http\Controllers\TitleValidationController;
use App\Http\Middleware\AddApiSecurityHeaders;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

Route::prefix('api')
    ->middleware([AddApiSecurityHeaders::class, 'api.bodylimit'])
    ->withoutMiddleware(PreventRequestForgery::class)
    ->group(function (): void {
        Route::get('health', [ApiController::class, 'health'])
            ->withoutMiddleware([StartSession::class, ShareErrorsFromSession::class, PreventRequestForgery::class]);

        Route::post('auth/google', [ApiController::class, 'google'])
            ->middleware(['origin.allowed', 'throttle:auth-google']);
        Route::get('auth/session', [ApiController::class, 'session'])->middleware('current.user');
        Route::post('auth/logout', [ApiController::class, 'logout'])
            ->middleware(['origin.allowed', 'current.user']);

        Route::get('admin/coordinators', [ApiController::class, 'coordinators'])
            ->middleware(['current.user', 'account.active', 'role:admin']);
        Route::post('admin/coordinators', [ApiController::class, 'provisionCoordinator'])
            ->middleware(['origin.allowed', 'throttle:provision-coordinators', 'current.user', 'account.active', 'role:admin']);

        Route::get('coordinator/instructors', [ApiController::class, 'instructors'])
            ->middleware(['current.user', 'account.active', 'role:coordinator']);
        Route::post('coordinator/instructors', [ApiController::class, 'provisionInstructor'])
            ->middleware(['origin.allowed', 'throttle:provision-instructors', 'current.user', 'account.active', 'role:coordinator']);

        // These GET-only endpoints are intentionally sessionless and can never
        // initialize a browser session for repository visitors.
        Route::middleware([])->withoutMiddleware([StartSession::class, ShareErrorsFromSession::class, PreventRequestForgery::class])->group(function (): void {
            Route::get('categories', [CategoryController::class, 'index']);
            Route::get('repository', [PublicRepositoryController::class, 'index'])->middleware('throttle:public-search');
            Route::get('repository/{researchDocument}', [PublicRepositoryController::class, 'show']);
        });

        Route::middleware(['current.user', 'account.active'])->group(function (): void {
            Route::get('research', [ResearchController::class, 'index']);
            Route::post('research', [ResearchController::class, 'store'])->middleware('origin.allowed');
            Route::get('research/{researchDocument}', [ResearchController::class, 'show']);
            Route::patch('research/{researchDocument}', [ResearchController::class, 'update'])->middleware('origin.allowed');
            Route::get('research/{researchDocument}/authors', [ResearchController::class, 'authors']);
            Route::put('research/{researchDocument}/authors', [ResearchController::class, 'replaceAuthors'])->middleware('origin.allowed');
            Route::post('research/{researchDocument}/submit', [ResearchController::class, 'submit'])->middleware('origin.allowed');
            Route::patch('research/{researchDocument}/status', [ResearchController::class, 'transition'])->middleware('origin.allowed');
            Route::post('research/{researchDocument}/archive', [ResearchController::class, 'archive'])->middleware('origin.allowed');
            Route::get('research/{researchDocument}/reviewers', [ReviewAssignmentController::class, 'index']);
            Route::put('research/{researchDocument}/reviewers', [ReviewAssignmentController::class, 'update'])->middleware(['origin.allowed', 'throttle:domain-mutations']);

            Route::get('research/{researchDocument}/files', [DocumentFileController::class, 'index']);
            Route::post('research/{researchDocument}/files', [DocumentFileController::class, 'store'])->middleware(['origin.allowed', 'throttle:research-upload']);
            Route::get('research/{researchDocument}/files/{documentFile}/download', [DocumentFileController::class, 'download']);

            Route::get('research/{researchDocument}/similarity', [SimilarityController::class, 'index']);
            Route::post('research/{researchDocument}/similarity/check', [SimilarityController::class, 'check'])->middleware(['origin.allowed', 'throttle:similarity-results']);

            Route::get('research/{researchDocument}/feedback', [FeedbackController::class, 'index']);
            Route::post('research/{researchDocument}/feedback', [FeedbackController::class, 'store'])->middleware('origin.allowed');
            Route::patch('research/{researchDocument}/feedback/{feedback}', [FeedbackController::class, 'update'])->middleware('origin.allowed');
            Route::get('research/{researchDocument}/revisions', [RevisionController::class, 'index']);
            Route::post('research/{researchDocument}/revisions', [RevisionController::class, 'store'])->middleware('origin.allowed');
            Route::patch('research/{researchDocument}/revisions/{revision}/resubmit', [RevisionController::class, 'resubmit'])->middleware('origin.allowed');
            Route::get('research/{researchDocument}/monitoring', [MonitoringController::class, 'index']);
            Route::get('research/{researchDocument}/validation', [TitleValidationController::class, 'index']);
            Route::post('research/{researchDocument}/validation', [TitleValidationController::class, 'store'])->middleware('origin.allowed');
            Route::patch('research/{researchDocument}/validation/{titleValidation}', [TitleValidationController::class, 'update'])->middleware('origin.allowed');
            Route::get('notifications', [NotificationController::class, 'index']);
            Route::patch('notifications/{notification}/read', [NotificationController::class, 'read'])->middleware('origin.allowed');

            Route::post('categories', [CategoryController::class, 'store'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::patch('categories/{category}', [CategoryController::class, 'update'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
        });
    });
