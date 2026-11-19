<?php

use App\Models\ResearchDocument;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('institutes')) {
            Schema::create('institutes', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 180)->unique();
                $table->timestamps();
            });
        }

        foreach (ResearchDocument::INSTITUTES as $institute) {
            if (! DB::table('institutes')->where('name', $institute)->exists()) {
                DB::table('institutes')->insert([
                    'name' => $institute,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('institutes');
    }
};
