<?php

namespace App\Http\Controllers;

use App\Http\Resources\SdgResource;
use App\Models\Sdg;

class SdgController extends Controller
{
    public function index()
    {
        return SdgResource::collection(Sdg::query()->orderBy('id')->get());
    }
}
