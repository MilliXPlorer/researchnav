<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('research_review_assignments')) {
            return;
        }

        Schema::table('research_review_assignments', function (Blueprint $table): void {
            if (! Schema::hasColumn('research_review_assignments', 'status')) {
                $table->string('status', 20)->nullable()->after('is_active');
            }
            if (! Schema::hasColumn('research_review_assignments', 'designation')) {
                $table->string('designation', 50)->nullable()->after('status');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('research_review_assignments')) {
            return;
        }

        Schema::table('research_review_assignments', function (Blueprint $table): void {
            if (Schema::hasColumn('research_review_assignments', 'designation')) {
                $table->dropColumn('designation');
            }
            if (Schema::hasColumn('research_review_assignments', 'status')) {
                $table->dropColumn('status');
            }
        });
    }
};
