<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveAccount
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->attributes->get('current_user');

        if (! $user instanceof User) {
            return response()->json(['error' => 'AUTHENTICATION_REQUIRED'], 401);
        }

        if ($user->account_status !== 'active') {
            return response()->json(['error' => 'ACCOUNT_ACCESS_PENDING'], 403);
        }

        return $next($request);
    }
}
