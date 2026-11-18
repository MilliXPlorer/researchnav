<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const INDEX = 'class_sections_institute_active_idx';

    public function up(): void
    {
        Schema::table('class_sections', function (Blueprint $table): void {
            $table->string('institute', 180)->nullable()->after('instructor_id');
            $table->index(['institute', 'is_active'], self::INDEX);
        });

        DB::table('research_documents')
            ->whereNotNull('section_id')
            ->whereNull('deleted_at')
            ->whereNotNull('institute')
            ->select(['section_id', 'institute'])
            ->orderBy('section_id')
            ->orderBy('id')
            ->get()
            ->groupBy('section_id')
            ->each(function ($documents, $sectionId): void {
                $institutes = $documents
                    ->map(fn ($document): string => trim((string) $document->institute))
                    ->filter(fn (string $institute): bool => $institute !== '')
                    ->unique()
                    ->values();

                if ($institutes->count() === 1) {
                    DB::table('class_sections')
                        ->where('id', $sectionId)
                        ->whereNull('institute')
                        ->update(['institute' => $institutes->first()]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('class_sections', function (Blueprint $table): void {
            $table->dropIndex(self::INDEX);
            $table->dropColumn('institute');
        });
    }
};
