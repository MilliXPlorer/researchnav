<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['revision', 'title_validation', 'feedback'] as $type) {
            DB::table('research_review_records')
                ->where('source_type', $type)
                ->update(['review_type' => $type]);
        }
    }

    public function down(): void
    {
        DB::table('research_review_records')->update(['review_type' => null]);
    }
};
