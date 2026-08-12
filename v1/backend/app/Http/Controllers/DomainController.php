<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

abstract class DomainController extends Controller
{
    protected function actor(Request $request): User
    {
        return $request->attributes->get('current_user');
    }

    protected function allowed(bool $allowed): void
    {
        abort_unless($allowed, 403);
    }
}
