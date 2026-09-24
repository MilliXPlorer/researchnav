<?php

namespace App\Http\Middleware;

use App\Services\DomainAuthorization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureCoordinatorAuthority
{
    public function handle(Request $request, Closure $next): Response
    {
        $actor = $request->attributes->get('current_user');
        if ($actor === null || ($actor->role !== 'coordinator' && ! DomainAuthorization::isActiveAdministrator($actor))) {
            return response()->json(['error' => 'ROLE_NOT_AUTHORIZED'], 403);
        }

        return $next($request);
    }
}
