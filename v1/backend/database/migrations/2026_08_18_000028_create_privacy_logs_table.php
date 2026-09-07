<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('privacy_logs', function (Blueprint $table): void {
            $table->id();
            $table->char('user_id', 36)->nullable();
            $table->char('performed_by', 36)->nullable();
            $table->string('action', 100);
            $table->text('details')->nullable();
            $table->dateTime('activity_date', 6);
            $table->timestamp('created_at', 6)->useCurrent();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();
            $table->foreign('performed_by')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();
            $table->index(['user_id', 'activity_date'], 'privacy_log_user_date_idx');
            $table->index(['action', 'activity_date'], 'privacy_log_action_date_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('privacy_logs');
    }
};
