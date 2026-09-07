<?php

namespace App\Models;

use App\Services\LegacyIdAllocator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

abstract class ConsolidatedReviewModel extends Model
{
    protected static string $reviewType;

    protected static array $consolidatedAliases = [];

    protected static array $finalReviewTypes = [];

    public function getTable(): string
    {
        $legacy = parent::getTable();

        if (Schema::hasTable($legacy)) {
            return $legacy;
        }

        return Schema::hasTable('research_reviews') ? 'research_reviews' : 'research_review_records';
    }

    public function usesConsolidatedStorage(): bool
    {
        return $this->getTable() === 'research_review_records';
    }

    public function usesFinalStorage(): bool
    {
        return $this->getTable() === 'research_reviews';
    }

    public static function column(string $legacyColumn): string
    {
        $model = new static;

        return $model->usesConsolidatedStorage()
            ? (static::$consolidatedAliases[$legacyColumn] ?? $legacyColumn)
            : $legacyColumn;
    }

    public function getRouteKeyName(): string
    {
        return $this->usesConsolidatedStorage() ? 'source_id' : parent::getRouteKeyName();
    }

    public function getKeyName(): string
    {
        return $this->usesConsolidatedStorage() ? 'source_id' : parent::getKeyName();
    }

    public function getAttribute($key): mixed
    {
        return parent::getAttribute($this->mappedAttribute((string) $key));
    }

    public function setAttribute($key, $value): static
    {
        return parent::setAttribute($this->mappedAttribute((string) $key), $value);
    }

    protected static function booted(): void
    {
        static::addGlobalScope('review_type', function (Builder $query): void {
            if ($query->getModel()->usesFinalStorage()) {
                $types = static::$finalReviewTypes ?: [static::$reviewType];
                $query->whereIn($query->getModel()->qualifyColumn('review_type'), $types);
            } elseif ($query->getModel()->usesConsolidatedStorage()) {
                $query->where($query->getModel()->qualifyColumn('review_type'), static::$reviewType);
            }
        });
        static::creating(function (self $record): void {
            if (! $record->usesConsolidatedStorage() || $record->usesFinalStorage()) {
                return;
            }
            $record->setRawAttributes(array_merge($record->getAttributes(), [
                'source_type' => static::$reviewType,
                'review_type' => static::$reviewType,
                'source_id' => app(LegacyIdAllocator::class)->next(static::$reviewType),
            ]));
        });
    }

    private function mappedAttribute(string $key): string
    {
        return ($this->usesConsolidatedStorage() || $this->usesFinalStorage())
            ? (static::$consolidatedAliases[$key] ?? $key)
            : $key;
    }
}
