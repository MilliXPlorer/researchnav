<?php

namespace App\Http\Controllers;

use App\Models\ResearchDocument;
use Illuminate\Http\JsonResponse;

class InstituteController extends Controller
{
    public function index(): JsonResponse
    {
        $institutes = collect(ResearchDocument::INSTITUTES)->values();

        return response()->json(['data' => $institutes])->header('Cache-Control', 'private, no-store');
    }
}
