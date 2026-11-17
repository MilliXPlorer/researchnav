<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['metadata_reviews', 'research_review_records'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'category_complete')) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropColumn('category_complete'));
            }
        }

        if (Schema::hasTable('research_documents') && Schema::hasColumn('research_documents', 'category_id')) {
            $foreignKeys = collect(Schema::getForeignKeys('research_documents'))
                ->filter(fn (array $foreignKey): bool => $foreignKey['columns'] === ['category_id']
                    && $foreignKey['foreign_table'] === 'categories');

            $isSqlite = DB::connection()->getDriverName() === 'sqlite';

            Schema::table('research_documents', function (Blueprint $table) use ($foreignKeys, $isSqlite): void {
                if ($isSqlite && $foreignKeys->isNotEmpty()) {
                    $table->dropForeign(['category_id']);
                } elseif (! $isSqlite) {
                    foreach ($foreignKeys as $foreignKey) {
                        $table->dropForeign($foreignKey['name']);
                    }
                }
                foreach (['research_documents_category_year_idx', 'rd_category_idx'] as $index) {
                    if (Schema::hasIndex('research_documents', $index)) {
                        $table->dropIndex($index);
                    }
                }
                $table->dropColumn('category_id');
            });
        }

        Schema::dropIfExists('categories');
    }

    public function down(): void
    {
        throw new RuntimeException(
            'This migration is irreversible because category data and associations were removed.',
        );
    }
};
