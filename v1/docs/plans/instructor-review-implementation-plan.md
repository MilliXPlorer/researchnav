# Instructor Review Implementation Plan

## Status and scope

Plan only. No product code, branch, worktree, commit, push, or PR has been created. The current worktree is heavily dirty and is not an implementation surface. The legacy `server/` application is out of scope.

The feature gives an instructor a **Title Proposals** queue for every research document covered by that instructor's active `instructor` review assignment, a reviewer-safe read modal, and a title recommendation recorded only as a title validation. It does not add recommendation storage, change research workflow status, or change the database schema.

## Contract decisions

- Add `GET /api/instructor/submissions` under the existing active-account/instructor route group. Return only documents having an active assignment where `reviewer_id` is the session actor and `review_role = instructor`; order newest update first; return `schema_version: 1` and `Cache-Control: private, no-store`.
- Queue item contract: `research_document_id`, `title`, `submitter`, `research_stage`, `submission_status`, and `updated_at`. `research_stage = title_proposal` is **Before defense**; `ongoing` or `completed` is **After defense**. Keep the existing `/api/instructor/title-proposals` endpoint for compatibility; do not make the new endpoint section-scoped.
- Add a frontend `createTitleValidation(documentId)` helper that posts `{}`. `validated_by` is always taken from the authenticated actor in `TitleValidationService`; client-supplied `validated_by` is prohibited. Existing assignment authorization remains authoritative.
- A recommendation is one title-validation lifecycle: create a pending validation, then patch that returned validation to `approved`, `revision_required`, or `rejected` with optional remarks. Never call the research status transition API. If the patch fails after creation, retain/display the pending validation and allow retrying that pending record rather than creating another.
- The modal may read generic detail, file/download, persisted-similarity, feedback, revision, monitoring, and validation APIs. It must not expose metadata edits, uploads/file changes, reviewer management, archiving, or workflow transitions. `ResearchActivity` remains read-only and gains only a parent-controlled refresh token/trigger.

## Dependency graph and workstreams

```text
Entry gates
  ├── B1 Backend contract + identity hardening ──┐
  └── F1 Frontend API contract ─────────────────┼── F2 Instructor queue/modal
                                                └── Q1 Automated acceptance tests
B1 + F1 + F2 + Q1 ── V1 Integrated verification ── Exit gates
```

Worktrees and branches below are proposed for a future, explicitly authorized implementation. Create each from the same approved clean baseline commit; never base them on or copy uncommitted files from `D:\ResearchNav\v1`.

### B1 — Backend endpoint and server-derived validator

- **Owner:** Backend API Engineer
- **Proposed worktree / branch:** `D:\ResearchNav\worktrees\instructor-review-backend` / `feat/instructor-review-backend`
- **Depends on:** entry gates
- **Exclusive file ownership:**
  - `backend/routes/web.php`
  - `backend/app/Http/Controllers/InstructorController.php`
  - `backend/app/Http/Requests/StoreTitleValidationRequest.php`
  - `backend/app/Services/TitleValidationService.php`
- **Tasks:**
  1. Register `GET instructor/submissions` in the existing instructor route group.
  2. Implement the exact queue query and response contract above, using active instructor review assignments and eager-loading only required submitter data.
  3. Prohibit `validated_by` in the store request and make `createPending` persist the locked/current actor id without reading identity from request data. Preserve authorization, audit, monitoring, and notification behavior.
- **Acceptance checks:** inactive, wrong-role, other-reviewer, soft-deleted, and unassigned records are absent; all three research stages are eligible; no section membership is required; spoofed validator identity is rejected; successful creation stores the session actor; recommendation operations do not alter `research_documents.submission_status`; no migration/model/table is added.
- **Focused command:** `cd backend && php artisan test --filter=InstructorReviewApiTest`

### F1 — Frontend API types and calls

- **Owner:** Frontend API Engineer
- **Proposed worktree / branch:** `D:\ResearchNav\worktrees\instructor-review-api-client` / `feat/instructor-review-api-client`
- **Depends on:** approved contract (may run in parallel with B1)
- **Exclusive file ownership:**
  - `frontend/src/api.ts`
- **Tasks:**
  1. Add the exact `InstructorSubmissionItem` stage/status type and `listInstructorSubmissions()` wrapper for `/api/instructor/submissions`.
  2. Add `createTitleValidation(documentId)` posting an empty JSON object; retain the existing list/update helpers and generic read/download helpers.
  3. Do not expose `validated_by` as create input and do not add a recommendation or status-transition client.
- **Acceptance checks:** URL, methods, response unwrapping, and empty POST payload match the contract; existing instructor title-proposal API remains available; TypeScript does not permit caller-supplied validator identity.
- **Focused command:** `npm run build --workspace=@researchnav/frontend`

### F2 — Title Proposals queue and reviewer-safe modal

- **Owner:** Frontend UI Engineer
- **Proposed worktree / branch:** `D:\ResearchNav\worktrees\instructor-review-ui` / `feat/instructor-review-ui`
- **Depends on:** B1 contract stable; F1 merged into this worktree
- **Exclusive file ownership:**
  - `frontend/src/RoleSidebarPages.tsx`
  - `frontend/src/ResearchActivity.tsx`
  - `frontend/src/styles.css`
- **Tasks:**
  1. Dispatch instructor **Title Proposals** to a real page backed by `listInstructorSubmissions`, with loading/error/retry/empty states, refresh, before/after-defense filtering from `research_stage`, status filtering, and a review action per row.
  2. Build a dedicated reviewer-safe modal. Load document detail, current files, persisted similarity results, and title validations; show authenticated download links. Render feedback/revisions/monitoring through `ResearchActivity` rather than copying admin mutation controls.
  3. Add recommendation controls mapped only to title-validation decisions. Reuse a pending validation created during the current attempt after a partial failure; disable duplicate submission while busy; refresh validations, queue data, and the activity refresh token after success.
  4. Add an optional `refreshKey` (or equivalent trigger) to `ResearchActivity`'s effect dependencies without adding mutation controls.
- **Acceptance checks:** navigation no longer renders `null`; stage mapping is exact; modal data failures are recoverable and do not leak admin controls; files are read/download only; recommendation POST/PATCH is single-submit guarded; no call to `/status`, metadata/file mutation, reviewer replacement, or archive endpoints occurs; close/focus/busy behavior uses the shared modal safely.
- **Focused commands:** `npm run lint --workspace=@researchnav/frontend` and `npm run build --workspace=@researchnav/frontend`

### Q1 — Automated contract and UI acceptance coverage

- **Owner:** Verification Engineer
- **Proposed worktree / branch:** `D:\ResearchNav\worktrees\instructor-review-tests` / `test/instructor-review`
- **Depends on:** B1, F1, and F2 merged into this worktree
- **Exclusive file ownership:**
  - `backend/tests/Feature/InstructorReviewApiTest.php` (new)
  - `frontend/src/api.test.ts`
  - `frontend/src/RoleSidebarPages.test.tsx`
  - `frontend/src/ResearchActivity.test.tsx`
- **Tasks:**
  1. Cover endpoint authentication/role checks, assignment isolation, active/role filters, all-stage inclusion, ordering, response fields/cache header, and empty results.
  2. Cover validator spoof rejection, actor-derived persistence, unassigned/inactive instructor denial, no workflow-status mutation, and no extra persistence table.
  3. Cover API wrapper paths/payloads and Title Proposals dispatch, filters, retry/empty states, modal reads/download, partial create-then-patch recovery, successful recommendation refresh, and absence of unsafe mutation/status calls.
  4. Prove changing `ResearchActivity.refreshKey` refetches its three read endpoints and that the component remains read-only.
- **Acceptance checks:** tests fail against the pre-feature baseline for the intended missing behavior and pass after B1/F1/F2; network assertions reject any unexpected mutation; tests avoid timing-dependent sleeps.
- **Focused commands:**
  - `cd backend && php artisan test tests/Feature/InstructorReviewApiTest.php`
  - `npm run test --workspace=@researchnav/frontend -- --run src/api.test.ts src/RoleSidebarPages.test.tsx src/ResearchActivity.test.tsx`

### V1 — Integrated verification and ownership audit

- **Owner:** Integration Lead
- **Proposed worktree / branch:** clean integration worktree / integration branch chosen only after Git authorization
- **Depends on:** B1, F1, F2, Q1
- **File ownership:** none (read-only verification; fixes return to the owning workstream)
- **Checks:**
  1. Confirm every changed path belongs to exactly one owner and no database migration, recommendation model/table, or legacy `server/` change exists.
  2. Run `cd backend && composer test`.
  3. Run `npm run format:check --workspace=@researchnav/frontend`, `npm run lint --workspace=@researchnav/frontend`, `npm run test --workspace=@researchnav/frontend`, and `npm run build --workspace=@researchnav/frontend`.
  4. Manually smoke test assigned versus unassigned instructors, before/after-defense filters, file download, title recommendation, partial-failure retry, activity refresh, and unchanged research status.

## Entry gates

- Product/architecture owner approves the endpoint and queue-item contract, title-validation mapping, and before/after-defense stage semantics.
- User explicitly authorizes Git/worktree operations; until then no branch, worktree, commit, or PR may be created.
- Integration lead records a clean baseline commit and verifies baseline backend/frontend focused tests. The dirty `D:\ResearchNav\v1` worktree remains untouched.
- Owners accept the exclusive file map; any required extra file stops work for reassignment before editing.

## Exit gates

- All workstream acceptance checks and V1 commands pass from a clean integration worktree.
- Security tests prove active assignment scoping and server-derived validator identity.
- Network/diff review proves title validation is the only recommendation persistence and no direct workflow transition/new database object was introduced.
- Reviewer-safe modal is keyboard/focus checked and contains only permitted reads, downloads, and title recommendation controls.
- Product owner accepts queue/filter language and recommendation outcomes.

## Risk controls

- **Dirty-worktree contamination:** do not implement in `D:\ResearchNav\v1`; use same-baseline isolated worktrees only after authorization, and audit diffs by owner before integration.
- **Authorization drift:** centralize the queue predicate on active `instructor` assignments and retain generic API policies; test inactive/wrong-role/wrong-user assignments negatively.
- **Identity spoofing:** prohibit request `validated_by`, resolve/lock the current actor in the service, and assert the persisted id.
- **Accidental workflow mutation:** do not import/call `transitionInternalResearch`; assert status before/after and fail frontend tests on `/status` requests.
- **Partial two-call recommendation:** hold the created pending validation id in modal state; on PATCH failure show a retry that patches that id, and refresh authoritative validation data before allowing a new create.
- **Stale/racy modal state:** cancellation/generation guards for document changes/unmounts; disable controls while busy; refresh queue, validation history, and activity after success.
- **Sensitive reviewer surface:** dedicated component rather than reuse of `AdminResearchWorkspace`; no upload/edit/archive/reviewer controls; downloads continue through authorized generic endpoints.
- **Contract duplication:** leave `/title-proposals` compatible, but make the new UI consume only `/submissions`; document one stage mapping and test it.

## Workstream checklist

- [ ] Entry gates approved, including explicit Git/worktree authorization
- [ ] B1 backend endpoint and identity hardening complete
- [ ] F1 frontend API contract complete
- [ ] F2 queue, safe modal, recommendation, and activity refresh complete
- [ ] Q1 backend/frontend acceptance tests complete
- [ ] V1 full verification and ownership audit complete
- [ ] Exit gates accepted

## Plan PR body draft

**Title:** `plan: instructor review queue and title recommendations`

**Summary**
- Plan an assignment-scoped instructor submissions endpoint and activate the Title Proposals frontend.
- Use existing generic reviewer reads and title validations; add no workflow transition, recommendation table, or schema change.
- Isolate backend, API-client, UI, and test ownership in separate clean worktrees.

**Architecture decisions**
- Active instructor review assignments are the queue authority.
- `title_proposal` means before defense; `ongoing`/`completed` mean after defense.
- `validated_by` is session-derived server-side.
- The modal is reviewer-safe; `ResearchActivity` remains read-only with a refresh trigger.

**Validation**
- [ ] Backend focused/full tests pass
- [ ] Frontend format, lint, focused/full tests, and build pass
- [ ] Assignment isolation and identity spoof tests pass
- [ ] No status transition, migration, or recommendation persistence added
- [ ] Workstream file ownership audit passes

**Operational note**
No Git operations should begin until explicitly authorized; the current dirty worktree must remain untouched.
