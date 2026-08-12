<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->attributes->get('current_user');

        if (! $user instanceof User) {
            return response()->json(['error' => 'AUTHENTICATION_REQUIRED'], 401);
        }

        if (! $user->is_admin && ! in_array($user->role, $roles, true)) {
            return response()->json(['error' => 'ROLE_NOT_AUTHORIZED'], 403);
        }

        return $next($request);
    }
}
