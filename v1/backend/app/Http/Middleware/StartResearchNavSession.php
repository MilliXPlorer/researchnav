<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;

class StartResearchNavSession extends StartSession
{
    protected function handleStatefulRequest(Request $request, $session, Closure $next)
    {
        $request->setLaravelSession($this->startSession($request, $session));
        $this->collectGarbage($session);

        $response = $next($request);

        // Match Express saveUninitialized=false: only authenticated sessions persist.
        if (! $session->has('user_id')) {
            return $response;
        }

        $this->storeCurrentUrl($request, $session);
        $this->addCookieToResponse($response, $session);
        $this->saveSession($request);

        return $response;
    }
}
