<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use Illuminate\Http\Request;

class NotificationController extends DomainController
{
    public function index(Request $request)
    {
        return NotificationResource::collection($this->actor($request)->notifications()->latest()->paginate());
    }

    public function read(Request $request, string $notification)
    {
        $item = $this->actor($request)->notifications()->whereKey($notification)->firstOrFail();
        $item->markAsRead();

        return new NotificationResource($item->fresh());
    }
}
