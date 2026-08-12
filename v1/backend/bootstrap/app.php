<?php

use App\Exceptions\ApiValidationException;
use App\Http\Middleware\DiscardUnauthenticatedSession;
use App\Http\Middleware\EnsureActiveAccount;
use App\Http\Middleware\EnsureAllowedOrigin;
use App\Http\Middleware\EnsureRequestBodySize;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\ResolveCurrentUser;
use App\Http\Middleware\StartResearchNavSession;
use App\Http\Middleware\TrustConfiguredProxies;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(DiscardUnauthenticatedSession::class);
        $middleware->alias([
            'origin.allowed' => EnsureAllowedOrigin::class,
            'current.user' => ResolveCurrentUser::class,
            'account.active' => EnsureActiveAccount::class,
            'role' => EnsureRole::class,
            'api.bodylimit' => EnsureRequestBodySize::class,
        ]);
        $middleware->validateCsrfTokens(except: ['api/*']);
        $middleware->replace(
            TrustProxies::class,
            TrustConfiguredProxies::class,
        );
        $middleware->replace(
            StartSession::class,
            StartResearchNavSession::class,
        );
        $middleware->remove(HandleCors::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (ApiValidationException $exception, Request $request): ?Response {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'error' => 'INVALID_REQUEST',
                'details' => ['formErrors' => [], 'fieldErrors' => $exception->fieldErrors],
            ], 400);
        });
        $exceptions->render(function (ValidationException $exception, Request $request): ?Response {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json(['error' => 'VALIDATION_FAILED', 'errors' => $exception->errors()], 422);
        });
        $exceptions->render(function (ModelNotFoundException $exception, Request $request): ?Response {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json(['error' => 'NOT_FOUND'], 404);
        });
        $exceptions->render(function (Throwable $exception, Request $request): ?Response {
            if (! $request->is('api/*')) {
                return null;
            }

            if ($exception instanceof HttpExceptionInterface) {
                return response()->json([
                    'error' => match ($exception->getStatusCode()) {
                        404 => 'NOT_FOUND',
                        413 => 'PAYLOAD_TOO_LARGE',
                        429 => 'RATE_LIMIT_EXCEEDED',
                        default => 'REQUEST_FAILED',
                    },
                ], $exception->getStatusCode());
            }

            report($exception);

            return response()->json(['error' => 'INTERNAL_SERVER_ERROR'], 500);
        });
    })->create();
