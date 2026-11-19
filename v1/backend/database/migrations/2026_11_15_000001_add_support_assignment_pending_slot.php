<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $tableName = $this->assignmentTable();
        if ($tableName === null) {
            return;
        }

        if (! Schema::hasColumn($tableName, 'support_pending_slot')) {
            Schema::table($tableName, function (Blueprint $table): void {
                // NULL releases the slot when a request is accepted or declined.
                $table->boolean('support_pending_slot')->nullable()->after('status');
            });
        }

        if (! Schema::hasColumn($tableName, 'support_history_slot')) {
            Schema::table($tableName, function (Blueprint $table): void {
                // Non-support rows retain slot 0. Each support request gets a
                // stable, distinct slot so declined/replaced history can be
                // retained without weakening non-support assignment identity.
                $table->string('support_history_slot', 40)->default('0')->after('support_pending_slot');
            });
        }

        $roleColumn = $this->roleColumn($tableName);
        $reviewerColumn = $this->reviewerColumn($tableName);
        $this->assertNoDuplicatePendingSupportSlots($tableName, $roleColumn);
        $this->backfillSupportSlots($tableName, $roleColumn);
        $this->replaceLegacyIdentityUnique($tableName, $roleColumn, $reviewerColumn);

        if (! Schema::hasIndex($tableName, 'support_assignment_one_pending_per_role_unique')) {
            Schema::table($tableName, function (Blueprint $table) use ($roleColumn): void {
                $table->unique(
                    ['research_document_id', $roleColumn, 'support_pending_slot'],
                    'support_assignment_one_pending_per_role_unique',
                );
            });
        }
    }

    public function down(): void
    {
        $tableName = $this->assignmentTable();
        if ($tableName === null) {
            return;
        }

        $roleColumn = $this->roleColumn($tableName);
        $reviewerColumn = $this->reviewerColumn($tableName);
        $this->assertRollbackCanRestoreLegacyIdentity($tableName, $roleColumn, $reviewerColumn);

        if (Schema::hasIndex($tableName, 'support_assignment_one_pending_per_role_unique')) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropUnique('support_assignment_one_pending_per_role_unique');
            });
        }

        if (Schema::hasIndex($tableName, 'support_assignment_history_identity_unique')) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropUnique('support_assignment_history_identity_unique');
            });
        }

        if (Schema::hasColumn($tableName, 'support_pending_slot')) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropColumn('support_pending_slot');
            });
        }

        if (Schema::hasColumn($tableName, 'support_history_slot')) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropColumn('support_history_slot');
            });
        }

        $this->restoreLegacyIdentityUnique($tableName, $roleColumn, $reviewerColumn);
    }

    private function assignmentTable(): ?string
    {
        // The current deployment still uses the legacy table. New installs use
        // the canonical table selected by ReviewAssignment.
        foreach (['research_review_assignments', 'research_assignments'] as $tableName) {
            if (Schema::hasTable($tableName)) {
                return $tableName;
            }
        }

        return null;
    }

    private function roleColumn(string $tableName): string
    {
        return $tableName === 'research_assignments' ? 'assignment_role' : 'review_role';
    }

    private function reviewerColumn(string $tableName): string
    {
        return $tableName === 'research_assignments' ? 'user_id' : 'reviewer_id';
    }

    /** @return array<int, string> */
    private function legacyIdentityColumns(string $tableName, string $roleColumn, string $reviewerColumn): array
    {
        $columns = ['research_document_id'];
        if (Schema::hasColumn($tableName, 'defense_type')) {
            $columns[] = 'defense_type';
        }
        $columns[] = $reviewerColumn;
        $columns[] = $roleColumn;

        return $columns;
    }

    private function assertNoDuplicatePendingSupportSlots(string $tableName, string $roleColumn): void
    {
        $pending = DB::table($tableName)
            ->select(['research_document_id', $roleColumn])
            ->whereIn($roleColumn, ['statistician', 'librarian', 'research_editor'])
            ->when(
                Schema::hasColumn($tableName, 'status'),
                fn ($query) => $query->whereIn('status', ['requested', 'pending']),
                fn ($query) => $query->where('is_active', false),
            )
            ->groupBy(['research_document_id', $roleColumn])
            ->havingRaw('COUNT(*) > 1')
            ->exists();

        if ($pending) {
            throw new RuntimeException("Cannot migrate {$tableName}: duplicate requested/pending support slots must be resolved before adding the pending-slot unique index.");
        }
    }

    private function backfillSupportSlots(string $tableName, string $roleColumn): void
    {
        DB::table($tableName)
            ->whereIn($roleColumn, ['statistician', 'librarian', 'research_editor'])
            ->orderBy('id')
            ->each(function (object $assignment) use ($tableName): void {
                DB::table($tableName)->where('id', $assignment->id)->update([
                    'support_history_slot' => 'support:'.$assignment->id,
                ]);
            });

        DB::table($tableName)
            ->whereIn($roleColumn, ['statistician', 'librarian', 'research_editor'])
            ->when(
                Schema::hasColumn($tableName, 'status'),
                fn ($query) => $query->whereIn('status', ['requested', 'pending']),
                fn ($query) => $query->where('is_active', false),
            )
            ->update(['support_pending_slot' => true]);
    }

    private function replaceLegacyIdentityUnique(string $tableName, string $roleColumn, string $reviewerColumn): void
    {
        $legacy = $this->legacyIdentityColumns($tableName, $roleColumn, $reviewerColumn);
        foreach (Schema::getIndexes($tableName) as $index) {
            if (($index['unique'] ?? false) && ($index['columns'] ?? []) === $legacy) {
                Schema::table($tableName, fn (Blueprint $table) => $table->dropUnique($index['name']));
            }
        }

        $name = 'support_assignment_history_identity_unique';
        if (! Schema::hasIndex($tableName, $name)) {
            Schema::table($tableName, function (Blueprint $table) use ($legacy, $name): void {
                $table->unique([...$legacy, 'support_history_slot'], $name);
            });
        }
    }

    private function assertRollbackCanRestoreLegacyIdentity(string $tableName, string $roleColumn, string $reviewerColumn): void
    {
        if (! Schema::hasColumn($tableName, 'support_history_slot')) {
            return;
        }
        $columns = $this->legacyIdentityColumns($tableName, $roleColumn, $reviewerColumn);
        $duplicates = DB::table($tableName)->select($columns)->groupBy($columns)->havingRaw('COUNT(*) > 1')->exists();
        if ($duplicates) {
            throw new RuntimeException("Cannot roll back {$tableName}: support assignment history would violate the legacy per-person unique constraint.");
        }
    }

    private function restoreLegacyIdentityUnique(string $tableName, string $roleColumn, string $reviewerColumn): void
    {
        $legacy = $this->legacyIdentityColumns($tableName, $roleColumn, $reviewerColumn);
        if (! collect(Schema::getIndexes($tableName))->contains(fn (array $index) => ($index['unique'] ?? false) && ($index['columns'] ?? []) === $legacy)) {
            Schema::table($tableName, function (Blueprint $table) use ($legacy): void {
                $table->unique($legacy, 'research_review_assignment_defense_unique');
            });
        }
    }
};
