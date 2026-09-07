<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('research_review_records', function (Blueprint $table): void {
            $table->boolean('format_compliant')->nullable();
            $table->boolean('attachments_compliant')->nullable();
            $table->boolean('consent_forms_compliant')->nullable();
            $table->text('notes')->nullable();
            $table->dateTime('signed_off_at', 6)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('research_review_records', function (Blueprint $table): void {
            $table->dropColumn([
                'format_compliant',
                'attachments_compliant',
                'consent_forms_compliant',
                'notes',
                'signed_off_at',
            ]);
        });
    }
};
