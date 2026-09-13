<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('research_documents', 'academic_unit') && ! Schema::hasColumn('research_documents', 'institute')) {
            Schema::table('research_documents', function (Blueprint $table): void {
                $table->renameColumn('academic_unit', 'institute');
            });
        }

        $institutes = [
            'Institute of Computer Studies',
            'Institute of Health Sciences',
            'Institute of Business and Financial Management',
            'Institute of Arts and Sciences',
            'Institute of Criminal Justice Education',
            'Institute of Teacher Education',
        ];

        DB::table('research_documents')
            ->whereNull('institute')
            ->whereIn('institution_name', $institutes)
            ->update(['institute' => DB::raw('institution_name')]);

        $affectedDocumentIds = DB::table('research_authors')
            ->whereRaw('LOWER(author_name) LIKE ?', ['major in %'])
            ->distinct()
            ->pluck('research_document_id');

        DB::table('research_authors')
            ->whereRaw('LOWER(author_name) LIKE ?', ['major in %'])
            ->delete();

        foreach ($affectedDocumentIds as $documentId) {
            DB::table('research_authors')
                ->where('research_document_id', $documentId)
                ->orderBy('author_order')
                ->get(['id'])
                ->values()
                ->each(function (object $author, int $index): void {
                    DB::table('research_authors')
                        ->where('id', $author->id)
                        ->update(['author_order' => $index + 1]);
                });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('research_documents', 'institute') && ! Schema::hasColumn('research_documents', 'academic_unit')) {
            Schema::table('research_documents', function (Blueprint $table): void {
                $table->renameColumn('institute', 'academic_unit');
            });
        }
    }
};
