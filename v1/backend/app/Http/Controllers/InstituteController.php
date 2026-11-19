<?php

namespace App\Http\Controllers;

use App\Models\Institute;
use App\Models\ResearchDocument;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class InstituteController extends Controller
{
    public function index(): JsonResponse
    {
        $institutes = collect(ResearchDocument::INSTITUTES)
            ->merge(Schema::hasTable('institutes') ? Institute::query()->pluck('name') : [])
            ->filter()->unique()->sort()->values();

        return response()->json(['data' => $institutes])->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:180']]);
        $name = trim($data['name']);
        if ($name === '') {
            throw ValidationException::withMessages(['name' => ['The institute name is required.']]);
        }
        if (collect(ResearchDocument::INSTITUTES)->contains(fn (string $value) => strcasecmp($value, $name) === 0)) {
            throw ValidationException::withMessages(['name' => ['This institute already exists.']]);
        }
        if (Institute::query()->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->exists()) {
            throw ValidationException::withMessages(['name' => ['This institute already exists.']]);
        }
        Institute::query()->create(['name' => $name]);

        return response()->json(['data' => $name], 201);
    }

    public function destroy(string $institute): JsonResponse
    {
        $name = rawurldecode($institute);
        $record = Institute::query()->where('name', $name)->firstOrFail();
        $usage = User::query()->where('institute', $name)->count()
            + ResearchDocument::query()->where('institute', $name)->count();
        if ($usage > 0) {
            return response()->json(['error' => 'INSTITUTE_IN_USE'], 409);
        }
        $record->delete();

        return response()->json(['data' => ['name' => $name, 'removed' => true]])
            ->header('Cache-Control', 'private, no-store');
    }
}
