# Shared Repository Management Implementation Plan

## Document Status
- **Artifact:** canonical planning document only; no product implementation is authorized by this file.
- **Evidence date:** 2026-09-13.
- **Repository / checkout:** `D:\ResearchNav\v1`, inside repository `D:\ResearchNav`.
- **Scope:** shared Repository Management for active Research Office and System Admin: live search/filter, existing workspace view/edit, management archive/restore icons, permanent-delete icon only for management-archived rows; mandatory reason plus exact `DELETE {submission_reference}` confirmation; durable scheduled deletion ledger deletes tracked local/Supabase objects first, then dependent Laravel DB graph transactionally, preserving immutable audits and retrying partial failures.

---

## Architecture Decisions (Pre-Approved)

| Decision | Detail |
|----------|--------|
| **Management archive signal** | `deleted_at` on `research_documents` serves as the management archive flag. A row with `deleted_at` set is "management-archived." |
| **Repository archive provenance** | New column `archive_provenance` (enum: `office_archived` | `management_archived` | `legacy_import`) records *why* a record reached the archive. `office_archived` = approved→archived via Research Office workflow. `management_archived` = soft-deleted by Research Office/Admin via Repository Management. `legacy_import` = imported records with `import_source_sha256`. |
| **Legacy soft-deleted rows** | Any pre-existing `deleted_at` rows without `archive_provenance = 'management_archived'` are **not safely restorable**. Restore UI must be hidden for them. |
| **Scheduled processor** | A dedicated console command `repository:process-deletion-ledger` runs on a scheduler (e.g., every 5 minutes). It picks up `queued` ledger rows, executes storage deletion, then DB purge in a transaction. |
| **Deletion ledger states** | `queued` → `deleting` → `storage_failed` / `purge_failed` / `completed`. No cancellation state. |
| **Storage absence** | If the storage object is already gone, treat as idempotent success; do not fail the ledger row. |
| **No cancellation** | Once a ledger row is `queued`, it proceeds to completion or terminal failure. No user-facing cancel. |
| **Immutable audits** | `audit_logs` and `activity_logs`/`monitoring_logs` are **never deleted** by the scheduled processor. They are preserved for compliance. |

---

## Data Model Changes

### 1. `research_documents` table additions (migration)
| Column | Type | Constraints | Default | Purpose |
|--------|------|-------------|---------|---------|
| `archive_provenance` | `enum('office_archived','management_archived','legacy_import')` | nullable | `NULL` | Provenance of archive state. |
| `management_archived_at` | `timestamp(6)` | nullable | `NULL` | Timestamp when management-archived (mirrors `deleted_at` for clarity). |
| `management_archived_by` | `unsignedBigInteger` | nullable, FK→`users.id` | `NULL` | Actor who triggered management archive. |
| `management_archive_reason` | `text` | nullable | `NULL` | Mandatory reason text at archive time. |

> `deleted_at` (from `SoftDeletes`) remains the authoritative "is management-archived" flag. `management_archived_at` is a convenience mirror; both are set/cleared together.

### 2. New table: `repository_deletion_ledger` (migration)
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | `bigIncrements` | PK | |
| `research_document_id` | `unsignedBigInteger` | FK→`research_documents.id`, restrictOnDelete | Target record. |
| `submission_reference` | `string(50)` | not null | Immutable copy for confirmation UI. |
| `status` | `enum('queued','deleting','storage_failed','purge_failed','completed')` | not null, default `'queued'` | Processor state machine. |
| `storage_paths` | `json` | not null | Array of storage paths (local + Supabase) to delete. |
| `storage_deletion_attempts` | `unsignedInteger` | default `0` | Retry counter for storage phase. |
| `purge_attempts` | `unsignedInteger` | default `0` | Retry counter for DB purge phase. |
| `last_error` | `text` | nullable | Last failure message for observability. |
| `queued_at` | `timestamp(6)` | not null | When the ledger row was created. |
| `started_at` | `timestamp(6)` | nullable | When processor picked it up. |
| `completed_at` | `timestamp(6)` | nullable | Terminal success timestamp. |
| `created_at` / `updated_at` | `timestamp(6)` | | Laravel timestamps. |

Indexes:
- `idx_repository_deletion_ledger_status_queued_at` on (`status`, `queued_at`) for processor polling.
- `idx_repository_deletion_ledger_research_document_id` on (`research_document_id`) unique (one ledger row per document).

### 3. Model updates
- `ResearchDocument`:
  - Add `archive_provenance`, `management_archived_at`, `management_archived_by`, `management_archive_reason` to `$fillable`.
  - Add casts for `management_archived_at` → `datetime`.
  - Scopes: `scopeManagementArchived` (where `deleted_at` not null AND `archive_provenance = 'management_archived'`), `scopeRestorableManagementArchived` (management-archived AND `archive_provenance = 'management_archived'`).
  - Booted: when `deleted` event fires via `SoftDeletes`, if `archive_provenance` is null, set to `'management_archived'` and populate `management_archived_at`/`by`/`reason` from a transient context (set by the controller before delete).
- New `RepositoryDeletionLedger` model with the above columns, `$casts` for `storage_paths` → `array`.

---

## Backend Workstreams (Owner: Backend Security & API Builder)

### Workstream B1 — Database Migrations & Models
**Files (exclusive ownership):**
- `v1/backend/database/migrations/2026_09_13_000001_add_archive_provenance_to_research_documents.php`
- `v1/backend/database/migrations/2026_09_13_000002_create_repository_deletion_ledger_table.php`
- `v1/backend/app/Models/ResearchDocument.php` (add columns, scopes, booted logic)
- `v1/backend/app/Models/RepositoryDeletionLedger.php` (new)

**Acceptance checks:**
- Fresh MariaDB migration runs; `research_documents` has new columns; `repository_deletion_ledger` created with indexes.
- `ResearchDocument::factory()->create()` works; `archive_provenance` nullable.
- `ResearchDocument::scopeManagementArchived()` returns only rows with `deleted_at` not null AND `archive_provenance = 'management_archived'`.
- `ResearchDocument::scopeRestorableManagementArchived()` returns only management-archived rows with provenance `management_archived`.

### Workstream B2 — Repository Management API (Research Office + Admin)
**New routes (under `office` and `admin` prefixes):**
| Method | Path | Controller | Middleware |
|--------|------|------------|------------|
| `GET` | `/api/office/repository` | `ResearchOfficeController@repositoryIndex` | `office.authority` |
| `GET` | `/api/office/repository/{researchDocument}` | `ResearchOfficeController@repositoryShow` | `office.authority` |
| `PATCH` | `/api/office/repository/{researchDocument}` | `ResearchOfficeController@repositoryUpdate` | `office.authority`, `throttle:domain-mutations` |
| `POST` | `/api/office/repository/{researchDocument}/management-archive` | `ResearchOfficeController@managementArchive` | `office.authority`, `throttle:domain-mutations` |
| `POST` | `/api/office/repository/{researchDocument}/management-restore` | `ResearchOfficeController@managementRestore` | `office.authority`, `throttle:domain-mutations` |
| `POST` | `/api/office/repository/{researchDocument}/permanent-delete` | `ResearchOfficeController@permanentDelete` | `office.authority`, `throttle:domain-mutations` |
| `GET` | `/api/admin/repository` | `AdminController@repositoryIndex` | `active.admin` |
| `GET` | `/api/admin/repository/{researchDocument}` | `AdminController@repositoryShow` | `active.admin` |
| `PATCH` | `/api/admin/repository/{researchDocument}` | `AdminController@repositoryUpdate` | `active.admin`, `throttle:domain-mutations` |
| `POST` | `/api/admin/repository/{researchDocument}/management-archive` | `AdminController@managementArchive` | `active.admin`, `throttle:domain-mutations` |
| `POST` | `/api/admin/repository/{researchDocument}/management-restore` | `AdminController@managementRestore` | `active.admin`, `throttle:domain-mutations` |
| `POST` | `/api/admin/repository/{researchDocument}/permanent-delete` | `AdminController@permanentDelete` | `active.admin`, `throttle:domain-mutations` |

**Controller logic (shared via trait or service):**
- `repositoryIndex`: paginated list with live search/filter (title, submission_reference, institute, submission_status, archive_status, visibility, date range). Includes `deleted_at` (management-archived) rows. Returns `archive_provenance` and `management_archived_at`.
- `repositoryShow`: full record with files, authors, reviewers, feedback, revisions, monitoring, validations, similarity — same shape as `AdminResearchWorkspace` but read-only for non-management-archived; for management-archived, includes `archive_provenance`, `management_archive_reason`, `management_archived_by`, `management_archived_at`.
- `repositoryUpdate`: allows metadata edit (title, abstract, keywords, etc.) for any row **except** `archive_status = 'archived'` with `archive_provenance = 'office_archived'` (those are immutable post-office-archive). For management-archived rows, allow edit to support correction before restore.
- `managementArchive`:
  - **Authorization:** Research Office or Admin only.
  - **Precondition:** row must NOT already be `deleted_at` (i.e., not already management-archived). Office-archived rows (`archive_provenance = 'office_archived'`) CAN be management-archived (adds a second archive layer).
  - **Input validation:** `reason` (required, string, max 5000), `confirmation` (required, string, must exactly equal `DELETE {submission_reference}`).
  - **Action:** set `deleted_at = now()`, `archive_provenance = 'management_archived'`, `management_archived_at = now()`, `management_archived_by = actor.id`, `management_archive_reason = reason`. Audit log `RESEARCH_MANAGEMENT_ARCHIVED`. Monitoring log.
- `managementRestore`:
  - **Authorization:** Research Office or Admin only.
  - **Precondition:** `deleted_at` not null AND `archive_provenance = 'management_archived'`. Legacy soft-deleted rows (provenance null or `legacy_import`) are **not restorable** — return 409 `NOT_RESTORABLE`.
  - **Action:** clear `deleted_at`, `archive_provenance = null`, `management_archived_at = null`, `management_archived_by = null`, `management_archive_reason = null`. Also clear `archive_status = 'not_archived'`, `submission_status` revert to `'approved'` (or previous if tracked), `visibility = 'private'`. Audit log `RESEARCH_MANAGEMENT_RESTORED`. Monitoring log.
- `permanentDelete`:
  - **Authorization:** Research Office or Admin only.
  - **Precondition:** `deleted_at` not null AND `archive_provenance = 'management_archived'`. Only management-archived rows eligible.
  - **Input validation:** `reason` (required, string, max 5000), `confirmation` (required, string, must exactly equal `DELETE {submission_reference}`).
  - **Action:** Create `RepositoryDeletionLedger` row with `status = 'queued'`, `storage_paths` = all `document_files.file_path` for this document + any Supabase study paths (from `instituteStudies` if applicable), `submission_reference` copied. Return 202 Accepted with ledger ID. Audit log `RESEARCH_PERMANENT_DELETE_QUEUED`.

**Files (exclusive ownership):**
- `v1/backend/app/Http/Controllers/ResearchOfficeController.php` (add 5 methods)
- `v1/backend/app/Http/Controllers/AdminController.php` (add 5 methods)
- `v1/backend/app/Services/RepositoryManagementService.php` (new — shared logic)
- `v1/backend/routes/web.php` (add routes)

**Acceptance checks:**
- `GET /api/office/repository` returns paginated data with search/filter; includes management-archived rows.
- `managementArchive` requires exact `DELETE {submission_reference}`; rejects mismatched confirmation with 422 `INVALID_CONFIRMATION`.
- `managementRestore` returns 409 `NOT_RESTORABLE` for legacy soft-deleted rows.
- `permanentDelete` returns 202 with ledger ID; ledger row created with correct `storage_paths`.
- All mutations emit audit logs with actor, reason, submission_reference.
- Policies: `ResearchDocumentPolicy@managementArchive`, `@managementRestore`, `@permanentDelete` enforce office/admin authority.

### Workstream B3 — Scheduled Deletion Processor
**Files (exclusive ownership):**
- `v1/backend/app/Console/Commands/ProcessRepositoryDeletionLedger.php` (new)
- `v1/backend/app/Services/RepositoryDeletionProcessor.php` (new)
- `v1/backend/app/Services/SupabaseStorageService.php` (reuse existing `delete` method)
- `v1/backend/config/console.php` (schedule registration)

**Processor logic (`RepositoryDeletionProcessor::process(RepositoryDeletionLedger $ledger)`):**
1. **Transition to `deleting`**: `$ledger->update(['status' => 'deleting', 'started_at' => now()])`.
2. **Storage deletion phase**:
   - For each path in `$ledger->storage_paths`:
     - If Supabase path: call `SupabaseStorageService::delete($path)`. Catch `SupabaseStorageException` → mark failure.
     - Else local disk: `Storage::disk('researchnav_private')->delete($path)`. If file not found → treat as success (idempotent).
   - If **any** storage deletion fails: increment `storage_deletion_attempts`, set `status = 'storage_failed'`, `last_error = ...`, save, return `false`.
   - If all succeed: proceed.
3. **DB purge phase (single transaction)**:
   - `DB::transaction(function () use ($ledger) {`
     - Lock `ResearchDocument` row: `ResearchDocument::whereKey($ledger->research_document_id)->lockForUpdate()->firstOrFail()`.
     - Delete dependent rows in FK order (children first):
       - `DocumentFile` (already soft-deleted via `deleted_at` on parent? No — `DocumentFile` has no `SoftDeletes`. Must force delete.)
       - `ResearchAuthor`, `Revision`, `FeedbackComment`, `MonitoringLog`, `TitleValidation`, `ReviewAssignment`, `ResearchProjectTeamMember`, `SimilarityResult` (both source/matched), `DefenseSchedule`, `Evaluation`, `MethodologyReview`, `ComplianceReview`, `MetadataReview`, `ManuscriptSearchDocument`, `PendingPrivateFileDeletion` (by `research_document_id`).
       - **Do NOT delete:** `audit_logs`, `activity_logs`/`monitoring_logs` (these are immutable; they reference the research document but must remain).
     - Finally: `$researchDocument->forceDelete()` (hard delete, bypassing `SoftDeletes`).
   - `}`)
   - If transaction throws: increment `purge_attempts`, set `status = 'purge_failed'`, `last_error = ...`, save, return `false`.
4. **Success**: `$ledger->update(['status' => 'completed', 'completed_at' => now()])`. Return `true`.

**Retry policy:**
- Scheduler runs `ProcessRepositoryDeletionLedger` every 5 minutes.
- Command picks up to 50 rows where `status IN ('queued', 'storage_failed', 'purge_failed')` ordered by `queued_at`.
- Max attempts: storage 10, purge 5 (configurable via `config('researchnav.repository_deletion.max_storage_attempts')` etc.). After max, status stays failed; alert via log/monitoring.

**Acceptance checks:**
- Processor picks `queued` row, deletes storage objects (local + Supabase), then purges DB graph in one transaction.
- Storage absence → idempotent success (no failure).
- Audit logs and activity/monitoring logs **preserved** after purge.
- Partial storage failure → `storage_failed`, retried on next run.
- Partial purge failure → `purge_failed`, retried on next run.
- Completed row → `status = 'completed'`, `completed_at` set.
- No cancellation path exists.

### Workstream B4 — Policy & Authorization
**Files (exclusive ownership):**
- `v1/backend/app/Policies/ResearchDocumentPolicy.php` (add `managementArchive`, `managementRestore`, `permanentDelete` methods)
- `v1/backend/bootstrap/providers.php` (ensure policy registered)

**Policy rules:**
- `managementArchive`: `DomainAuthorization::isOffice($actor) || DomainAuthorization::isActiveAdministrator($actor)`.
- `managementRestore`: same + `archive_provenance === 'management_archived'`.
- `permanentDelete`: same + `archive_provenance === 'management_archived'`.

---

## Frontend Workstreams (Owner: Frontend Builder)

### Workstream F1 — API Layer Extensions
**Files (exclusive ownership):**
- `v1/frontend/src/api.ts` (add types and functions)

**New types:**
```typescript
export interface RepositoryManagementItem {
  id: number;
  submission_reference: string;
  title: string;
  institute: string | null;
  submission_status: InternalResearchResource["submission_status"];
  archive_status: InternalResearchResource["archive_status"];
  visibility: InternalResearchResource["visibility"];
  archive_provenance: "office_archived" | "management_archived" | "legacy_import" | null;
  management_archived_at: string | null;
  management_archived_by: string | null;
  management_archive_reason: string | null;
  deleted_at: string | null;
  submitted_at: string | null;
  archived_at: string | null;
  authors: ResearchAuthorResource[];
}

export interface RepositoryManagementFilters {
  q?: string;
  submission_reference?: string;
  institute?: string;
  submission_status?: string;
  archive_status?: string;
  visibility?: string;
  provenance?: "office_archived" | "management_archived" | "legacy_import";
  date_from?: string;
  date_to?: string;
  per_page?: number;
  page?: number;
}

export interface RepositoryDeletionLedgerResource {
  id: number;
  research_document_id: number;
  submission_reference: string;
  status: "queued" | "deleting" | "storage_failed" | "purge_failed" | "completed";
  storage_paths: string[];
  storage_deletion_attempts: number;
  purge_attempts: number;
  last_error: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}
```

**New API functions:**
- `listRepositoryManagement(filters, fetcher?)` → `LaravelPaginatedResponse<RepositoryManagementItem>`
- `getRepositoryManagement(id, fetcher?)` → `RepositoryManagementItem` (with full relations)
- `updateRepositoryManagement(id, metadata, fetcher?)` → `RepositoryManagementItem`
- `managementArchiveRepository(id, { reason, confirmation }, fetcher?)` → `RepositoryManagementItem`
- `managementRestoreRepository(id, fetcher?)` → `RepositoryManagementItem`
- `permanentDeleteRepository(id, { reason, confirmation }, fetcher?)` → `{ ledger_id: number }`
- `listDeletionLedger(filters?, fetcher?)` → `LaravelPaginatedResponse<RepositoryDeletionLedgerResource>`

### Workstream F2 — Repository Management Workspace (Shared Component)
**Files (exclusive ownership):**
- `v1/frontend/src/RepositoryManagementWorkspace.tsx` (new — shared by Research Office and Admin)
- `v1/frontend/src/RepositoryManagementWorkspace.test.tsx` (new)

**Component structure:**
```
RepositoryManagementWorkspace
├── RepositoryManagementHeader
│   ├── Live search/filter bar (debounced, uses useLiveFilters)
│   ├── Provenance filter (All / Office-archived / Management-archived / Legacy-import)
│   └── Refresh button
├── RepositoryManagementTable
│   ├── Columns: Title, Submission Ref, Institute, Submission Status, Archive Status, Visibility, Provenance, Management-archived At, Actions
│   ├── Row actions (per row, conditional):
│   │   ├── View/Edit (always) → opens RepositoryManagementDetailModal
│   │   ├── Archive icon (box) → only if !deleted_at
│   │   ├── Restore icon (rotate-ccw) → only if deleted_at && provenance === 'management_archived'
│   │   ├── Permanent-delete icon (trash-2) → only if deleted_at && provenance === 'management_archived'
│   └── Pagination
├── RepositoryManagementDetailModal
│   ├── Tabs: Overview, Files, Authors, Reviewers, Feedback, Revisions, Monitoring, Validations, Similarity
│   ├── Edit mode (for metadata) — enabled for all rows except office-archived (provenance='office_archived' && archive_status='archived')
│   ├── Archive confirmation dialog:
│   │   ├── Mandatory reason textarea (max 5000)
│   │   ├── Confirmation input: must type exactly `DELETE {submission_reference}`
│   │   ├── Live validation: green check / red X
│   │   └── Submit → calls managementArchive
│   ├── Restore confirmation dialog: "Restore this management-archived record?" + reason display
│   └── Permanent-delete confirmation dialog:
│       ├── Mandatory reason textarea
│       ├── Confirmation input: must type exactly `DELETE {submission_reference}`
│       ├── Warning: "This queues permanent deletion. Storage objects and database rows will be irreversibly removed. Audit logs are preserved."
│       └── Submit → calls permanentDelete → shows ledger ID + "Queued for permanent deletion"
├── DeletionLedgerPanel (collapsible)
│   ├── Shows queued/deleting/failed/completed ledger rows for this workspace
│   ├── Auto-refresh every 30s
│   └── Status badges with retry counts
```

**Integration points:**
- Research Office sidebar: add "Repository Management" nav item → renders `<RepositoryManagementWorkspace context="office" />`
- Admin sidebar: add "Repository Management" nav item → renders `<RepositoryManagementWorkspace context="admin" />`
- Both share the exact same component; only API base path differs (`/api/office/repository` vs `/api/admin/repository`).

**Acceptance checks:**
- Live search/filter debounces 300ms; updates table without full reload.
- Archive icon only on non-deleted rows; Restore + Permanent-delete only on management-archived rows (provenance='management_archived').
- Legacy-import rows (provenance='legacy_import') show no Restore/Permanent-delete.
- Archive dialog requires reason + exact `DELETE {submission_reference}`; Submit disabled until both valid.
- Permanent-delete dialog shows ledger ID on success; DeletionLedgerPanel shows row with status.
- Edit mode works for management-archived rows (correction before restore).
- Office-archived rows (provenance='office_archived') are read-only in detail modal.

### Workstream F3 — Sidebar Integration
**Files (exclusive ownership):**
- `v1/frontend/src/RoleSidebarPages.tsx` (add nav items for Research Office and Admin)
- `v1/frontend/src/AdminSidebarPages.tsx` (add nav item for Admin)

**Acceptance checks:**
- Research Office sees "Repository Management" in sidebar; navigates to workspace.
- Admin sees "Repository Management" in sidebar; navigates to workspace.
- Both use shared `RepositoryManagementWorkspace` component.

---

## Test Gates

### Backend Test Gates (run from `backend/`)
| Gate | Command | Must Pass |
|------|---------|-----------|
| Migration fresh + seed | `php artisan migrate:fresh --seed` | ✅ |
| Migration up/down (fresh DB) | `php artisan migrate` → `php artisan migrate:rollback --step=2` | ✅ |
| Unit: RepositoryManagementService | `php artisan test --filter=RepositoryManagementServiceTest` | ✅ |
| Unit: RepositoryDeletionProcessor | `php artisan test --filter=RepositoryDeletionProcessorTest` | ✅ |
| Feature: Office repository API | `php artisan test --filter=ResearchOfficeRepositoryTest` | ✅ |
| Feature: Admin repository API | `php artisan test --filter=AdminRepositoryTest` | ✅ |
| Feature: Deletion ledger processor | `php artisan test --filter=ProcessRepositoryDeletionLedgerTest` | ✅ |
| Policy tests | `php artisan test --filter=ResearchDocumentPolicyTest` | ✅ |
| Full suite | `composer test` | 271+ passed, 0 failed |

**Key test scenarios:**
- `managementArchive` with wrong confirmation → 422 `INVALID_CONFIRMATION`.
- `managementArchive` with valid confirmation → 200, row soft-deleted, provenance set, audit logged.
- `managementRestore` on management-archived → 200, row restored, provenance cleared.
- `managementRestore` on legacy-import → 409 `NOT_RESTORABLE`.
- `permanentDelete` on management-archived → 202, ledger created.
- `permanentDelete` on non-management-archived → 409 `NOT_ELIGIBLE`.
- Processor: storage success → DB purge success → ledger `completed`.
- Processor: storage failure → ledger `storage_failed`, retries.
- Processor: purge failure → ledger `purge_failed`, retries.
- Processor: storage object missing → idempotent success.
- Audit logs preserved after purge.
- Activity/monitoring logs preserved after purge.

### Frontend Test Gates (run from `frontend/`)
| Gate | Command | Must Pass |
|------|---------|-----------|
| TypeScript | `npm run typecheck` | ✅ |
| Lint | `npm run lint` | ✅ |
| Format | `npm run format:check` | ✅ |
| Unit/Component tests | `npm run test -- --run src/RepositoryManagementWorkspace.test.tsx` | ✅ |
| Build | `npm run build` | ✅ |
| Focused API/contract tests | `npm run test -- --run src/api.test.ts` | ✅ |

**Key test scenarios:**
- Filter bar updates URL/query and reloads table.
- Archive icon visibility logic.
- Restore/Permanent-delete icon visibility logic (provenance gating).
- Archive confirmation: reason required, confirmation must match exactly.
- Permanent-delete confirmation: reason required, confirmation must match exactly.
- Detail modal tabs load correct data.
- Edit mode enabled/disabled per provenance rules.
- DeletionLedgerPanel shows ledger rows with status badges.

---

## Migration & Rollout Controls

### Migration Sequence
1. **Deploy migrations only** (no code):
   - Run `2026_09_13_000001_add_archive_provenance_to_research_documents.php`
   - Run `2026_09_13_000002_create_repository_deletion_ledger_table.php`
   - Verify on staging: columns exist, indexes created, no data loss.
   - **Backfill:** For existing `deleted_at` rows:
     - If `import_source_sha256` not null → `archive_provenance = 'legacy_import'`.
     - Else if `archive_status = 'archived'` → `archive_provenance = 'office_archived'`.
     - Else → `archive_provenance = 'management_archived'` (assume prior management action).
     - Set `management_archived_at = deleted_at` where provenance = 'management_archived'.
   - Record backup SHA-256 before and after.

2. **Deploy backend code** (controllers, service, processor, policies):
   - Enable scheduler for `repository:process-deletion-ledger` (every 5 min).
   - Verify processor picks up zero rows initially.

3. **Deploy frontend code** (workspace component, sidebar integration):
   - Feature flag or branch deploy to staging.
   - Smoke test: Office + Admin can see repository, archive/restore/permanent-delete flow works.

### Rollback Plan
- **Migrations:** Down migrations drop columns/table. **Data loss:** `archive_provenance`, `management_archived_*`, and ledger rows are lost. Restore from pre-migration backup if needed.
- **Code:** Revert backend/frontend commits. Scheduler disabled by removing schedule entry.

### Feature Flag (Optional)
- `REPOSITORY_MANAGEMENT_ENABLED` in `.env` → gates frontend nav items and backend routes (return 404 if disabled). Allows dark deploy.

---

## Acceptance Criteria Summary (Definition of Done)

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Research Office sees Repository Management in sidebar | Manual + Cypress |
| 2 | Admin sees Repository Management in sidebar | Manual + Cypress |
| 3 | Live search/filter works (title, ref, institute, status, provenance, date) | Automated test |
| 4 | Table shows all rows including management-archived (deleted_at) | Automated test |
| 5 | Archive icon only on non-deleted rows | Automated test |
| 6 | Restore icon only on management-archived (provenance='management_archived') | Automated test |
| 7 | Permanent-delete icon only on management-archived | Automated test |
| 8 | Legacy-import rows show no Restore/Permanent-delete | Automated test |
| 9 | Archive dialog: mandatory reason + exact `DELETE {submission_reference}` | Automated test |
| 10 | Restore dialog: confirms, restores row, clears provenance | Automated test |
| 11 | Permanent-delete dialog: mandatory reason + exact confirmation → 202 + ledger ID | Automated test |
| 12 | Ledger row created with all storage_paths | Automated test |
| 13 | Processor deletes storage (local + Supabase) idempotently | Automated test |
| 14 | Processor purges DB graph in transaction (children first) | Automated test |
| 15 | Audit logs & activity/monitoring logs preserved after purge | Automated test |
| 16 | Storage failure → `storage_failed`, retries | Automated test |
| 17 | Purge failure → `purge_failed`, retries | Automated test |
| 18 | No cancellation path exists | Code review |
| 19 | All mutations emit audit logs with reason, actor, submission_reference | Automated test |
| 20 | Policies enforce Office/Admin only | Automated test |
| 21 | Office-archived rows read-only in detail modal | Automated test |
| 22 | Management-archived rows editable in detail modal (pre-restore) | Automated test |
| 23 | DeletionLedgerPanel shows real-time status | Manual + automated |
| 24 | Full backend suite passes (271+ tests) | CI gate |
| 25 | Full frontend suite passes | CI gate |

---

## File Ownership Summary (No Overlaps)

| Workstream | Owner | Exclusive Paths |
|------------|-------|-----------------|
| B1 Migrations/Models | Backend Security & API Builder | `v1/backend/database/migrations/2026_09_13_000001_*`, `2026_09_13_000002_*`, `v1/backend/app/Models/ResearchDocument.php`, `v1/backend/app/Models/RepositoryDeletionLedger.php` |
| B2 Repository API | Backend Security & API Builder | `v1/backend/app/Http/Controllers/ResearchOfficeController.php`, `v1/backend/app/Http/Controllers/AdminController.php`, `v1/backend/app/Services/RepositoryManagementService.php`, `v1/backend/app/Policies/ResearchDocumentPolicy.php`, `v1/backend/routes/web.php` |
| B3 Deletion Processor | Backend Security & API Builder | `v1/backend/app/Console/Commands/ProcessRepositoryDeletionLedger.php`, `v1/backend/app/Services/RepositoryDeletionProcessor.php`, `v1/backend/config/console.php` |
| F1 API Types/Functions | Frontend Builder | `v1/frontend/src/api.ts` (new types + functions only) |
| F2 Workspace Component | Frontend Builder | `v1/frontend/src/RepositoryManagementWorkspace.tsx`, `v1/frontend/src/RepositoryManagementWorkspace.test.tsx` |
| F3 Sidebar Integration | Frontend Builder | `v1/frontend/src/RoleSidebarPages.tsx`, `v1/frontend/src/AdminSidebarPages.tsx` |

> **No workstream may edit files outside its exclusive paths.** If a shared file is needed (e.g., `api.ts` for types), the Frontend Builder owns the *addition* of types/functions; the Backend Builder owns the *contract shape* and must coordinate via Plan Coordinator.

---

## Dependencies & Ordering

```
B1 (Migrations/Models)
  → B2 (Repository API) ← B4 (Policies, can parallel after B1)
  → B3 (Deletion Processor) ← B1
F1 (API Types) ← B2 (contract freeze)
  → F2 (Workspace Component)
    → F3 (Sidebar Integration)
```

**Hard gates:**
- B1 must complete and migrate on staging before B2/B3/F1 start.
- B2 contract (response shapes, error codes) must be frozen before F1 implements types.
- F1 must complete before F2 begins (component uses API functions).
- F2 must complete before F3 (sidebar mounts workspace).

---

## Handoff

This plan is the **sole authoritative artifact** for Shared Repository Management. Implementation must not begin until:

1. Plan Coordinator approves this document.
2. Git/Repository Steward provides a clean baseline SHA (per T00 in roadmap).
3. Database Builder confirms migration safety on MariaDB (per T01).
4. Backend Security & API Builder and Frontend Builder acknowledge exclusive file ownership.

**Next action:** Plan Coordinator creates implementation branch `feat/repository-management` from approved clean baseline, then assigns workstreams to owners via GitHub issues referencing this plan.