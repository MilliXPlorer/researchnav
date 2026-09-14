<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('class_sections', function (Blueprint $table): void {
            $table->id();
            $table->char('instructor_id', 36);
            $table->string('name', 150);
            $table->string('academic_year', 50)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps(6);
            $table->foreign('instructor_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->index(['instructor_id', 'is_active'], 'class_section_instructor_active_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('class_sections');
    }
};
