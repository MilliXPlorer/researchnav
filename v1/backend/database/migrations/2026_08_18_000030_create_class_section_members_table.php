<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('class_section_members', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('class_section_id');
            $table->char('user_id', 36);
            $table->timestamps(6);
            $table->foreign('class_section_id')->references('id')->on('class_sections')->cascadeOnDelete()->restrictOnUpdate();
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
            $table->unique(['class_section_id', 'user_id'], 'class_section_members_section_user_unique');
            $table->index('user_id', 'class_section_members_user_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('class_section_members');
    }
};
