<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\DomainAuthorization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureOfficeAuthority
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->attributes->get('current_user');

        if (! $user instanceof User) {
            return response()->json(['error' => 'AUTHENTICATION_REQUIRED'], 401);
        }

        // Office authority is granted to active administrators and to the
        // legacy research-office string only. Compatibility roles such as
        // coordinator or academics map to the canonical research_office slug
        // for identity purposes but must never inherit office authority; the
        // service layer already agrees via DomainAuthorization::isOffice().
        if (! DomainAuthorization::isOffice($user)) {
            return response()->json(['error' => 'ROLE_NOT_AUTHORIZED'], 403);
        }

        return $next($request);
    }
}
