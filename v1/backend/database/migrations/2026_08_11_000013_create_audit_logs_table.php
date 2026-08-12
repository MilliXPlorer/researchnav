<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->char('user_id', 36)->nullable();
            $table->string('action', 100);
            $table->string('entity_type', 150)->nullable();
            $table->string('entity_id', 100)->nullable();
            $table->longText('description')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('created_at', 6)->useCurrent();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();
            $table->index(['entity_type', 'entity_id']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
