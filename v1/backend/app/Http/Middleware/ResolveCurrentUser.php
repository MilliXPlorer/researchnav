<?php

namespace App\Http\Middleware;

use App\Services\AccountService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveCurrentUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->session()->get('user_id');

        if (! is_string($id) || $id === '') {
            return response()->json(['error' => 'AUTHENTICATION_REQUIRED'], 401);
        }

        $user = app(AccountService::class)->findById($id);

        if ($user === null) {
            $request->session()->invalidate();

            return response()->json(['error' => 'SESSION_USER_NOT_FOUND'], 401);
        }

        $request->attributes->set('current_user', $user);

        return $next($request);
    }
}
