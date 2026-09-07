<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sustainable_development_goals', function (Blueprint $table): void {
            $table->unsignedTinyInteger('number');
            $table->string('title');

            $table->primary('number', 'sustainable_development_goals_number_primary');
            $table->unique('title', 'sustainable_development_goals_title_unique');
        });

        DB::table('sustainable_development_goals')->insert([
            ['number' => 1, 'title' => 'No Poverty'],
            ['number' => 2, 'title' => 'Zero Hunger'],
            ['number' => 3, 'title' => 'Good Health and Well-being'],
            ['number' => 4, 'title' => 'Quality Education'],
            ['number' => 5, 'title' => 'Gender Equality'],
            ['number' => 6, 'title' => 'Clean Water and Sanitation'],
            ['number' => 7, 'title' => 'Affordable and Clean Energy'],
            ['number' => 8, 'title' => 'Decent Work and Economic Growth'],
            ['number' => 9, 'title' => 'Industry, Innovation and Infrastructure'],
            ['number' => 10, 'title' => 'Reduced Inequalities'],
            ['number' => 11, 'title' => 'Sustainable Cities and Communities'],
            ['number' => 12, 'title' => 'Responsible Consumption and Production'],
            ['number' => 13, 'title' => 'Climate Action'],
            ['number' => 14, 'title' => 'Life Below Water'],
            ['number' => 15, 'title' => 'Life on Land'],
            ['number' => 16, 'title' => 'Peace, Justice and Strong Institutions'],
            ['number' => 17, 'title' => 'Partnerships for the Goals'],
        ]);

        Schema::create('manuscript_sdg_classifications', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('manuscript_search_document_id');
            $table->string('detector_version', 100);
            $table->dateTime('projection_indexed_at', 6);
            $table->dateTime('classified_at', 6);
            $table->timestamps(6);

            $table->foreign('manuscript_search_document_id', 'manuscript_sdg_classifications_search_document_fk')
                ->references('id')
                ->on('manuscript_search_documents')
                ->cascadeOnDelete()
                ->restrictOnUpdate();
            $table->unique('manuscript_search_document_id', 'manuscript_sdg_classifications_search_document_unique');
        });

        Schema::create('manuscript_sdg_detections', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('manuscript_sdg_classification_id');
            $table->unsignedTinyInteger('sdg_number');
            $table->timestamps(6);

            $table->foreign('manuscript_sdg_classification_id', 'manuscript_sdg_detections_classification_fk')
                ->references('id')
                ->on('manuscript_sdg_classifications')
                ->cascadeOnDelete()
                ->restrictOnUpdate();
            $table->foreign('sdg_number', 'manuscript_sdg_detections_sdg_number_fk')
                ->references('number')
                ->on('sustainable_development_goals')
                ->restrictOnDelete()
                ->restrictOnUpdate();
            $table->unique(
                ['manuscript_sdg_classification_id', 'sdg_number'],
                'manuscript_sdg_detections_classification_sdg_unique'
            );
            $table->index('sdg_number', 'manuscript_sdg_detections_sdg_number_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manuscript_sdg_detections');
        Schema::dropIfExists('manuscript_sdg_classifications');
        Schema::dropIfExists('sustainable_development_goals');
    }
};
