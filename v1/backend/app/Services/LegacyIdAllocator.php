<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

class LegacyIdAllocator
{
    public function next(string $type): int
    {
        if (! Schema::hasTable('legacy_id_sequences')) {
            do {
                $next = random_int(1, PHP_INT_MAX);
            } while (DB::table('activity_logs')->where('stream', $type)->where('source_id', $next)->exists());

            return $next;
        }

        $sequence = DB::table('legacy_id_sequences')->where('source_type', $type)->lockForUpdate()->first();
        if ($sequence === null) {
            throw new RuntimeException("Missing legacy ID sequence [{$type}].");
        }

        $next = (int) $sequence->next_id;
        DB::table('legacy_id_sequences')->where('source_type', $type)->update(['next_id' => $next + 1]);

        return $next;
    }
}
