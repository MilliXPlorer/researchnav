<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRequestBodySize
{
    private const MAX_BYTES = 32 * 1024;

    private const MAX_PROFILE_PHOTO_REQUEST_BYTES = 3 * 1024 * 1024;

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethod('POST') && $request->is('api/profile/photo')) {
            if ((int) $request->header('Content-Length', 0) > self::MAX_PROFILE_PHOTO_REQUEST_BYTES) {
                return response()->json(['error' => 'PAYLOAD_TOO_LARGE'], 413);
            }

            return $next($request);
        }

        // UploadDocumentRequest owns multipart limits.  Applying the small JSON
        // request limit to multipart bodies would reject legitimate documents.
        if (! $request->isJson()) {
            return $next($request);
        }

        $contentLength = (int) $request->header('Content-Length', 0);
        $rawContentLength = strlen($request->getContent());

        if ($contentLength > self::MAX_BYTES || $rawContentLength > self::MAX_BYTES) {
            return response()->json(['error' => 'PAYLOAD_TOO_LARGE'], 413);
        }

        return $next($request);
    }
}
