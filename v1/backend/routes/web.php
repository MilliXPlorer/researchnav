<?php

use App\Http\Controllers\AcademicsController;
use App\Http\Controllers\AccessRequestController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\AdviserController;
use App\Http\Controllers\ApiController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CoordinatorWorkspaceController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DocumentFileController;
use App\Http\Controllers\FeedbackController;
use App\Http\Controllers\InstructorController;
use App\Http\Controllers\LibrarianController;
use App\Http\Controllers\MonitoringController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PanelController;
use App\Http\Controllers\PublicRepositoryController;
use App\Http\Controllers\ResearchController;
use App\Http\Controllers\ResearchOfficeController;
use App\Http\Controllers\ReviewAssignmentController;
use App\Http\Controllers\RevisionController;
use App\Http\Controllers\SimilarityController;
use App\Http\Controllers\StatisticianController;
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
            ->middleware('origin.allowed');

        Route::prefix('admin')->middleware(['current.user', 'account.active', 'active.admin'])->group(function (): void {
            Route::get('coordinators', [ApiController::class, 'coordinators']);
            Route::post('coordinators', [ApiController::class, 'provisionCoordinator'])
                ->middleware(['origin.allowed', 'throttle:provision-coordinators']);

            Route::get('users', [AdminController::class, 'users']);
            Route::patch('users/{user}', [AdminController::class, 'updateUser'])
                ->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('audit-logs', [AdminController::class, 'auditLogs']);
            Route::get('system-status', [AdminController::class, 'systemStatus']);

            Route::get('access-requests', [AccessRequestController::class, 'index']);
            Route::patch('access-requests/{accessRequest}', [AccessRequestController::class, 'decide'])
                ->middleware(['origin.allowed', 'throttle:domain-mutations']);
        });

        // An applicant is authenticated by Google but has no role yet, so these
        // two routes deliberately omit the active-account requirement.
        Route::middleware('current.user')->group(function (): void {
            Route::get('access-requests/mine', [AccessRequestController::class, 'mine']);
            Route::post('access-requests', [AccessRequestController::class, 'store'])
                ->middleware(['origin.allowed', 'throttle:domain-mutations']);
        });

        Route::get('coordinator/instructors', [ApiController::class, 'instructors'])
            ->middleware(['current.user', 'account.active', 'role:coordinator,admin']);
        Route::post('coordinator/instructors', [ApiController::class, 'provisionInstructor'])
            ->middleware(['origin.allowed', 'throttle:provision-instructors', 'current.user', 'account.active', 'role:coordinator,admin']);

        Route::prefix('adviser')->middleware(['current.user', 'account.active', 'role:adviser'])->group(function (): void {
            Route::get('advisees', [AdviserController::class, 'advisees']);
            Route::get('pending-reviews', [AdviserController::class, 'pendingReviews']);
            Route::get('similarity-alerts', [AdviserController::class, 'similarityAlerts']);
            Route::get('feedback-history', [AdviserController::class, 'feedbackHistory']);
        });

        Route::prefix('instructor')->middleware(['current.user', 'account.active', 'role:instructor'])->group(function (): void {
            Route::get('sections', [InstructorController::class, 'sections']);
            Route::post('sections', [InstructorController::class, 'storeSection'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::patch('sections/{classSection}', [InstructorController::class, 'updateSection'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('sections/{classSection}/documents', [InstructorController::class, 'sectionDocuments']);
            Route::put('sections/{classSection}/documents', [InstructorController::class, 'assignDocuments'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('sections/{classSection}/members', [InstructorController::class, 'sectionMembers']);
            Route::put('sections/{classSection}/members', [InstructorController::class, 'addSectionMembers'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::delete('sections/{classSection}/members/{user}', [InstructorController::class, 'removeSectionMember'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('students', [InstructorController::class, 'students']);
            Route::get('title-proposals', [InstructorController::class, 'titleProposals']);
            Route::get('similarity-overview', [InstructorController::class, 'similarityOverview']);
            Route::get('class-reports', [InstructorController::class, 'classReports']);
        });

        Route::prefix('panel')->middleware(['current.user', 'account.active', 'role:panel'])->group(function (): void {
            Route::get('schedule', [PanelController::class, 'schedule']);
            Route::get('assignments', [PanelController::class, 'assignments']);
            Route::post('evaluations', [PanelController::class, 'submitEvaluation'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('history', [PanelController::class, 'history']);
        });

        Route::prefix('statistician')->middleware(['current.user', 'account.active', 'role:statistician'])->group(function (): void {
            Route::get('queue', [StatisticianController::class, 'queue']);
            Route::put('methodology/{researchDocument}', [StatisticianController::class, 'saveChecklist'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::post('methodology/{researchDocument}/sign-off', [StatisticianController::class, 'signOff'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::post('methodology/{researchDocument}/return', [StatisticianController::class, 'returnForClarification'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('signoffs', [StatisticianController::class, 'signoffs']);
        });

        Route::prefix('coordinator')->middleware(['current.user', 'account.active', 'role:coordinator,admin'])->group(function (): void {
            Route::get('schedules', [CoordinatorWorkspaceController::class, 'schedules']);
            Route::post('schedules', [CoordinatorWorkspaceController::class, 'storeSchedule'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::patch('schedules/{defenseSchedule}', [CoordinatorWorkspaceController::class, 'updateSchedule'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('duplicate-flags', [CoordinatorWorkspaceController::class, 'duplicateFlags']);
            Route::get('adviser-load', [CoordinatorWorkspaceController::class, 'adviserLoad']);
            Route::get('reports', [CoordinatorWorkspaceController::class, 'reports']);
        });

        Route::prefix('librarian')->middleware(['current.user', 'account.active', 'role:librarian'])->group(function (): void {
            Route::get('archiving-queue', [LibrarianController::class, 'archivingQueue']);
            Route::get('catalog', [LibrarianController::class, 'repositoryCatalog']);
            Route::get('metadata-standards', [LibrarianController::class, 'metadataStandards']);
            Route::put('metadata/{researchDocument}', [LibrarianController::class, 'saveMetadataReview'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('retention-logs', [LibrarianController::class, 'retentionLogs']);
            Route::post('retention-logs', [LibrarianController::class, 'recordRetentionLog'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
        });

        Route::prefix('office')->middleware(['current.user', 'account.active', 'office.authority'])->group(function (): void {
            Route::get('compliance', [ResearchOfficeController::class, 'compliance']);
            Route::put('compliance/{researchDocument}', [ResearchOfficeController::class, 'decideCompliance'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('users', [ResearchOfficeController::class, 'users']);
            Route::patch('users/{user}', [ResearchOfficeController::class, 'updateUser'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('reports', [ResearchOfficeController::class, 'reports']);
            Route::get('privacy-logs', [ResearchOfficeController::class, 'privacyLogs']);
            Route::post('privacy-logs', [ResearchOfficeController::class, 'recordPrivacyLog'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
        });

        Route::prefix('academics')->middleware(['current.user', 'account.active', 'role:academics'])->group(function (): void {
            Route::get('library', [AcademicsController::class, 'library']);
            Route::post('library', [AcademicsController::class, 'saveLibraryItem'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::delete('library/{savedLibraryItem}', [AcademicsController::class, 'removeLibraryItem'])->middleware(['origin.allowed', 'throttle:domain-mutations']);
            Route::get('recommendations', [AcademicsController::class, 'recommendations']);
            Route::get('categories', [AcademicsController::class, 'categories']);
        });

        // Public repository reads and query scoring are intentionally sessionless
        // and can never initialize a browser session for repository visitors.
        Route::middleware([])->withoutMiddleware([StartSession::class, ShareErrorsFromSession::class, PreventRequestForgery::class])->group(function (): void {
            Route::get('categories', [CategoryController::class, 'index']);
            Route::get('repository', [PublicRepositoryController::class, 'index'])->middleware('throttle:public-search');
            Route::post('repository/similarity', [PublicRepositoryController::class, 'similarity'])->middleware('throttle:public-repository-similarity');
            Route::get('repository/{researchDocument}', [PublicRepositoryController::class, 'show']);
        });

        Route::middleware(['current.user', 'account.active'])->group(function (): void {
            Route::get('dashboard', [DashboardController::class, 'index']);

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
