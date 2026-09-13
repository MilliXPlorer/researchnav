<?php

use App\Models\UserRole;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('user_roles')->updateOrInsert(
            ['slug' => UserRole::RESEARCH_EDITOR],
            [
                'name' => 'Research Editor',
                'description' => 'Research manuscript editorial reviewer.',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
        $editorRoleId = DB::table('user_roles')->where('slug', UserRole::RESEARCH_EDITOR)->value('id');

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE users MODIFY role ENUM('admin','researcher','adviser','instructor','panel','statistician','coordinator','librarian','research-office','academics','research_editor') NOT NULL");
        }

        DB::table('users')->where('role_id', $editorRoleId)->update(['role' => 'research_editor']);
        $academics = DB::table('users')
            ->where('role', 'academics')
            ->where(fn ($query) => $query->whereNull('role_id')->orWhere('role_id', '!=', $editorRoleId))
            ->pluck('id');

        if ($academics->isNotEmpty()) {
            DB::table('users')->whereIn('invited_by', $academics)->update(['invited_by' => null]);
            DB::table('sessions')->whereIn('user_id', $academics)->delete();
            if (Schema::hasTable('access_requests')) {
                DB::table('access_requests')->whereIn('user_id', $academics)->delete();
            }
            if (Schema::hasTable('saved_library_items')) {
                DB::table('saved_library_items')->whereIn('user_id', $academics)->delete();
            }
            DB::table('users')->whereIn('id', $academics)->delete();
        }

        Schema::dropIfExists('saved_library_items');

        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE users MODIFY role ENUM('admin','researcher','adviser','instructor','panel','statistician','coordinator','librarian','research-office','research_editor') NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement("ALTER TABLE users MODIFY role ENUM('admin','researcher','adviser','instructor','panel','statistician','coordinator','librarian','research-office','academics','research_editor') NOT NULL");
        }

        if (! Schema::hasTable('saved_library_items')) {
            Schema::create('saved_library_items', function (Blueprint $table): void {
                $table->id();
                $table->char('user_id', 36);
                $table->unsignedBigInteger('research_document_id');
                $table->timestamps();
                $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete()->restrictOnUpdate();
                $table->foreign('research_document_id')->references('id')->on('research_documents')->restrictOnDelete()->restrictOnUpdate();
                $table->unique(['user_id', 'research_document_id'], 'saved_library_user_document_unique');
            });
        }
    }
};
