<?php

namespace App\Http\Middleware;

use App\Services\AccountService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ResolveOptionalCurrentUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->session()->get('user_id');

        if (is_string($id) && $id !== '') {
            $user = app(AccountService::class)->findById($id);
            if ($user !== null) {
                $request->attributes->set('current_user', $user);
            }
        }

        return $next($request);
    }
}
