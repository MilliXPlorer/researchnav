<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('research_documents')->whereNull('submission_reference')->chunkById(500, function (Collection $researches): void {
            $researches->each(function (object $research): void {
                DB::table('research_documents')->where('id', $research->id)->whereNull('submission_reference')->update([
                    'submission_reference' => 'RN-LEGACY-'.str_pad((string) $research->id, 8, '0', STR_PAD_LEFT),
                ]);
            });
        });

        if (DB::table('research_documents')->whereNull('submission_reference')->exists()) {
            throw new RuntimeException('Submission reference backfill did not complete.');
        }

        Schema::table('research_documents', function (Blueprint $table): void {
            $table->string('submission_reference', 40)->nullable(false)->change();
        });
    }

    public function down(): void
    {
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->string('submission_reference', 40)->nullable()->change();
        });
    }
};
