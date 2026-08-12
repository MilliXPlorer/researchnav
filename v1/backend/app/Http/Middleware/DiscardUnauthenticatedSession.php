<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DiscardUnauthenticatedSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $request->hasSession() || $request->session()->has('user_id')) {
            return $response;
        }

        $session = $request->session();
        $session->getHandler()->destroy($session->getId());

        $name = (string) config('session.cookie');
        $path = (string) config('session.path', '/');
        $domain = config('session.domain');
        $hadCookie = $request->cookies->has($name);

        if ($hadCookie || $request->is('api/auth/logout')) {
            $response->headers->clearCookie($name, $path, $domain);
        } else {
            $response->headers->removeCookie($name, $path, $domain);
        }

        return $response;
    }
}
