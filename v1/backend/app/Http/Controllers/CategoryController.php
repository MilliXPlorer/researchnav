<?php

namespace App\Http\Controllers;

use App\Http\Requests\CategoryRequest;
use App\Http\Resources\CategoryResource;
use App\Models\Category;
use App\Services\AuditService;
use App\Services\DomainAuthorization;
use Illuminate\Support\Facades\DB;

class CategoryController extends DomainController
{
    public function index()
    {
        return CategoryResource::collection(Category::query()->active()->orderBy('name')->get());
    }

    public function store(CategoryRequest $request, AuditService $audit)
    {
        $this->allowed(DomainAuthorization::isOffice($this->actor($request)));

        $category = DB::transaction(function () use ($request, $audit): Category {
            $category = Category::query()->create($request->validated());
            $audit->log($this->actor($request), 'CATEGORY_CREATED', $category, 'Created research category.', $request);

            return $category;
        });

        return (new CategoryResource($category))->response()->setStatusCode(201);
    }

    public function update(CategoryRequest $request, Category $category, AuditService $audit)
    {
        $this->allowed(DomainAuthorization::isOffice($this->actor($request)));
        DB::transaction(function () use ($request, $category, $audit): void {
            $category->update($request->validated());
            $audit->log($this->actor($request), 'CATEGORY_UPDATED', $category, 'Updated research category.', $request);
        });

        return new CategoryResource($category);
    }
}
