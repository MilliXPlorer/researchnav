<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Access requests let a Google-authenticated account that has no assigned role
 * ask for one, and let an administrator approve or reject that request.
 *
 * Google remains the only credential authority: this table never stores a
 * password, and a request can only be created by an already authenticated
 * account, so it is an authorization request rather than a second login method.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('access_requests', function (Blueprint $table): void {
            $table->id();
            $table->char('user_id', 36);
            $table->string('requested_role', 40);
            $table->string('status', 20)->default('pending');
            $table->string('full_name', 180)->nullable();
            $table->string('program', 180)->nullable();
            $table->text('justification')->nullable();
            $table->char('decided_by', 36)->nullable();
            $table->text('decision_remarks')->nullable();
            $table->dateTime('requested_at', 6);
            $table->dateTime('decided_at', 6)->nullable();
            $table->timestamps(6);

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete()->restrictOnUpdate();
            $table->foreign('decided_by')->references('id')->on('users')->nullOnDelete()->restrictOnUpdate();

            $table->index(['status', 'requested_at'], 'access_request_status_date_idx');
            $table->index('user_id', 'access_request_user_idx');
        });

        // Keep the status column honest on the engines that support CHECK.
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement("ALTER TABLE access_requests ADD CONSTRAINT access_request_status_allowed CHECK (status IN ('pending','approved','rejected'))");
            DB::statement('ALTER TABLE access_requests ADD CONSTRAINT access_request_decision_consistency CHECK ((status = \'pending\' AND decided_at IS NULL) OR (status <> \'pending\' AND decided_at IS NOT NULL))');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('access_requests');
    }
};
