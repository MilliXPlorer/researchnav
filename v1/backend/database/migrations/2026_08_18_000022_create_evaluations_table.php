<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('evaluations', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('research_document_id');
            $table->char('panelist_id', 36);
            $table->unsignedTinyInteger('originality');
            $table->unsignedTinyInteger('methodology');
            $table->unsignedTinyInteger('clarity');
            $table->text('comments')->nullable();
            $table->dateTime('submitted_at', 6);
            $table->timestamps(6);
            $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
            $table->foreign('panelist_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['research_document_id', 'panelist_id'], 'evaluation_document_panelist_unique');
        });

        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE evaluations ADD CONSTRAINT evaluations_originality_bounds CHECK (originality between 1 and 5)');
            DB::statement('ALTER TABLE evaluations ADD CONSTRAINT evaluations_methodology_bounds CHECK (methodology between 1 and 5)');
            DB::statement('ALTER TABLE evaluations ADD CONSTRAINT evaluations_clarity_bounds CHECK (clarity between 1 and 5)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('evaluations');
    }
};
