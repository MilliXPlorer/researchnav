<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAllowedOrigin
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->header('Origin');

        if ($origin !== null && in_array($origin, config('researchnav.allowed_origins'), true)) {
            return $next($request);
        }

        return response()->json(['error' => 'ORIGIN_NOT_ALLOWED'], 403);
    }
}
