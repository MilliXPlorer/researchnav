<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('profile_photo_path')->nullable()->after('last_name');
            $table->string('profile_photo_mime_type', 32)->nullable()->after('profile_photo_path');
            $table->unsignedBigInteger('profile_photo_size')->nullable()->after('profile_photo_mime_type');
            $table->char('profile_photo_version', 36)->nullable()->after('profile_photo_size');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'profile_photo_path',
                'profile_photo_mime_type',
                'profile_photo_size',
                'profile_photo_version',
            ]);
        });
    }
};
