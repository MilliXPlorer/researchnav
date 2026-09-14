<?php

namespace App\Models;

use App\Services\LegacyIdAllocator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

abstract class ConsolidatedActivityModel extends Model
{
    protected static string $activityStream;

    protected static array $consolidatedAliases = [];

    public function getTable(): string
    {
        $legacy = parent::getTable();

        return Schema::hasTable($legacy) ? $legacy : 'activity_logs';
    }

    public function usesConsolidatedStorage(): bool
    {
        return $this->getTable() === 'activity_logs';
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
        static::addGlobalScope('activity_stream', function (Builder $query): void {
            if ($query->getModel()->usesConsolidatedStorage()) {
                $query->where($query->getModel()->qualifyColumn('stream'), static::$activityStream);
            }
        });
        static::creating(function (self $record): void {
            if (! $record->usesConsolidatedStorage()) {
                return;
            }
            $record->setRawAttributes(array_merge($record->getAttributes(), [
                'stream' => static::$activityStream,
                'source_id' => app(LegacyIdAllocator::class)->next(static::$activityStream),
                'occurred_at' => $record->getRawOriginal('occurred_at') ?? now(),
            ]));
        });
    }

    private function mappedAttribute(string $key): string
    {
        return $this->usesConsolidatedStorage()
            ? (static::$consolidatedAliases[$key] ?? $key)
            : $key;
    }
}
