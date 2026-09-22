# Adviser and Instructor Navigation, Queues, and Progress Plan

## Plan status

Planning artifact only. No product code, worktree, branch, commit, push, or pull request is authorized or created by this plan.

The source workspace is `D:\ResearchNav\v1` on `chore/researchnav-current-baseline` and has substantial pre-existing uncommitted changes. It is discovery input only, not an implementation surface. Future work must start from one explicitly approved clean baseline commit after the existing changes are reconciled. The legacy `server/` application is out of scope.

## Objective

Give Adviser and Instructor users the same focused navigation after Dashboard:

1. Assigned Research
2. Title Review
3. Manuscript Review
4. Research Progress Updates
5. Defense Monitoring Forms
6. Review History

Assigned Research remains a folder workspace. Title and manuscript queues are filtered by the server. Research Progress Updates is a read-only, assignment-scoped folder view containing only researcher-reported progress. Existing API route families, database tables/columns, enum values, and activity names remain intact. Existing generic **Monitoring** navigation for Panel, Statistician, Research Editor, and Librarian is relabeled **Defense Monitoring Forms**.

## Scope and frozen decisions

### Included

- Replace the exposed Adviser and Instructor navigation with the frozen labels and order above, after Dashboard.
- Route both Adviser and Instructor **Assigned Research** to `AssignedResearchFolders`; do not build another assigned-research list.
- Route **Title Review** and **Manuscript Review** to role-specific review queues whose stage split is performed by Laravel, not by filtering a complete response in React.
- Add a read-only **Research Progress Updates** page shared by Adviser and Instructor.
- Keep the existing defense-monitoring forms and mutations, but present them under **Defense Monitoring Forms**.
- Relabel the existing generic Monitoring destination for Panel, Statistician, Research Editor, and Librarian.
- Preserve existing internal names, including `monitoring_logs`, `monitoring_entries`, `RESEARCHER_PROGRESS_REPORTED`, `research_stage`, `/api/adviser/pending-reviews`, `/api/instructor/submissions`, and shared-monitoring routes.

### Excluded

- Database migrations, indexes, backfills, enum changes, or renamed tables/columns.
- Renaming or removing existing API endpoints, controller methods, activity types, or persisted monitoring concepts.
- Changing review, recommendation, feedback, verification, signature, or defense-form mutation behavior.
- Replacing the assigned folder workspace or changing its authorization behavior.
- Deleting Instructor My Sections APIs or screens; My Sections is only removed from the exposed primary navigation.
- Changes under `server/`, generated `dist/`, caches, logs, `.env`, SQL backups, or unrelated dirty files.

## Frozen API contract

### Stage-filtered queues

Keep both existing endpoints and add an optional validated query parameter:

- `GET /api/adviser/pending-reviews?queue=title|manuscript`
- `GET /api/instructor/submissions?queue=title|manuscript`

Mapping is server-side and uses existing database values:

| `queue` | Server predicate |
|---|---|
| `title` | `research_stage = title_proposal` |
| `manuscript` | `research_stage IN (ongoing, completed)` |

No `queue` preserves the current unfiltered response for existing callers. Any other value returns the repository-standard validation response. Existing active role-specific review-assignment scoping, status predicates, ordering, response fields, `schema_version: 1`, and `Cache-Control: private, no-store` remain unchanged. The legacy Instructor `/api/instructor/title-proposals` endpoint remains available.

### Research progress read

Add `GET /api/monitoring/research-progress` inside the existing `current.user` and `account.active` group. Authorize only Adviser and Instructor actors. Use the same assigned-folder authority as `GET /api/monitoring/research`: active reviewer assignment for the actor, plus existing Instructor-owned-section inclusion. Reuse one private assigned-research query path in `SharedMonitoringController` so Assigned Research and progress cannot drift.

Response contract:

```json
{
  "data": [
    {
      "research_document_id": 42,
      "title": "Study title",
      "research_stage": "ongoing",
      "researchers": ["Researcher One"],
      "updates": [
        {
          "id": 91,
          "activity_type": "RESEARCHER_PROGRESS_REPORTED",
          "remarks": "Completed data gathering.",
          "monitoring_status": "in_progress",
          "activity_date": "2026-09-14T10:00:00.000000Z"
        }
      ]
    }
  ],
  "schema_version": 1
}
```

Contract rules:

- Include every assigned folder, including folders with `updates: []`.
- Include only records whose existing activity type/action resolves to `RESEARCHER_PROGRESS_REPORTED`; never mix in `monitoring_entries`, defense-form events, reviewer updates, audit events, or other monitoring-log activity types.
- Return at most the 10 newest updates per folder, ordered by `activity_date DESC, id DESC`.
- Preserve the assigned-folder order used by the shared folder query, with an ID tiebreaker for deterministic output.
- Return `schema_version: 1` and `Cache-Control: private, no-store`.
- Return no cross-assignment data. Inactive assignments and folders available only to another reviewer are excluded.
- Add no write endpoint and no new persistence object.

## Dependency graph

```text
E0 Clean-baseline and ownership gate
  -> B1 Backend queue/progress reads
      -> F1 Frontend navigation and pages
          -> V1 Integrated verification and acceptance
              -> X0 Exit gate
```

The work is intentionally ordered rather than parallel: the frontend consumes B1's verified query and response contracts. Fixes return to the owner of the affected path; the integration verifier does not edit files.

## Worktrees and ownership

All paths are relative to `D:\ResearchNav\v1`. Proposed worktrees are siblings outside the dirty workspace. Branch and worktree creation requires separate authorization and a recorded clean baseline commit.

| Task | Sole owner | Proposed branch | Proposed worktree | Depends on |
|---|---|---|---|---|
| B1 | Backend API Engineer | `feat/adviser-instructor-nav-backend` | `D:\ResearchNav\worktrees\adviser-instructor-nav-backend` | E0 |
| F1 | Frontend Engineer | `feat/adviser-instructor-nav-frontend` | `D:\ResearchNav\worktrees\adviser-instructor-nav-frontend` | B1 contract and tests pass |
| V1 | Integration Verifier | no implementation branch | clean integration worktree selected after authorization | B1, F1 |

No implementation path is shared between B1 and F1. V1 is read-only. If an unlisted file is required, stop before editing and amend ownership; do not cross-edit another workstream.

## Ordered executable tasks

### E0 — Establish a safe implementation baseline

- **Owner:** Repository Custodian
- **Edits:** none
- **Entry:** this plan is approved.
- **Actions:**
  1. Reconcile the substantial uncommitted changes in `D:\ResearchNav\v1` without discarding or absorbing unrelated work.
  2. Record the exact clean commit on or derived from `chore/researchnav-current-baseline` that contains the architecture inspected for this plan.
  3. Confirm the listed files exist at that commit and baseline focused tests pass.
  4. Create each future branch/worktree from that same commit only after explicit Git authorization.
- **Acceptance:** source commit is recorded; each implementation worktree is clean; `git status --short` is empty in each; no file from the dirty source tree was copied into a worktree.
- **Exit gate:** baseline and exclusive ownership map are accepted by the implementation lead.

### B1 — Implement server-filtered queues and assigned-folder progress

- **Owner:** Backend API Engineer
- **Exclusive file ownership:**
  - `backend/routes/web.php`
  - `backend/app/Http/Controllers/AdviserController.php`
  - `backend/app/Http/Controllers/InstructorController.php`
  - `backend/app/Http/Controllers/SharedMonitoringController.php`
  - `backend/tests/Feature/AdviserInstructorNavigationApiTest.php` (new)
- **Tasks:**
  1. Validate the optional `queue` parameter in Adviser pending reviews and Instructor submissions, then apply the frozen title/manuscript predicates before executing each query.
  2. Preserve no-parameter compatibility and every existing assignment, status, ordering, response, and cache rule.
  3. Refactor only enough of `SharedMonitoringController` to share its assigned-folder query with a new `researchProgress` read action.
  4. Register `GET monitoring/research-progress` without changing existing route names.
  5. Build each folder's response from only `RESEARCHER_PROGRESS_REPORTED` monitoring activity; include empty folders and enforce the per-folder newest-10 bound and deterministic ordering.
  6. Add focused authorization, contract, compatibility, and limit tests.
- **Acceptance checks:**
  - `queue=title` never returns `ongoing` or `completed`; `queue=manuscript` never returns `title_proposal` for either role.
  - Filtering occurs in SQL/server code; the API response does not rely on frontend filtering.
  - Missing `queue` retains the existing response behavior; invalid `queue` is rejected.
  - Wrong-role, inactive-account, inactive-assignment, and other-reviewer cases cannot read progress.
  - Instructor section-owned folders follow the same inclusion rule as Assigned Research.
  - A folder with no matching event is present with an empty array.
  - Eleven or more matching events yield exactly the newest 10; equal timestamps are ordered by descending ID.
  - Reviewer/defense monitoring events and similarly named events are absent.
  - No migration, model/schema change, write route, or mutation behavior change is present.
- **Focused commands (PowerShell):**

  ```powershell
  Set-Location backend
  php vendor/bin/pint --test routes/web.php app/Http/Controllers/AdviserController.php app/Http/Controllers/InstructorController.php app/Http/Controllers/SharedMonitoringController.php tests/Feature/AdviserInstructorNavigationApiTest.php
  php artisan test tests/Feature/AdviserInstructorNavigationApiTest.php tests/Feature/RoleWorkspaceApiTest.php
  ```

- **Exit gate:** focused checks pass and the response examples from both roles match the frozen contract.

### F1 — Expose the frozen navigation and consume server-filtered reads

- **Owner:** Frontend Engineer
- **Exclusive file ownership:**
  - `frontend/src/data.ts`
  - `frontend/src/Dashboard.tsx`
  - `frontend/src/api.ts`
  - `frontend/src/RoleSidebarPages.tsx`
  - `frontend/src/ResearchProgressUpdates.tsx` (new)
  - `frontend/src/api.test.ts`
  - `frontend/src/RoleSidebarPages.test.tsx`
  - `frontend/src/ResearchProgressUpdates.test.tsx` (new)
  - `frontend/src/app.test.tsx`
- **Tasks:**
  1. Set Adviser and Instructor nav labels/order exactly as frozen after Dashboard. Remove old exposed aliases such as Instructor **My Sections** and **Review Submissions** without deleting their internal screens or APIs.
  2. Replace generic **Monitoring** in Panel, Statistician, Research Editor, and Librarian nav with **Defense Monitoring Forms** and map the new label to the existing monitoring components.
  3. Add icons for the two new labels while retaining compatibility mappings needed by non-navigation internal code.
  4. Dispatch Instructor **Assigned Research** to `AssignedResearchFolders`, matching Adviser; do not call the submissions endpoint for that page.
  5. Extend the existing Adviser/Instructor queue clients with `queue: "title" | "manuscript"`, encoding the query parameter. Render Title Review and Manuscript Review by requesting the corresponding server queue. Remove stage filtering from React; optional status filtering may remain client-side within the already stage-filtered result.
  6. Add a typed `listResearchProgressUpdates()` client for `/api/monitoring/research-progress` and a shared read-only page with loading, error/retry, empty-assignment, empty-update, and refresh states. Render folder groups and at most the returned 10 newest updates without mutation controls.
  7. Change visible headings/copy from Monitoring to Defense Monitoring Forms where the destination represents defense-form monitoring; do not rename API helpers, payload fields, component internals, or database terminology.
  8. Add API, component, and menu integration tests.
- **Acceptance checks:**
  - Adviser and Instructor menus contain the six frozen destinations in order after Dashboard, with no exposed `Monitoring`, `Review Submissions`, or `My Sections` item.
  - Panel, Statistician, Research Editor, and Librarian expose **Defense Monitoring Forms**, not **Monitoring**, and still render their existing form/component.
  - Assigned Research opens the folder UI for both roles.
  - Title Review requests only `?queue=title`; Manuscript Review requests only `?queue=manuscript`. Tests fail on an unfiltered request and no React stage-filter expression determines queue membership.
  - Both role variants render all returned progress folders, including a clear no-updates state inside an otherwise valid folder.
  - Progress UI displays only contract fields and offers no create/update/delete/verify/sign controls.
  - Existing defense-monitoring save/verify requests and internal names are unchanged.
  - Loading, retry, refresh, empty, and stale-response/unmount behavior are deterministic and accessible.
- **Focused commands (repository root):**

  ```powershell
  npm run format:check --workspace=@researchnav/frontend
  npm run lint --workspace=@researchnav/frontend
  npm run typecheck --workspace=@researchnav/frontend
  npm run test --workspace=@researchnav/frontend -- --run src/api.test.ts src/RoleSidebarPages.test.tsx src/ResearchProgressUpdates.test.tsx src/app.test.tsx
  npm run build --workspace=@researchnav/frontend
  ```

- **Exit gate:** focused checks pass and network assertions prove queue filtering is server-requested while progress remains read-only.

### V1 — Integrated verification and ownership audit

- **Owner:** Integration Verifier
- **File ownership:** none; read-only. Any correction returns to B1 or F1 and repeats that workstream's pre-commit checks.
- **Checks:**
  1. Inspect the complete diff and confirm every changed implementation/test path has exactly one owner; confirm no `server/`, migration, generated, secret, SQL backup, or unrelated source-workspace file is present.
  2. Run backend formatting, focused tests, then the full backend suite.
  3. Run frontend formatting, lint, typecheck, focused tests, full tests, and production build.
  4. Smoke test Adviser and Instructor navigation, both queue stages, assigned folders, a progress folder with 0 updates, one with more than 10 updates, and existing defense-form save/verify behavior.
  5. Smoke test Panel, Statistician, Research Editor, and Librarian label routing.
- **Commands:**

  ```powershell
  Set-Location backend
  php vendor/bin/pint --test
  php artisan test tests/Feature/AdviserInstructorNavigationApiTest.php tests/Feature/RoleWorkspaceApiTest.php
  composer test

  Set-Location ..
  npm run format:check --workspace=@researchnav/frontend
  npm run lint --workspace=@researchnav/frontend
  npm run typecheck --workspace=@researchnav/frontend
  npm run test --workspace=@researchnav/frontend -- --run src/api.test.ts src/RoleSidebarPages.test.tsx src/ResearchProgressUpdates.test.tsx src/app.test.tsx
  npm run test --workspace=@researchnav/frontend
  npm run build --workspace=@researchnav/frontend
  ```

- **Exit gate:** all commands pass from a clean integration worktree and all acceptance evidence is recorded.

## Entry gates

- Frozen product decisions and API contract in this document are approved.
- The pre-existing uncommitted changes are reconciled by their owner; no automated cleanup, reset, stash, or overwrite is permitted.
- A clean baseline commit derived from `chore/researchnav-current-baseline` is recorded and contains the code shape referenced here.
- Explicit authorization is given before any worktree/branch operation.
- Baseline focused backend and frontend tests pass, or every pre-existing failure is documented and accepted before feature work.
- Owners accept the exclusive path map and stop on any ownership expansion.

## Exit gates

- B1 and F1 acceptance checks pass and V1 completes from a clean integration worktree.
- Adviser and Instructor navigation labels/order exactly match the frozen list and Assigned Research uses folders.
- Network and backend tests prove title/manuscript stage filtering is server-side.
- Progress tests prove assignment isolation, only `RESEARCHER_PROGRESS_REPORTED`, empty-folder inclusion, and newest-10-per-folder behavior.
- Existing API/database internal names and defense-monitoring mutations remain unchanged.
- Other applicable roles show Defense Monitoring Forms and retain working pages.
- Full backend and frontend suites and frontend production build pass, with any environment-limited check explicitly approved.
- No unrelated dirty-workspace content enters the implementation diff.

## Risk controls

- **Dirty-workspace contamination:** never implement in `D:\ResearchNav\v1`; pin one clean commit and create isolated sibling worktrees only after authorization. Compare each final diff against the pinned commit.
- **Baseline mismatch:** because inspected code may be uncommitted, E0 must confirm every referenced path/contract exists in the selected commit; otherwise pause and revise this plan rather than silently rebuilding missing work.
- **Assignment leakage:** centralize shared assigned-folder selection and negatively test inactive, wrong-role, and other-reviewer access.
- **Client-side queue regression:** assert exact request URLs and seed mixed stages in backend tests; stage membership must be determined before serialization.
- **Progress/defense conflation:** progress reads `monitoring_logs`/activity stream only and filters the exact `RESEARCHER_PROGRESS_REPORTED` constant; defense forms continue to use existing monitoring APIs and `monitoring_entries`.
- **Unbounded history:** enforce 10 per folder in the backend and test 11+ records plus deterministic timestamp ties. Avoid an unbounded all-history response even if the frontend renders only 10.
- **Empty-folder loss:** start from assigned folders and attach progress, not from progress rows; test a folder with no events.
- **Compatibility break:** make `queue` optional, leave existing endpoints/methods and `/api/instructor/title-proposals` intact, and run existing role-workspace/API tests.
- **Navigation dead ends:** integration tests click every changed role destination and assert a rendered page heading/state.
- **Scope expansion:** no schema, mutation, redesign, or legacy-server changes. Any unlisted file requires plan/ownership approval before edit.

## Workstream checklist

- [ ] E0 dirty-workspace changes reconciled without loss
- [ ] Clean baseline commit recorded and baseline checks captured
- [ ] Git/worktree operations explicitly authorized
- [ ] B1 server queue filtering complete
- [ ] B1 assignment-scoped progress response complete
- [ ] B1 focused backend checks pass
- [ ] F1 frozen Adviser/Instructor navigation complete
- [ ] F1 other-role Defense Monitoring Forms relabel complete
- [ ] F1 folder routing, queue clients, and progress UI complete
- [ ] F1 focused frontend checks and build pass
- [ ] Per-workstream independent pre-commit verification passes before any staging
- [ ] Ownership and secret/generated-file diff audit passes
- [ ] V1 full backend/frontend verification passes
- [ ] Manual role and boundary smoke checks pass
- [ ] Exit gates accepted

## Plan PR body draft

**Title:** `plan: align adviser and instructor research navigation`

### Goal

Align Adviser and Instructor navigation around assigned research folders, server-filtered title/manuscript queues, researcher progress updates, defense monitoring forms, and review history while preserving internal API/database contracts.

### Scope

- Adviser and Instructor receive the same six destinations after Dashboard.
- Assigned Research uses the existing folder workspace.
- Existing Adviser pending-review and Instructor submissions endpoints accept optional `queue=title|manuscript` server filters.
- A read-only assigned-folder progress endpoint/page includes only `RESEARCHER_PROGRESS_REPORTED`, including empty folders, capped at 10 newest updates per folder.
- Existing generic Monitoring labels become Defense Monitoring Forms for applicable roles.

### Non-goals

- No migration, schema rename, API rename/removal, or monitoring mutation change.
- No Assigned Research redesign and no deletion of Instructor section capabilities.
- No legacy `server/` changes.

### Workstreams

| Workstream | Owner | Status | Branch | Pull request |
|---|---|---|---|---|
| Safe baseline | Repository Custodian | Pending | n/a | n/a |
| Backend queues/progress | Backend API Engineer | Pending | `feat/adviser-instructor-nav-backend` | |
| Frontend nav/pages | Frontend Engineer | Pending | `feat/adviser-instructor-nav-frontend` | |
| Integration verification | Integration Verifier | Pending | n/a | n/a |

### Acceptance

- [ ] Adviser and Instructor labels/order match the frozen navigation.
- [ ] Assigned Research renders folders for both roles.
- [ ] Title/manuscript queue membership is server-filtered.
- [ ] Progress is assignment-scoped, exact-event-only, empty-folder-inclusive, and capped at 10 newest per folder.
- [ ] Defense Monitoring Forms retain existing behavior and internal names.
- [ ] Other applicable roles receive the new visible monitoring label.
- [ ] Backend/frontend focused and full checks pass.
- [ ] Ownership and dirty-workspace contamination audits pass.

### Risks and operational note

The current `chore/researchnav-current-baseline` workspace is substantially dirty. It must not be used for implementation or copied into worktrees. Record and verify a clean baseline commit first. This draft is metadata only; no PR is created or authorized by the plan.
