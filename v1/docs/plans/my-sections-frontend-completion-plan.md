# My Sections Frontend Completion Plan

## Status and objective

- **Artifact:** implementation plan only. Do not stage, commit, push, create a branch/worktree, or open a PR.
- **Checkout:** `D:\ResearchNav\v1` is a heavily dirty shared worktree containing the user's uncommitted My Sections implementation. Preserve it in place: no reset, clean, stash, checkout, broad formatter write, or file replacement.
- **Objective:** complete the instructor My Sections experience with folder-style section cards, URL-backed section/project pages, project folders, hidden edit/assignment forms, separate student/staff controls, safe removals, back links, and responsive accessible behavior while reusing the current React navigation and Laravel section APIs.
- **Scope priority:** frontend first. Backend work is limited to the two contract gaps required for project-title editing and genuine staff unassignment. The legacy `server/` workspace and database migrations are out of scope.

## Current-state decisions

1. Use these canonical client routes with the existing `history.pushState` navigator:
   - `/app/instructor/sections`
   - `/app/instructor/sections/:sectionId`
   - `/app/instructor/sections/:sectionId/projects/:researchDocumentId`
2. A UI “project” remains the existing `ResearchDocument`; do not add a `Project` model/table or migrate data.
3. “Add project” means attach one or more existing eligible research documents through `PUT /api/instructor/sections/{section}/documents`. The form must say **Attach existing projects** rather than imply a new title is created.
4. Preserve the existing Add Section modal and section create API; only its launcher/card flow may be integrated with routing.
5. Add a narrowly nested title edit contract: `PATCH /api/instructor/sections/{section}/documents/{document}` with `{ "title": string }`. It must verify section ownership and document nesting, update `title` and `normalized_title` atomically, audit the change, and return the existing section-document item shape. No other research metadata or workflow field is accepted.
6. Keep project-team writes as an atomic full snapshot, but permit incomplete snapshots so an assignment can be removed:
   - all four keys remain required/present;
   - lead ids accept `string | null`;
   - `panel_member_ids` accepts `[]`;
   - omitted/non-null users retain current eligibility and duplicate-person validation;
   - `complete` remains true only with all three leads and at least one panel member.
7. Each separate assignment form changes one role but submits the complete current snapshot. Replacing or clearing an existing staff member requires confirmation before the PUT. Student removal requires confirmation at both section and project level.
8. Forms are closed and not focusable by default. Their triggers expose `aria-expanded`/`aria-controls`; opening a form moves focus to its first field, and closing/restoring returns focus to its trigger.
9. Direct loads, refresh, browser Back, and browser Forward are authoritative. Missing, non-owned, or stale section/project ids show a recoverable not-found/error state with a safe back link; they must not silently fall back to another section/project.

## Create-project endpoint feasibility

**Technically feasible without a migration, but intentionally excluded from this smallest safe completion.** `research_documents.category_id` is nullable and its draft/status fields support a title-only draft, but `submitted_by` is mandatory and the current instructor cannot use `ResearchService::createDraft` as a researcher owner. A safe future endpoint would therefore have to require an active **primary student already on the section roster**, create the document on that student's behalf, normalize the title, create the initial author/project-membership rows, establish the instructor's review access, and emit monitoring/audit records in one transaction.

Do not default `submitted_by` to the instructor and do not create an ownerless document. Those choices would conflict with current ownership/policy semantics. Creation remains a follow-up until primary-owner/authorship behavior is explicitly approved and the unresolved section-level versus project-level pivot semantics are validated on MariaDB.

## Dependency graph

```text
E0 preservation + baseline gate
  -> B1 minimal backend contract gaps
  -> F1 route and API plumbing
  -> F2 route-backed section/project UI
  -> Q1 focused automated acceptance coverage
  -> V1 full verification + manual accessibility/responsive pass
  -> exit gate
```

All tasks are deliberately serial. There are **no implementation branches or isolated worktrees** under the user's explicit safety constraint. `D:\ResearchNav\v1` is the only allowed checkout, and only one owner may edit at a time. This is an explicit exception to the normal worktree-isolation policy; execution remains blocked unless the preservation gate below passes.

## Exclusive ownership map

| Task | Single owner | Worktree | Exclusive files |
|---|---|---|---|
| E0 | Preservation Custodian | Read-only in `D:\ResearchNav\v1` | None |
| B1 | Backend API Engineer | `D:\ResearchNav\v1`, serial only | `backend/routes/web.php`; `backend/app/Http/Controllers/InstructorController.php`; `backend/app/Services/ClassSectionService.php`; `backend/app/Services/ResearchProjectTeamService.php` |
| F1 | Frontend Routing/API Engineer | same, after B1 | `frontend/src/paths.ts`; `frontend/src/App.tsx`; `frontend/src/Dashboard.tsx`; `frontend/src/api.ts` |
| F2 | Frontend UI Engineer | same, after F1 | `frontend/src/RoleSidebarPages.tsx`; `frontend/src/styles.css` |
| Q1 | Verification Engineer | same, after F2 | `backend/tests/Feature/InstructorProjectTeamTest.php`; `backend/tests/Feature/InstructorSectionMembersTest.php`; `backend/tests/Feature/InstructorSectionProjectTest.php` (new); `frontend/src/api.test.ts`; `frontend/src/app.test.tsx`; `frontend/src/RoleSidebarPages.test.tsx` |
| V1 | Integration Verifier | Read-only | None; findings return to the owner above |

No owner may edit a path outside its row. If an additional path is needed, stop and revise ownership before editing. Existing user changes in every owned file are inputs to preserve, not code to replace.

## Tasks and gates

### E0 — Preserve the shared dirty baseline

- **Entry:** user confirms this plan is the intended scope.
- Record read-only `git status --short`, staged/unstaged diffs, untracked paths, current HEAD, and hashes/copies of every file in the ownership map. Store any safety copy outside `D:\ResearchNav` so it cannot be staged accidentally.
- Record baseline results for the focused commands listed under Verification. Do not repair unrelated failures.
- Compare the current My Sections implementation with the ownership map; if another live process/user is editing these files, stop.
- **Exit:** the current bytes can be restored without Git operations, unrelated dirty changes are inventoried, and one-at-a-time editing is confirmed.

### B1 — Close only the required Laravel contract gaps

- Register nested project-title PATCH in the existing authenticated active-instructor route group, retaining origin and domain-mutation throttling.
- Add controller validation for a nonblank title up to 500 characters. Reject wrong owner and wrong section/document nesting before mutation.
- Add a transactional `ClassSectionService` operation that locks section/document, rechecks ownership/nesting, changes only `title`/`normalized_title`, and writes an audit event.
- Change team replacement validation and service handling to support nullable lead slots and an empty panel list while retaining role eligibility, active-account checks, one-role-per-person, transaction locking, ordering, and the complete flag.
- Do not add routes for section/project deletion, generic metadata editing, project creation, or database migrations.
- **Acceptance:** another instructor is forbidden; a document in another section is not mutable; unknown workflow fields cannot be changed; title normalization is deterministic; incomplete team snapshots persist and return `complete: false`; full snapshots still return `complete: true`; invalid roles/duplicates still fail atomically.
- **Exit:** focused backend tests from Q1 are specified against the exact contract and Pint reports no changed-file issues.

### F1 — Make routes and API contracts authoritative

- Extend `isProtectedRoute` for the three canonical instructor section routes.
- Parse section/project ids in `App.tsx`; pass route context and `initialNav="My Sections"` to `Dashboard` without introducing a router dependency.
- In `Dashboard.tsx`, synchronize My Sections on direct load/popstate, route its desktop/mobile navigation to `/app/instructor/sections`, and clear nested route context when another navigation item is chosen.
- Pass `navigate`, `sectionId`, and `projectId` through `RoleSidebarPage` to the instructor sections surface.
- Add the nested title PATCH API helper/type updates and make the team snapshot input nullable/empty-capable. Keep existing section CRUD, attach-document, student membership, candidate, and team endpoints unchanged.
- **Acceptance:** deep links are protected; direct load and popstate select My Sections; section/project ids remain stable across render; sidebar changes cannot leave a stale nested URL; API URL/method/body/response unwrapping match B1.
- **Exit:** TypeScript build succeeds before F2 starts.

### F2 — Complete the My Sections UI

- Preserve the existing Add Section modal and replace the section table with an accessible responsive folder-card grid showing name, academic year, active state, project count, and student count. Card activation navigates to the section URL.
- Refactor `InstructorSections` to render by route state rather than `openSection`/`selectedDocument` local pseudo-pages:
  - list page loads owned sections;
  - section page resolves the exact section, loads its roster and projects, and links back to My Sections;
  - project page resolves the exact nested document, loads project students/team, and links back to its section.
- On the section page, show project folder cards and a closed-by-default **Attach existing projects** form using the existing assignable-document API. Preserve section edit/activate controls in a closed edit form and keep section-level Add Students closed by default.
- On the project page, add a closed title edit form using the nested PATCH. Show project students and team summaries when forms are closed.
- Provide five independent closed controls with exact visible labels: **Add Students**, **Assign Adviser**, **Assign Research Office Representative**, **Assign Panel Chair**, and **Assign Panel Members**. Load role candidates only when that form opens; prevent the same person occupying multiple team roles.
- Before removing a section student, project student, lead assignee, chair, or panel member, show `ConfirmDialog` naming the person and impact. Cancel makes no request; confirm is single-submit guarded. Replacement of an existing staff member is also a removal and needs confirmation before the full snapshot PUT.
- Keep notices as `role="status"` and failures as `role="alert"`; preserve retry, loading, empty, and busy states. Do not render hidden forms with CSS alone—conditionally mount them so controls are absent from keyboard order.
- Add responsive styles for card grids and stacked controls at narrow widths; retain visible focus, 44px-equivalent touch targets, readable wrapping, and no page-level horizontal overflow at 320px.
- **Acceptance:** no modal/pseudo-page is used for section or project details; every route has one clear page heading and correct back link; forms are absent until triggered; all mutations refetch authoritative data; browser history works; remove/replace requests cannot occur before confirmation; cards and controls work by keyboard and touch.
- **Exit:** focused frontend tests are ready for Q1 and no unrelated role workspace behavior changed.

### Q1 — Add focused automated acceptance coverage

- Backend project test: title PATCH success, normalization/audit, owner/nesting/active-role denial, title validation boundaries, and proof no other document field changes.
- Backend team test: partial snapshots, clearing each lead, empty/reduced panels, full-team compatibility, duplicates, ineligible/inactive users, ownership, nesting, and transaction rollback.
- Retain and extend section member tests for confirmation-relevant API behavior; do not alter unresolved database semantics in this task.
- Frontend API test: exact nested PATCH and nullable full-snapshot payloads.
- App/Dashboard tests: direct list/section/project loads, protection, refresh representation, Back/Forward popstate, My Sections sidebar routing, and leaving a nested route.
- Role page tests: folder cards; Add Section preservation; section/project back links; attach existing projects; hidden forms; exact five controls; section/project edits; candidate lazy loading; student/staff confirmation cancel/confirm; partial/full team saves; stale-id/error/retry states; rapid route changes cannot display stale data.
- Test accessible names/expanded state and assert hidden form fields are not in the document before opening.
- **Exit:** focused suites pass and each acceptance statement above has an automated assertion or is listed for V1 manual verification.

### V1 — Integrated verification

- Review only the owned-file diffs against E0 copies; reject overwritten or reformatted unrelated user code.
- Run all focused and full commands below. Record exit codes, failures, and skipped checks; unrelated baseline failures remain explicit and are not silently fixed.
- Manually test instructor owner/non-owner behavior on disposable data only. Do not run migrations or destructive tests against a valuable database.
- Keyboard test every card, back link, trigger, form, cancel, and confirmation; verify focus return and Escape behavior. Check 320px, 768px, and desktop layouts plus 200% zoom.
- **Exit:** tests pass relative to baseline, no unauthorized/unconfirmed request occurs, no unrelated diff exists, and all user acceptance criteria are demonstrated.

## Verification commands

Run from `D:\ResearchNav\v1` unless a command changes directory.

```powershell
# Backend focused
Set-Location backend
php artisan test tests/Feature/InstructorSectionProjectTest.php tests/Feature/InstructorProjectTeamTest.php tests/Feature/InstructorSectionMembersTest.php
vendor/bin/pint --test routes/web.php app/Http/Controllers/InstructorController.php app/Services/ClassSectionService.php app/Services/ResearchProjectTeamService.php tests/Feature/InstructorSectionProjectTest.php tests/Feature/InstructorProjectTeamTest.php tests/Feature/InstructorSectionMembersTest.php
Set-Location ..

# Frontend focused
npm run test --workspace=@researchnav/frontend -- src/api.test.ts src/app.test.tsx src/RoleSidebarPages.test.tsx

# Full gates
composer --working-dir=backend test
npm run format:check --workspace=@researchnav/frontend
npm run lint --workspace=@researchnav/frontend
npm run test --workspace=@researchnav/frontend
npm run build --workspace=@researchnav/frontend
```

Do not run `npm run format`, because it writes broadly across a dirty workspace. Run no database migration command for this feature.

## Risk controls

- **User-change loss:** external byte copy/hash first; serial ownership; no Git mutation; no broad writes; stop on concurrent edits or unexpected diff.
- **Route/state races:** route ids are authoritative, every async load uses cancellation/request-generation guards, and stale responses cannot replace a newer route.
- **IDOR:** Laravel rechecks active instructor, section owner, and section/document nesting inside the transaction; frontend hiding is never authorization.
- **Destructive membership edits:** named confirmation, cancel-with-zero-request tests, single-submit busy guards, and authoritative refetch after success.
- **Full-snapshot lost update:** lock the document/team rows, send the latest loaded snapshot, disable parallel saves, and refetch after each write. A conflict/failure preserves visible server state rather than optimistic removal.
- **Ownership semantics:** no create-project endpoint and no instructor-as-submitter shortcut. Existing attach behavior remains the only add-project path.
- **Pivot/migration ambiguity:** do not change `class_section_members` schema or reinterpret historical null/project rows here; test current behavior and keep MariaDB validation as a release risk.
- **Regression surface:** no new routing library, project model, migration, section/project deletion, generic research mutation, or legacy `server/` change.

## Entry gates

- [ ] User approves the route names, “Attach existing projects” terminology, nested title-only edit, and nullable full-team snapshot.
- [ ] E0 external preservation and read-only dirty-file inventory are complete.
- [ ] Baseline focused test results and known unrelated failures are recorded.
- [ ] No concurrent editor/process owns any listed file.
- [ ] Owners accept the exclusive map and serial execution; no branch/worktree/PR will be created.

## Exit gates

- [ ] Folder section cards and project folders navigate to direct, refresh-safe URLs with working Back/Forward and page back links.
- [ ] Existing Add Section works; all edit/attach/student/staff forms are closed by default and accessible when opened.
- [ ] Sections, project titles, students, and team assignments update through authorized APIs and refetch authoritative state.
- [ ] Student/staff removals and replacements require confirmation; cancellation sends no mutation.
- [ ] Focus, keyboard, screen-reader names/status, 320px responsiveness, desktop layout, and 200% zoom pass manual review.
- [ ] Focused/full checks pass relative to the recorded baseline; no new migration, model, dependency, branch, worktree, commit, or PR exists.
- [ ] Diff audit proves unrelated user changes were preserved byte-for-byte.

## Workstream checklist

- [ ] E0 preservation and baseline gate
- [ ] B1 nested title edit and partial full-snapshot team contract
- [ ] F1 protected routes, navigation synchronization, and API client
- [ ] F2 folder cards, separate pages, hidden forms, controls, confirmations, responsive/a11y
- [ ] Q1 backend/frontend acceptance tests
- [ ] V1 full verification and diff audit
- [ ] Exit gates accepted

## Plan PR body draft

> Draft only; do not open this PR under the current no-branch/no-PR constraint.

**Title:** `plan: complete route-backed My Sections workspace`

### Goal

Complete the instructor My Sections frontend around existing section, document-attachment, project-membership, and team APIs while preserving the user's dirty in-progress implementation.

### Scope

- Folder cards for sections and projects.
- URL-backed list, section, and project pages using existing custom navigation.
- Existing Add Section plus hidden attach/edit/student/staff forms.
- Separate Add Students and four staff-role controls.
- Confirmed student/staff removal and replacement.
- Responsive and accessible states, back links, tests, and race/error handling.
- Minimal backend only for nested title editing and incomplete full-team snapshots.

### Non-goals

- No create-project/title endpoint, project table/model, migration, deletion flow, router dependency, legacy server change, or unrelated cleanup.
- No Git branch/worktree/commit/push/PR while the shared checkout remains dirty.

### Verification

- [ ] Focused Laravel project/team/member tests
- [ ] Focused frontend API/routing/My Sections tests
- [ ] Backend full suite
- [ ] Frontend format check, lint, full tests, and client/SSR build
- [ ] Keyboard, focus, 320px/768px/desktop, and 200% zoom checks
- [ ] Dirty-file preservation/diff audit

### Risks

The checkout is unreproducibly dirty, project creation lacks safe ownership semantics, section/project memberships share a recently changed pivot, and full-team updates can lose stale concurrent changes. Serial execution, external byte preservation, nested authorization, transactional locking, refetches, and explicit scope exclusions control these risks.
