<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->string('institution_name', 255)->nullable()->after('publication_year');
            $table->string('institution_location', 255)->nullable()->after('institution_name');
            $table->string('academic_unit', 255)->nullable()->after('institution_location');
            $table->string('degree_program', 255)->nullable()->after('academic_unit');
            $table->string('manuscript_date_label', 50)->nullable()->after('degree_program');
            $table->string('abstract_provenance', 255)->nullable()->after('manuscript_date_label');
        });
    }

    public function down(): void
    {
        Schema::table('research_documents', function (Blueprint $table): void {
            $table->dropColumn([
                'institution_name',
                'institution_location',
                'academic_unit',
                'degree_program',
                'manuscript_date_label',
                'abstract_provenance',
            ]);
        });
    }
};
