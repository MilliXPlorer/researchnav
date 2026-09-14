<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use App\Services\AccessRequestService;
use Illuminate\Http\Request;

class NotificationController extends DomainController
{
    public function index(Request $request, AccessRequestService $accessRequests)
    {
        $actor = $this->actor($request);
        $accessRequests->syncPendingNotificationsFor($actor);

        return NotificationResource::collection($actor->notifications()->latest()->paginate());
    }

    public function read(Request $request, string $notification)
    {
        $item = $this->actor($request)->notifications()->whereKey($notification)->firstOrFail();
        $item->markAsRead();

        return new NotificationResource($item->fresh());
    }
}
