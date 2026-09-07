<?php

namespace App\Http\Controllers;

use App\Http\Resources\SustainableDevelopmentGoalResource;
use App\Models\SustainableDevelopmentGoal;

class SustainableDevelopmentGoalController extends Controller
{
    public function index()
    {
        return SustainableDevelopmentGoalResource::collection(SustainableDevelopmentGoal::query()->orderBy('number')->get());
    }
}
