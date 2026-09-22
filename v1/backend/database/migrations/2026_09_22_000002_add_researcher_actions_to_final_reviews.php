<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('research_reviews')) {
            return;
        }

        Schema::table('research_reviews', function (Blueprint $table): void {
            if (! Schema::hasColumn('research_reviews', 'researcher_acknowledged_at')) {
                $table->timestamp('researcher_acknowledged_at', 6)->nullable()->after('resolved_at');
            }
            if (! Schema::hasColumn('research_reviews', 'researcher_addressed_at')) {
                $table->timestamp('researcher_addressed_at', 6)->nullable()->after('researcher_acknowledged_at');
            }
            if (! Schema::hasColumn('research_reviews', 'researcher_action_remarks')) {
                $table->longText('researcher_action_remarks')->nullable()->after('researcher_addressed_at');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('research_reviews')) {
            return;
        }

        $columns = collect(['researcher_acknowledged_at', 'researcher_addressed_at', 'researcher_action_remarks'])
            ->filter(fn (string $column): bool => Schema::hasColumn('research_reviews', $column))
            ->all();
        if ($columns !== []) {
            Schema::table('research_reviews', fn (Blueprint $table) => $table->dropColumn($columns));
        }
    }
};
