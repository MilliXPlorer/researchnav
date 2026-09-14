<?php

namespace App\Http\Middleware;

use App\Services\DomainAuthorization;
use Closure;
use Illuminate\Http\Request;

class EnsureActiveAdministrator
{
    public function handle(Request $request, Closure $next)
    {
        $actor = $request->attributes->get('current_user');
        if ($actor === null || ! DomainAuthorization::isActiveAdministrator($actor)) {
            return response()->json(['error' => 'ROLE_NOT_AUTHORIZED'], 403);
        }

        return $next($request);
    }
}
