# Manage Repository Implementation Plan

## Status and objective

- **Artifact:** canonical implementation plan only. No product code, Git state, worktree, commit, push, or pull request is created by this document.
- **Repository:** `D:\ResearchNav`; application root: `D:\ResearchNav\v1`.
- **Frozen base:** branch `deploy/full-update-2026-09-23` at `2cfdf31b1ac4ff5ba5a58b2169c70edb9789bd62` (short SHA `2cfdf31`). The user reports that the shared checkout is dirty only because of unrelated untracked artifacts; execution must verify that statement without cleaning or moving them.
- **Objective:** deliver one shared **Manage Repository** module for active System Administrators and Research Office personnel, backed only by dedicated `/api/office/repository` endpoints protected by `office.authority`.
- **Canonical precedence:** this file supersedes `docs/plans/repository-management-implementation-plan.md` for this feature. In particular, do **not** implement that older plan's migrations, provenance columns, deletion ledger, admin-prefixed repository API, permanent deletion, or similarity UI.

## Frozen scope and decisions

1. Add no migration, table, column, index, seed, or schema change. Existing `research_documents.deleted_at` is the recycle-bin signal.
2. Both active Admin and active Research Office accounts use the same React module and the same office API. Do not add `/api/admin/repository` duplicates.
3. Expose these endpoints inside the existing `office` group (`current.user`, `account.active`, `office.authority`):

   | Method   | Endpoint                                            | Purpose                     | Additional middleware                         |
   | -------- | --------------------------------------------------- | --------------------------- | --------------------------------------------- |
   | `GET`    | `/api/office/repository`                            | Paginated bucket list       | none                                          |
   | `GET`    | `/api/office/repository/{researchDocument}`         | Dedicated safe detail       | none                                          |
   | `PATCH`  | `/api/office/repository/{researchDocument}`         | Edit active-record metadata | `origin.allowed`, `throttle:domain-mutations` |
   | `DELETE` | `/api/office/repository/{researchDocument}`         | Soft-delete to recycle bin  | `origin.allowed`, `throttle:domain-mutations` |
   | `POST`   | `/api/office/repository/{researchDocument}/restore` | Restore a trashed record    | `origin.allowed`, `throttle:domain-mutations` |

4. `GET /api/office/repository` accepts `bucket=ongoing|archived|recycle`, defaulting to `ongoing`:
   - `ongoing`: the normal, non-trashed query with `archive_status != archived`.
   - `archived`: the normal, non-trashed query with `archive_status = archived`.
   - `recycle`: `ResearchDocument::onlyTrashed()` with no archive-status rewrite.
     The three definitions must not overlap. The endpoint may also accept `search`, `institute`, `publication_year`, `sort=title|publication_year|updated_at`, `direction=asc|desc`, `page`, and `per_page` (1–100). Search covers title, submission reference, and author name with escaped LIKE input. Default ordering is `updated_at DESC, id DESC`; recycle defaults to `deleted_at DESC, id DESC`.
5. List items expose only display metadata and action capabilities: id, submission reference, title, publication year, institute, research/submission/archive status, visibility, author names, updated/deleted timestamps, and `can_edit`, `can_delete`, `can_restore`.
6. A new dedicated detail resource is mandatory. It may expose the document metadata, category, SDGs, authors, lifecycle statuses/timestamps, and safe file metadata (`id`, type/purpose, version/order, original filename, extension, MIME type, size, current flag, uploaded time). It must never expose `file_path`, `stored_filename`, `relative_path`, content hashes, absolute paths, projection text/metadata, similarity results, or similarity scores.
7. Metadata editing applies only to non-trashed records in either live bucket. The allowlist is `category_id`, `title`, `abstract`, `keywords`, `publication_year`, `sdg_ids`, `institute`, `degree_program`, `manuscript_date_label`, and `research_stage`. Unknown fields, authors, files, visibility, submission/archive statuses, lifecycle timestamps, import provenance, and `deleted_at` are rejected. Preserve title normalization, institute/program validation, SDG synchronization, and imported-abstract provenance behavior.
8. Delete is soft delete only. In one locked transaction, append audit/monitoring evidence and set only `deleted_at` on the document. Suppress Eloquent's automatic timestamp touch for this operation so `updated_at` and every lifecycle timestamp remain unchanged. Do not delete or rewrite files, authors, SDGs, assignments, annotations, feedback, revisions, reviews, schedules, team membership, storage objects, or lifecycle fields. Never call `ResearchService::deleteImported`, `DocumentService::delete`, `forceDelete`, storage deletion, or a deletion ledger.
9. The existing `ResearchDocument` deleted hook may purge the **derived** `manuscript_search_documents` projection. That existing derivative behavior is the sole permitted exception to source-child preservation and must not be changed in this feature. No similarity service, model, resource, endpoint, test, or UI is otherwise modified.
10. Restore locks an `onlyTrashed()` row, clears only `deleted_at` through Eloquent `restore()` with automatic timestamp touching suppressed, leaves `updated_at` plus all lifecycle and child data unchanged, and appends audit/monitoring evidence. After the restore transaction commits, an eligible public archived record gets a best-effort call to the existing `ManuscriptSearchProjectionService::reindex(id, true, true)`. Index failure is warning-logged without paths or content and must not roll back or report the successful restore as failed.
11. There is no permanent-delete API, service method, background purge, or UI control. A second delete/restore in the wrong state returns a stable conflict response rather than changing data.
12. `ResearchOfficeBulkImport` is reused unchanged inside Manage Repository as an **Import manuscripts** tab/panel. Remove the separate **Upload Manuscript** navigation item for Admin and Research Office. The Research Office dashboard bulk-import card should route to **Manage Repository**; it must not mount a second import implementation.

## API response and error contract

- Successful list: Laravel pagination envelope with `data`, `links`, `meta`, and `schema_version: 1`.
- Successful detail/update/restore: `{ "data": <OfficeRepositoryDetailResource>, "schema_version": 1 }`, `Cache-Control: private, no-store`.
- Successful delete: `204 No Content`.
- Missing id: `404 NOT_FOUND`; trashed update/delete: `409 REPOSITORY_RECORD_TRASHED`; restore of a live row: `409 REPOSITORY_RECORD_NOT_TRASHED`; validation failures: existing `422` error envelope; auth failures retain existing `401/403` middleware envelopes.
- Mutation audit actions: `OFFICE_REPOSITORY_UPDATED`, `OFFICE_REPOSITORY_DELETED`, and `OFFICE_REPOSITORY_RESTORED`. Descriptions contain the submission reference but never request payloads, manuscript content, or storage paths.

## Acceptance criteria

| ID    | Observable criterion                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | Active Admin and Research Office accounts see **Manage Repository** and render the same component; inactive accounts and every other role are denied by the API.                                                                               |
| AC-02 | The only new repository-management routes are the five `/api/office/repository` routes above, all under `office.authority`; every mutation retains origin and mutation-throttle middleware.                                                    |
| AC-03 | Ongoing, Archived, and Recycle Bin return exactly the frozen bucket populations, including archived soft-deleted records only in Recycle Bin.                                                                                                  |
| AC-04 | List search/filter/sort/pagination are validated, deterministic, escaped, and capped at 100 rows per page.                                                                                                                                     |
| AC-05 | Detail responses and the UI expose no storage locator/hash and no similarity/projection data.                                                                                                                                                  |
| AC-06 | A live record's allowlisted metadata can be edited; normalized title, SDGs, program validation, imported abstract provenance, audit, and monitoring behavior are correct; lifecycle fields cannot be injected.                                 |
| AC-07 | Delete moves a live record to Recycle Bin while preserving every pre-existing child row, file row/object, import field, and lifecycle field byte-for-byte; no permanent deletion path exists.                                                  |
| AC-08 | Restore clears only `deleted_at`, returns the record to Ongoing or Archived according to its unchanged `archive_status`, preserves children/files/lifecycle, and succeeds even when best-effort reindex throws.                                |
| AC-09 | The shared module provides loading, empty, error/retry, pagination, stale-request protection, safe detail, edit, delete-confirmation, restore-confirmation, and authoritative-refetch states without a permanent-delete or similarity control. |
| AC-10 | Existing `ResearchOfficeBulkImport` appears inside the shared module for both roles and its existing tests continue to pass; no duplicate importer is created.                                                                                 |
| AC-11 | **Upload Manuscript** is absent from Admin and Research Office desktop/mobile navigation, and the office dashboard import card opens **Manage Repository**.                                                                                    |
| AC-12 | No migration/schema file, similarity implementation/UI, public repository behavior, storage object, or unrelated untracked artifact is changed.                                                                                                |

## Dependency graph

```text
P0 plan approval
  -> G0 baseline and isolated-worktree gate
       -> B1 office repository API --------------------+
       -> F1 shared client contract and module --------+ (B1 and F1 may run in parallel from the frozen contract)
                    -> F2 navigation/shell integration +
                                                      -> R1 code + security review
                                                      -> V1 integrated verification
                                                      -> C1 parent Plan PR completion gate
```

- B1 and F1 can proceed in parallel because this document freezes their request/response contract and their files do not overlap.
- F2 starts only after F1 is merged into the plan branch so its worktree can import the real shared module.
- R1 and V1 start only after B1 and F2 are merged into the plan branch. Findings return to the owner of the affected path; integration verification does not acquire product-file ownership.

## Branches, worktrees, and ownership

All future worktrees live outside the dirty repository root. Each is created from the then-current `plan/manage-repository` branch, never from the shared checkout index.

| Task | Single owner                 | Branch                                                                     | Isolated worktree                                        | Exclusive file ownership                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---- | ---------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0   | Planning Agent               | current checkout only                                                      | `D:\ResearchNav\v1`                                      | `v1/docs/plans/manage-repository.md` only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G0   | GitHub Repository Agent      | `plan/manage-repository`                                                   | `D:\ResearchNav-worktrees\manage-repository-plan`        | No product files; copy this plan artifact only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B1   | Backend Builder              | `feat/manage-repository-api`                                               | `D:\ResearchNav-worktrees\manage-repository-api`         | `v1/backend/routes/web.php`; `v1/backend/app/Http/Controllers/OfficeRepositoryController.php` (new); `v1/backend/app/Http/Requests/OfficeRepositoryIndexRequest.php` (new); `v1/backend/app/Http/Requests/OfficeRepositoryUpdateRequest.php` (new); `v1/backend/app/Http/Resources/OfficeRepositoryItemResource.php` (new); `v1/backend/app/Http/Resources/OfficeRepositoryDetailResource.php` (new); `v1/backend/app/Services/OfficeRepositoryService.php` (new); `v1/backend/tests/Feature/OfficeRepositoryManagementTest.php` (new) |
| F1   | Frontend Builder             | `feat/manage-repository-ui`                                                | `D:\ResearchNav-worktrees\manage-repository-ui`          | `v1/frontend/src/api.ts`; `v1/frontend/src/api.test.ts`; `v1/frontend/src/ManageRepository.tsx` (new); `v1/frontend/src/ManageRepository.test.tsx` (new); `v1/frontend/src/ManageRepository.css` (new)                                                                                                                                                                                                                                                                                                                                 |
| F2   | Frontend Integration Builder | `feat/manage-repository-shell`                                             | `D:\ResearchNav-worktrees\manage-repository-shell`       | `v1/frontend/src/data.ts`; `v1/frontend/src/Dashboard.tsx`; `v1/frontend/src/AdminSidebarPages.tsx`; `v1/frontend/src/AdminSidebarPages.test.tsx`; `v1/frontend/src/RoleSidebarPages.tsx`; `v1/frontend/src/RoleSidebarPages.test.tsx`; `v1/frontend/src/RoleWorkspaces.tsx`; `v1/frontend/src/app.test.tsx`                                                                                                                                                                                                                           |
| R1   | Security Reviewer            | read-only on updated plan branch                                           | no editing worktree                                      | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| V1   | Integration Tester           | `integration/manage-repository` only if a reproducibility branch is needed | `D:\ResearchNav-worktrees\manage-repository-integration` | None; fixes return to B1, F1, or F2 ownership                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C1   | PR Coordinator               | parent Plan PR metadata                                                    | no product worktree                                      | No repository files; PR body/checklist only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

No two mutating tasks own the same path. `ResearchOfficeBulkImport.tsx` and its test are deliberately unowned and unchanged. If implementation needs any unlisted file, stop, revise this plan and ownership table, and re-approve before editing.

## Ordered tasks, entry gates, and exit gates

### P0 — Approve the canonical plan

- **Entry:** frozen architecture in the request.
- Confirm that this plan contains no migration, permanent delete, admin-prefixed duplicate API, or similarity implementation.
- **Exit:** plan approved as the sole source of truth; no implementation begins before approval.

### G0 — Protect the baseline and prepare isolation

- Read-only verify `HEAD` equals the full frozen SHA and inventory `git status --short`, staged/unstaged diffs, untracked paths, worktrees, and remotes. Stop if any tracked change exists or an untracked path collides with an owned path.
- Do not reset, clean, stash, checkout, move, or stage the user's unrelated artifacts.
- Create `plan/manage-repository` from the exact frozen SHA in the external plan worktree, copy only this plan file, run plan verification, and let the Git Steward explicitly stage only `v1/docs/plans/manage-repository.md` after PASS.
- Open the Draft parent PR from `plan/manage-repository` into `deploy/full-update-2026-09-23`. Create B1/F1 worktrees from the resulting plan commit. Create F2 only after F1 merges.
- **Exit:** clean isolated worktrees point at recorded SHAs, parent Plan PR exists, owners acknowledge their exclusive paths, and the shared checkout is untouched except for this user-requested plan file.

### B1 — Implement and test the office repository API

- Add only the five frozen routes and retain the complete office middleware chain.
- Resolve route ids explicitly with `withTrashed()`/`onlyTrashed()` as appropriate; do not rely on implicit binding that hides trashed records. Re-check `DomainAuthorization::isOffice()` after locking the actor/document as defense in depth.
- Implement validated bucket/search/filter/sort/pagination queries with eager loading that avoids N+1 queries.
- Build dedicated list/detail resources. Manually map safe file fields; do not compose `DocumentFileResource` because it currently includes `relative_path`.
- Implement allowlisted live-record metadata updates transactionally, including normalized title, SDG sync, imported-abstract provenance, audit, and monitoring.
- Implement soft delete and restore with row locks, state conflicts, and automatic timestamp touching disabled only around those two model operations so `updated_at` is preserved. Preserve all source children/files/lifecycle; allow only the existing model hook's derivative projection purge. Attempt eligible reindex only after commit and catch/log all failures safely.
- Tests must cover Admin/Office success; guest, inactive, coordinator, and all foreign-role denial; middleware presence; all bucket boundaries; escaped search; pagination cap; detail redaction; unknown-field rejection; update behavior; concurrent/wrong-state conflicts; full child/file/lifecycle preservation; audit/monitoring; failed reindex success; and absence of any permanent-delete route.
- **Exit:** focused backend tests and changed-file Pint pass; route inspection matches exactly; diff contains no migration/schema, storage deletion, `forceDelete`, or similarity-file change; independent Pre-Commit Tester returns PASS before explicit staging.

### F1 — Implement the shared API client and Manage Repository module

- Add typed list/detail/update/delete/restore helpers that always target `/api/office/repository`; do not branch the API path by role.
- Build one `ManageRepository` component used by both shells. Provide Ongoing, Archived, Recycle Bin, and Import manuscripts views; reuse `<ResearchOfficeBulkImport contextLabel={...} />` unchanged for import.
- In live buckets, expose safe detail and allowlisted metadata edit plus a clearly worded **Move to Recycle Bin** confirmation. In recycle, expose read-only safe detail plus restore confirmation. Never display or derive storage paths, download paths, projection state, similarity, or permanent deletion.
- Use authoritative reload after mutations, request cancellation/generation guards, disabled single-submit controls, accessible status/alert regions, labeled tabs/table/actions/dialogs, focus restoration, keyboard operation, and responsive table/card behavior without page-level overflow at 320px.
- Tests cover endpoint methods/bodies/unwrapping, both role labels against the same component, all bucket transitions/states, metadata validation/errors, confirmation cancel-with-zero-request, stale responses, failed mutations, failed reload, redaction, no forbidden controls, and embedded bulk import rendering.
- **Exit:** focused API/component tests, format check on owned files, lint, and typecheck pass; existing bulk-import test passes unchanged; independent Pre-Commit Tester returns PASS before explicit staging.

### F2 — Integrate navigation and remove the standalone upload entry

- Replace Admin and Research Office `Upload Manuscript` nav entries with `Manage Repository` in `roleConfigs`; add the shared module cases in `AdminSidebarPage` and the Research Office branch of `RoleSidebarPage`.
- Give `Manage Repository` an existing suitable repository/archive icon in desktop and mobile navigation, and remove now-unused `FileUp` imports if applicable.
- Remove direct standalone bulk-import cases/imports from the two sidebar page files. In `RoleWorkspaces`, route the Research Office `bulk_import` dashboard section to `Manage Repository` and remove the obsolete direct importer special case/import; keep the dashboard card copy if desired.
- Update navigation tests to prove both roles see Manage Repository, neither role sees Upload Manuscript, desktop/mobile activation mounts the shared module, and the dashboard card destination is correct. Do not add a second module or role-specific fork.
- **Entry:** F1 merged into `plan/manage-repository`; new worktree created from that updated plan SHA.
- **Exit:** focused shell/navigation tests, format check on owned files, lint, typecheck, and build pass; independent Pre-Commit Tester returns PASS before explicit staging.

### R1 — Code and security review

- Review exact child PR commits for authorization bypass, IDOR, mass assignment, route shadowing, unescaped LIKE, excessive pagination, data leakage, file/storage side effects, force/permanent deletion, restore races, audit payload leakage, and accidental similarity/schema changes.
- Confirm frontend hiding is not treated as authorization and both roles really use the same endpoint/component.
- **Exit:** no unresolved blocking finding; repairs travel through the affected owner's worktree, focused checks, Pre-Commit Tester, and Git Steward loop.

### V1 — Integrated acceptance and regression verification

- Test the combined plan branch with disposable test data. Snapshot document fields and all child/file row ids and relevant values before delete; after delete and restore, prove only `deleted_at`, appended audit/monitor rows, and the existing derived projection behavior differ.
- Manually exercise active Admin and Research Office sessions plus denied roles. Check 320px, 768px, desktop, 200% zoom, keyboard/focus flow, loading/empty/error/retry, delete/restore confirmations, and Import manuscripts.
- Run every command below and record command, exit code, relevant output, skips, and environment limitations in the parent PR.
- **Exit:** AC-01 through AC-12 have linked evidence; full suites/build pass relative to the recorded baseline; diff audit shows no unowned, migration/schema, similarity, storage, or unrelated-artifact change.

### C1 — Complete the parent Plan PR

- Link all child PRs, exact merge SHAs, review outcomes, acceptance evidence, and command results. Check workstream and acceptance lists only from evidence.
- Keep the parent PR Draft until all exit gates pass. Merge/release is outside this planning assignment and requires its normal authorization.

## Acceptance mapping

| Acceptance | Owning tasks       | Automated evidence                                         | Manual/review evidence                 |
| ---------- | ------------------ | ---------------------------------------------------------- | -------------------------------------- |
| AC-01      | B1, F2             | `OfficeRepositoryManagementTest`; sidebar/app tests        | Admin/Office/denied-role session smoke |
| AC-02      | B1                 | route assertions and `route:list`                          | R1 middleware review                   |
| AC-03      | B1, F1             | backend bucket cases; module bucket tests                  | Cross-bucket smoke                     |
| AC-04      | B1, F1             | validation/search/order/pagination tests; API tests        | Query review                           |
| AC-05      | B1, F1             | exact JSON missing-field assertions; UI absence assertions | R1 payload/network inspection          |
| AC-06      | B1, F1             | update/allowlist/normalization/SDG/provenance tests        | Edit/refetch smoke                     |
| AC-07      | B1, F1             | preservation snapshot and delete UI tests                  | DB/storage diff review                 |
| AC-08      | B1, F1             | restore/preservation/reindex-failure tests                 | Restored bucket smoke                  |
| AC-09      | F1                 | component state/race/a11y assertions                       | responsive/keyboard pass               |
| AC-10      | F1, F2             | ManageRepository and existing bulk-import tests            | Both-role import smoke                 |
| AC-11      | F2                 | admin/office desktop/mobile navigation and app tests       | visual nav check                       |
| AC-12      | B1, F1, F2, R1, V1 | full suites/build                                          | ownership and final diff audit         |

## Verification commands

Run from the indicated isolated worktree's `v1` directory. Never run broad write-formatting in the shared checkout.

```powershell
# B1 focused backend checks
Set-Location backend
php artisan test tests/Feature/OfficeRepositoryManagementTest.php
php artisan route:list --path=api/office/repository
vendor/bin/pint --test routes/web.php app/Http/Controllers/OfficeRepositoryController.php app/Http/Requests/OfficeRepositoryIndexRequest.php app/Http/Requests/OfficeRepositoryUpdateRequest.php app/Http/Resources/OfficeRepositoryItemResource.php app/Http/Resources/OfficeRepositoryDetailResource.php app/Services/OfficeRepositoryService.php tests/Feature/OfficeRepositoryManagementTest.php
Set-Location ..

# F1 focused frontend checks
npm run test --workspace=@researchnav/frontend -- src/api.test.ts src/ManageRepository.test.tsx src/ResearchOfficeBulkImport.test.tsx
npx --workspace=@researchnav/frontend prettier --check src/api.ts src/api.test.ts src/ManageRepository.tsx src/ManageRepository.test.tsx src/ManageRepository.css

# F2 focused frontend checks
npm run test --workspace=@researchnav/frontend -- src/AdminSidebarPages.test.tsx src/RoleSidebarPages.test.tsx src/app.test.tsx
npx --workspace=@researchnav/frontend prettier --check src/data.ts src/Dashboard.tsx src/AdminSidebarPages.tsx src/AdminSidebarPages.test.tsx src/RoleSidebarPages.tsx src/RoleSidebarPages.test.tsx src/RoleWorkspaces.tsx src/app.test.tsx

# Combined full gates
composer --working-dir=backend test
npm run format:check --workspace=@researchnav/frontend
npm run lint --workspace=@researchnav/frontend
npm run typecheck --workspace=@researchnav/frontend
npm run test --workspace=@researchnav/frontend
npm run build --workspace=@researchnav/frontend

# Final read-only scope checks (PowerShell)
git diff --name-only 2cfdf31b1ac4ff5ba5a58b2169c70edb9789bd62...HEAD
git diff --check 2cfdf31b1ac4ff5ba5a58b2169c70edb9789bd62...HEAD
git diff --name-only 2cfdf31b1ac4ff5ba5a58b2169c70edb9789bd62...HEAD -- v1/backend/database v1/backend/app/Models/ManuscriptSearchDocument.php v1/backend/app/Services/ManuscriptSearchProjectionService.php ':(glob)v1/backend/**/*Similarity*' ':(glob)v1/frontend/src/**/*similarity*' ':(glob)v1/frontend/src/**/*Similarity*'
```

The last command must print nothing. Do not run migration commands for this feature. Backend tests may build their disposable test schema from existing migrations; they must never target a valuable local or production database.

## Security and risk controls

- **Authorization/IDOR:** retain `current.user`, `account.active`, and `office.authority`; revalidate office authority in the locked service operation; resolve every id server-side. Active Admin access comes through `DomainAuthorization::isOffice`, not a duplicate route.
- **CSRF/origin and abuse:** every mutation retains `origin.allowed` and `throttle:domain-mutations`; list page size is capped; search wildcards are escaped; sort columns/directions are allowlisted.
- **Mass assignment/lifecycle integrity:** a dedicated update request rejects unknown/nested fields; the service constructs an explicit metadata array. Status, visibility, timestamps, import fields, children, files, and deleted state are never accepted from the client.
- **Data minimization:** dedicated resources manually map fields. Exact absence tests cover all path/hash/projection/similarity keys; UI never builds a file URL from hidden data.
- **Destructive-action safety:** language says “Move to Recycle Bin,” a named confirmation is required, controls are single-submit guarded, delete is Eloquent soft delete only, and no force/permanent route exists.
- **Preservation:** transactional row locks, before/after snapshots, no file/storage service calls, and no migration. Audit/monitor rows are append-only evidence, not rewrites of existing lifecycle state.
- **Restore/reindex separation:** commit restoration first; invoke only the existing projection service afterward; catch failures and log ids/error class only. Do not log manuscript text, payloads, paths, or stack traces containing secrets.
- **Race handling:** lock `withTrashed` rows and re-check state in the transaction; frontend cancellation/generation guards prevent stale bucket/detail responses from replacing current state.
- **Regression containment:** no edits to public repository, generic research CRUD, `ResearchDocument` model hook, similarity implementation/UI, bulk importer, migration, legacy `server/`, or storage code.
- **Contradictory historical plan:** reviewers reject any migration, provenance/deletion-ledger, permanent-delete, or `/api/admin/repository` code copied from the superseded plan.
- **Dirty checkout:** all implementation occurs in external worktrees. Never clean, stash, reset, or broadly stage the shared checkout. Stage explicit owned paths only after independent test PASS; never use `git add .`.

## Entry gates

- [ ] This canonical plan and frozen API/resource contract are approved.
- [ ] G0 verifies exact base SHA, no tracked dirty changes, and inventories unrelated untracked artifacts without touching them.
- [ ] Draft parent PR targets `deploy/full-update-2026-09-23`; plan and child worktrees are external and clean.
- [ ] B1, F1, and F2 owners acknowledge exclusive paths and dependency order.
- [ ] Disposable backend test database configuration is confirmed; no migration command will run against valuable data.
- [ ] Superseded-plan exclusions are copied into child PR descriptions.

## Exit gates

- [ ] AC-01 through AC-12 each have linked automated and/or manual evidence.
- [ ] Five and only five dedicated office repository routes exist; no admin duplicate or permanent-delete route/control exists.
- [ ] Delete/restore preservation snapshot proves source children, files/storage, import data, and lifecycle fields remain unchanged.
- [ ] Detail/network inspection proves path/hash/projection/similarity redaction.
- [ ] Shared module and unchanged bulk importer work for active Admin and Research Office; standalone Upload Manuscript nav is gone on desktop/mobile.
- [ ] Focused tests, full backend/frontend suites, lint, typecheck, format check, and client/SSR build pass relative to baseline.
- [ ] Code and security reviews have no unresolved blocking findings.
- [ ] Final diff contains only owned paths, no migration/schema/similarity/storage changes, and no unrelated artifacts.
- [ ] Parent Plan PR has child links, merge SHAs, test evidence, decisions, and residual risks and is ready for review.

## Workstream checklist

- [ ] P0 canonical plan approval
- [ ] G0 baseline verification, external worktrees, and Draft parent PR
- [ ] B1 dedicated office repository API and backend acceptance tests
- [ ] F1 shared API client, Manage Repository module, embedded existing importer, and component tests
- [ ] F2 Admin/Research Office shell integration and Upload Manuscript nav removal
- [ ] R1 code and security review
- [ ] V1 integrated automated/manual verification and ownership diff audit
- [ ] C1 parent PR evidence and exit-gate completion

## Draft parent PR body

**Title:** `plan: implement shared Manage Repository workspace`

**Base:** `deploy/full-update-2026-09-23`<br>
**Head:** `plan/manage-repository`<br>
**State:** Draft

### Goal

Provide active System Administrators and Research Office personnel one shared Manage Repository workspace for ongoing, archived, and recycled research, including safe metadata editing, soft delete, restore, and the existing bulk-import workflow.

### Architecture

- Five dedicated `/api/office/repository` list/detail/update/delete/restore routes under `office.authority`.
- Ongoing is non-trashed `archive_status != archived`; Archived is non-trashed `archive_status = archived`; Recycle Bin is `onlyTrashed()`.
- Dedicated list/detail resources redact storage paths/hashes and all similarity/projection data.
- Live metadata edits are allowlisted. Delete changes only `deleted_at` and preserves source children/files/lifecycle. Restore clears only `deleted_at` and may best-effort reindex through the unchanged projection service.
- One React module is mounted by both roles and embeds the unchanged `ResearchOfficeBulkImport`; standalone Upload Manuscript navigation is removed.

### Scope

- [ ] Shared Manage Repository module for active Admin and Research Office
- [ ] Ongoing, Archived, Recycle Bin, and Import manuscripts views
- [ ] Safe detail, live metadata edit, soft delete, and restore
- [ ] Navigation replacement on desktop/mobile and office dashboard destination
- [ ] Focused backend/frontend tests, security review, and integrated verification

### Non-goals

- No migrations/schema changes, provenance columns, deletion ledger, permanent delete, storage deletion, admin-prefixed duplicate API, similarity code/UI, public catalog change, bulk-import rewrite, or unrelated cleanup.
- `docs/plans/repository-management-implementation-plan.md` is historical and is not an implementation source for this PR.

### Acceptance

- [ ] AC-01 shared authorized module
- [ ] AC-02 exact secured route set
- [ ] AC-03 exact bucket semantics
- [ ] AC-04 validated list behavior
- [ ] AC-05 detail/UI redaction
- [ ] AC-06 allowlisted metadata editing
- [ ] AC-07 preserving soft delete and no permanent delete
- [ ] AC-08 preserving restore and non-fatal best-effort reindex
- [ ] AC-09 complete resilient/accessible UI states
- [ ] AC-10 unchanged importer reuse
- [ ] AC-11 standalone Upload Manuscript nav removed
- [ ] AC-12 no excluded-scope changes

### Workstreams

| Workstream                  | Owner                        | Status                   | Branch                                    | Child PR |
| --------------------------- | ---------------------------- | ------------------------ | ----------------------------------------- | -------- |
| B1 Office repository API    | Backend Builder              | Pending                  | `feat/manage-repository-api`              |          |
| F1 Shared client/module     | Frontend Builder             | Pending                  | `feat/manage-repository-ui`               |          |
| F2 Shell/navigation         | Frontend Integration Builder | Blocked by F1            | `feat/manage-repository-shell`            |          |
| R1 Review                   | Security Reviewer            | Blocked by merges        | read-only                                 |          |
| V1 Integration verification | Integration Tester           | Blocked by merges/review | `integration/manage-repository` if needed |          |

### Verification

- [ ] Focused office repository feature test and exact route inspection
- [ ] Focused API/module/navigation/bulk-import tests
- [ ] Backend full suite
- [ ] Frontend format check, lint, typecheck, full tests, and client/SSR build
- [ ] Admin/Office/denied-role, responsive, keyboard/focus, and network-redaction smoke tests
- [ ] Preservation snapshot and final ownership/excluded-path diff audit
- [ ] Security review

### Risks and controls

The principal risks are authority bypass, accidental permanent/file deletion, leaked storage locators, trashed-row binding mistakes, stale UI responses, non-fatal projection recovery becoming transaction-coupled, collision with unrelated untracked artifacts, and implementation from the contradictory historical plan. The plan controls them with office middleware plus locked service checks, explicit resources/allowlists, soft-delete-only preservation tests, post-commit best-effort reindex, request-generation guards, external worktrees, exclusive paths, explicit staging, and final excluded-path review.

### Child PR merge policy

Each child targets `plan/manage-repository`, links this parent, maps its acceptance ids, and includes command/exit evidence. It may merge only after builder self-check, independent Pre-Commit Tester PASS, explicit-path Git Steward commit, exact-commit PR tests, code review, and security review where applicable. Keep this parent Draft until every exit gate is evidenced.
