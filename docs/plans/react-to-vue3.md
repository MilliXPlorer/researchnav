# React-to-Vue 3 Migration Plan

## Plan metadata

| Item                          | Value                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Status                        | Proposed implementation plan; implementation has not started                  |
| Parent branch                 | `plan/react-to-vue3`                                                          |
| Parent worktree               | `<plan-worktree>`                                                             |
| Parent base                   | `882f52c6bbbebdd75c61021cdcfdfc0aa937c0e2`                                    |
| Parent PR target              | `main`                                                                        |
| Authoritative source snapshot | Dirty external source at `<external-source-root>/v1` at execution-time freeze |
| Destination                   | Tracked, sanitized `v1/**` subtree; absent from the parent base               |
| External reference only       | `<external-source-root>/v0/**`; never copied                                  |
| Target frontend               | Vue 3, Composition API, TypeScript, Vite                                      |

This document is the execution control plane. The dirty external source app is authoritative for behavior and content, but it is not safe to copy wholesale. The parent base has neither `v0/**` nor `v1/**`; its repository-root baseline files coexist with, and remain unchanged beside, the new tracked `v1/**` target. All implementation work must use the sanitization and baseline gates below.

## 1. Objective

Replace the authoritative ResearchNAV React 19 frontend with an equivalent Vue 3 Composition API/TypeScript frontend while preserving its observable UI, accessibility behavior, styles, Laravel API contracts, authentication/session behavior, legacy server rollback implementation, and similarity algorithm. Deliver the migrated application as a sanitized `v1/**` subtree without committing credentials, dependencies, generated output, runtime data, caches, TypeScript build metadata, or confidential manuscript/form corpora.

Success means a developer can install and run the Vue application from `v1`, all migrated frontend tests use Testing Library Vue, `vue-tsc` validates the SFCs, no React runtime or tooling remains in `v1`, and the untouched backend/server/algorithm regression suites remain green.

## 2. Scope

### In scope

- Freeze, inventory, test, and copy a sanitized snapshot of `<external-source-root>/v1` into tracked `v1/**`.
- Convert the frontend from React/TSX to Vue 3 single-file components using `<script setup lang="ts">` and Composition API primitives.
- Preserve the current manual History API navigation for `/`, `/catalog`, and `/app`; no routing library is introduced.
- Preserve current local/root component state and typed props/events; no global store is introduced.
- Replace `lucide-react` with `lucide-vue-next` while retaining the same icons, labels, and decorative `aria-hidden` treatment.
- Replace React Vite, ESLint, type, and test integration with Vue equivalents.
- Port existing React Testing Library tests to `@testing-library/vue` and retain the behavioral coverage for public repository data, API mapping/pagination, all ten role workspaces, access blocking, notifications, status chips, and similarity rings.
- Preserve Google Identity Services loading, server-side credential verification, session cookies, errors, dialog focus management, and retry states.
- Keep `src/styles.css` byte-for-byte identical unless a verified Vue rendering incompatibility makes a minimal selector-only correction necessary. Any exception requires before/after evidence and parent Plan PR documentation.
- Preserve and regression-test Laravel, legacy Express/server, and Python algorithm logic without creating backend or database implementation workstreams.
- Update setup and migration documentation after the frontend child PR is merged.

### Non-goals

- No feature development, redesign, copy rewrite, API expansion, schema/migration change, data import, or fabricated repository/workflow data.
- No Laravel, database, `server/**`, or `algorithm/**` logic changes.
- No SSR, hydration, Nuxt, `vue-router`, Pinia, Vuex, or another client state library.
- No replacement of Google Identity Services and no change to OAuth client/origin configuration.
- No change to session, authorization, origin, body-limit, rate-limit, upload, or public repository policy.
- No deployment, infrastructure, domain, production-data, or release automation changes.
- No edit to the external-reference-only `<external-source-root>/v0/**` or authoritative dirty source `<external-source-root>/v1/**`.
- No edit, deletion, move, or replacement of parent-base repository-root files. They coexist with the new `v1/**` target; a separately approved plan amendment is required before any root-baseline change.
- No confidential DOCX, derived manuscript catalog, local database, upload, log, or user runtime data in Git or PR artifacts.

## 3. Assumptions and constraints

1. `<external-source-root>/v1` is authoritative even though it is dirty and outside the parent base. It must be treated as read-only during migration and frozen by an allowlisted manifest at task F1. `<external-source-root>` is an execution-time placeholder, not a committed machine path.
2. The source may change before execution. F1 must record UTC freeze time and an aggregate allowlisted manifest digest. A later source change invalidates the baseline and requires rerunning F1; implementers must not silently mix snapshots.
3. The source `src/research_studies/catalog.json` is derived from confidential manuscripts and is treated as corpus/runtime data. It is excluded with the source DOCX files even though it is JSON.
4. `<external-source-root>/v0/**` is external-reference-only, is never copied, and is not a source for resolving ambiguities. Resolve ambiguities from the F1-frozen `<external-source-root>/v1/**` snapshot and this plan. Neither external `v0/**` nor external `v1/**` exists in the parent base.
5. The parent-base repository-root files are the compatibility baseline, not migration input. F1 must record their tracked path/hash manifest before copying, and F6/V4 must require an empty diff for every parent-base path outside `v1/**`; this plan deliberately supports coexistence by leaving those files unchanged.
6. PHP 8.3+, Composer 2, Node/npm, and Python with `algorithm/requirements.txt` dependencies are available to the applicable verifier. Environment limitations must be reported, not converted into false passes.
7. The Laravel API remains the normal API on `127.0.0.1:3001`; `server/**` remains an explicit legacy rollback/reference implementation.
8. The current UI intentionally contains prototype/empty states. Migration must preserve them rather than connecting unimplemented backend workflows.
9. Public and authenticated browser behavior must remain client-rendered only. Direct navigation relies on the existing development/hosting fallback to `index.html`; no server rendering is added.

## 4. Architecture

### 4.1 Runtime boundaries

```text
Browser
  -> v1/index.html (#root)
  -> v1/src/main.ts
  -> Vue 3 App.vue (manual pathname/session/repository state)
       -> public LandingPage.vue or CatalogPage.vue
       -> authenticated Dashboard.vue and RoleWorkspaces.vue
       -> GoogleSignInDialog.vue and shared SFCs
  -> relative /api requests with credentials: include
  -> Vite proxy to Laravel 13 at http://localhost:3001
  -> MariaDB/database sessions (unchanged)

Explicit rollback/reference only:
  v1/server/** (Express/PostgreSQL, unchanged)

Offline similarity utility:
  v1/algorithm/** (Python, unchanged; no corpus committed)
```

### 4.2 Vue application design

- `App.vue` owns `path`, `session`, sign-in dialog visibility, public records, loading, and repository error refs. It installs/removes the `popstate` listener and starts repository/session requests in `onMounted` with cancellation guards in `onBeforeUnmount`.
- Navigation remains a typed callback that uses `history.pushState`, updates the pathname ref, preserves the URL query, and scrolls to the top. Unknown paths continue to render the landing page; `/app` without a session continues to fall back to the landing page.
- Pages receive immutable data through typed props and communicate through typed emits (`sign-in`, `navigate`, `close`, `authenticated`, `logout`, and local action events).
- `Dashboard.vue` keeps navigation, notification, toast, drawer, and account-dialog state locally. `RoleWorkspaces.vue` keeps the statistician checklist locally. There is no global store.
- `useDialogFocus.ts` is a Vue composable using a template ref and mount/unmount lifecycle. It must focus the first eligible control, trap Tab/Shift+Tab, close on Escape, and restore prior focus.
- Shared React helpers become focused Vue SFCs. Native attributes and events must fall through correctly, slots replace `ReactNode`, and CSS class names remain unchanged.
- Vue templates use normal interpolation/attribute binding only. `v-html` is prohibited.

### 4.3 Exact frontend file map

| React source                                                                                                | Vue target                                                                                                                           | Disposition                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `v1/src/main.tsx`                                                                                           | `v1/src/main.ts`                                                                                                                     | Replace React root with `createApp(App).mount("#root")`; preserve font/style imports |
| `v1/src/App.tsx`                                                                                            | `v1/src/App.vue`                                                                                                                     | Port root state, effects, manual navigation, conditional rendering                   |
| `v1/src/LandingPage.tsx`                                                                                    | `v1/src/LandingPage.vue`                                                                                                             | Port public home, filters, statistics, cards, footer                                 |
| `v1/src/CatalogPage.tsx`                                                                                    | `v1/src/CatalogPage.vue`                                                                                                             | Port query/filter/sort state and metadata dialog                                     |
| `v1/src/Dashboard.tsx`                                                                                      | `v1/src/Dashboard.vue`                                                                                                               | Port access gate, shell, navigation, notifications, account dialog, toast            |
| `v1/src/GoogleSignInDialog.tsx`                                                                             | `v1/src/GoogleSignInDialog.vue`                                                                                                      | Port GIS loader, button rendering, retries, focus behavior                           |
| `v1/src/RoleWorkspaces.tsx`                                                                                 | `v1/src/RoleWorkspaces.vue`                                                                                                          | Port all ten role workspace states and checklist                                     |
| `v1/src/components.tsx`                                                                                     | `v1/src/components/{Button,EmptyState,Logo,SearchBox,SectionHeading,SimilarityRing,StatusChip}.vue` and `v1/src/components/index.ts` | Split shared components; retain classes and semantics                                |
| `v1/src/useDialogFocus.ts`                                                                                  | `v1/src/composables/useDialogFocus.ts`                                                                                               | Replace React hooks with Vue lifecycle/template ref                                  |
| `v1/src/app.test.tsx`                                                                                       | `v1/src/App.test.ts`                                                                                                                 | Port to Testing Library Vue                                                          |
| `v1/src/components.test.tsx`                                                                                | `v1/src/components.test.ts`                                                                                                          | Port to Testing Library Vue                                                          |
| `v1/src/test/setup.ts`                                                                                      | Same path                                                                                                                            | Replace React cleanup import with Vue cleanup import                                 |
| `v1/src/api.ts`, `api.test.ts`, `access.ts`, `data.ts`, `types.ts`, `google-identity.d.ts`, `vite-env.d.ts` | Same paths                                                                                                                           | Preserve framework-neutral behavior/types; make only required type/lint adjustments  |
| `v1/src/styles.css`                                                                                         | Same path                                                                                                                            | Byte-identical preservation gate                                                     |

All superseded `.tsx` files are deleted. No `.tsx`, JSX compiler option, React import, or React test helper may remain after F6.

### 4.4 Toolchain changes

- Runtime: remove `react`, `react-dom`, and `lucide-react`; add `vue` and `lucide-vue-next`.
- Development: remove `@vitejs/plugin-react`, `@testing-library/react`, React type packages, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh`; add `@vitejs/plugin-vue`, `@testing-library/vue`, `vue-tsc`, and Vue ESLint support (`eslint-plugin-vue` with the TypeScript parser/config already in use).
- `v1/vite.config.ts`: retain the custom document-denial middleware, host/origin policy, filesystem deny defaults, strict port, and `/api` proxy; replace only the React plugin with Vue and extend corpus denial to all excluded corpus paths.
- `v1/tsconfig.app.json`: include `.ts` and `.vue`, retain strict/bundler settings, and remove JSX configuration.
- `v1/package.json`: add a `typecheck` script using `vue-tsc --noEmit`; make `build` run Vue type checking before `vite build`; retain Laravel and legacy server scripts.
- `v1/vitest.config.ts`: retain jsdom and setup file; configure Vue only where needed by Vite/Vitest.
- `v1/eslint.config.js`: lint Vue SFC and TypeScript source, remove React-only rules, and continue ignoring generated output and `backend`.
- Regenerate only `v1/package-lock.json` through npm; do not hand-edit lock entries.

## 5. Frozen API contracts

No API route, request, response, cookie, or authorization behavior may change. `v1/src/api.ts` remains the browser boundary and must continue to send `credentials: "include"` and JSON content type. Non-2xx responses parse `{ error?: string }` and throw that stable code or `REQUEST_FAILED_<status>`; `204` returns no body.

| Frontend operation      | Request                                                    | Required response/behavior                                                                                                             |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Session lookup          | `GET /api/auth/session`                                    | `{ user: UserSession }`; `401 {"error":"AUTHENTICATION_REQUIRED"}` maps to `null`; other failures propagate                            |
| Google login            | `POST /api/auth/google`, body `{ credential: string }`     | `{ user: { email, role, accessStatus, isAdmin } }`; Laravel owns token/audience/email verification and session creation                |
| Logout                  | `POST /api/auth/logout`                                    | `204`; Laravel expires `researchnav.sid`                                                                                               |
| Public repository       | `GET /api/repository?per_page=50`, then `links.next`       | Collect at most 100 pages; normalize absolute next URLs to same-origin pathname/query before fetch; never manufacture fallback records |
| Notifications           | `GET /api/notifications`, then `links.next`                | Collect at most 100 pages of exact `NotificationResource` objects; empty means no fabricated alerts                                    |
| Mark read               | `PATCH /api/notifications/{encodeURIComponent(uuid)}/read` | Exact updated `NotificationResource`                                                                                                   |
| Admin coordinators      | `GET/POST /api/admin/coordinators`                         | Existing `users`/`user` session shapes and role guards remain callable from `api.ts`                                                   |
| Coordinator instructors | `GET/POST /api/coordinator/instructors`                    | Existing `users`/`user` session shapes and role guards remain callable from `api.ts`                                                   |

`UserSession` remains `{ email: string; role: Role; accessStatus: "active" | "invited" | "blocked"; isAdmin: boolean }`. Roles remain `admin`, `researcher`, `adviser`, `instructor`, `panel`, `statistician`, `coordinator`, `librarian`, `research-office`, and `academics`.

Public resource mapping remains exact: sort `authors` by `author_order`; map `author_name`; accept `publication_year` or `year`; map institution, academic unit, degree program, category, abstract, keywords, research stage, manuscript date, and abstract provenance; retain deprecated `institute`/`program` aliases used by current layouts. Do not expose a source filename.

`NotificationResource` remains `{ id, type, event, title, message, action_url, research_document_id, read_at, created_at }`, including nullable fields.

## 6. Frozen UI and accessibility contracts

### Root and navigation

- `#root`, metadata, title, theme color, relative `/api` URLs, and client-only mounting remain unchanged.
- `/` renders the landing page, `/catalog` renders catalog query/filter/sort state from the current URL, and `/app` renders the dashboard only for a non-null session.
- `pushState`, `replaceState`, `popstate`, query encoding, and top scrolling remain behaviorally equivalent. No router-generated markup or route semantics are introduced.
- The initial session state displays `Loading ResearchNAV...` until session lookup resolves.

### Public surfaces

- Preserve public navigation, hero search, year/category/institute filters, repository statistics, recent cards, empty/loading/error states, trust section, privacy copy, and sign-in actions.
- Catalog filtering remains case-insensitive across title/authors/abstract/keywords, removes quote characters, and supports year/category/institute plus relevance/newest/oldest sorting.
- Metadata dialog retains all current fields, keywords, abstract provenance, download sign-in gate, accessible name, Escape/backdrop close, focus trap, and focus restoration.

### Authentication and dashboard

- GIS script remains `https://accounts.google.com/gsi/client`, loaded once with retry cleanup. Initialization options and rendered 320px Continue with Google button remain equivalent.
- Missing client ID, script blocking, verification progress/failure, retry, and close states retain their current messages and semantics.
- Active users can enter; invited and blocked users see their existing distinct access blocker. No frontend role elevation is possible.
- Dashboard retains all role navigation labels, primary workspace selection, mobile tabs, notification unread count/read behavior, account details/logout, public catalog links, and toast timing.
- All ten primary workspaces and intentional prototype/empty states remain present. The statistician checklist starts `[true, true, false, false]` and recalculates completion percentage locally.

### Shared presentation

- Existing CSS class names, font imports, DOM semantics, button types, labels, headings, roles, `aria-*` attributes, skip links, keyboard focus, responsive behavior, reduced motion, and visual content remain equivalent.
- Similarity bands remain Low `0–39`, Moderate `40–69`, Flagged `70–100`, with accessible text and the existing CSS custom properties.
- Lucide replacements must render the same named icon at the same logical location. Decorative icons remain hidden from assistive technology; meaningful controls retain text or accessible names.

## 7. Sanitized source snapshot and confidential-data strategy

### Allowlisted copy rule

F1 creates `v1/**` from regular files in `<external-source-root>/v1/**` only after applying the deny rules. It never copies `<external-source-root>/v0/**`. The copy must never first place a denied file in a Git worktree and then delete it. Preserve `.env.example` files and `.gitignore` placeholders, but exclude:

- `.env` and all non-example `.env.*` files at every depth.
- `node_modules`, `vendor`, Python environments, and all dependency directories.
- `dist`, `build`, `public/build`, `.vite`, coverage output, and other generated build output.
- Laravel runtime files under `storage/**` and generated `bootstrap/cache/**`; only their `.gitignore` placeholders may be copied.
- uploads, private storage, logs, local databases (`*.sqlite`, `*.sqlite3`, `*.db`), temporary files, and other runtime data.
- `.cache`, `.pytest_cache`, `.mypy_cache`, `.ruff_cache`, nested `.phpunit.result.cache` and `.phpunit.cache`, `__pycache__`, `*.pyc`, and all tool caches (including `.eslintcache`, `.stylelintcache`, `.parcel-cache`, `.turbo`, and `.nyc_output`).
- `*.tsbuildinfo`.
- every `*.docx` (case-insensitive), especially `src/research_studies/**`, `algorithm/Research Studies/**`, and `Forms/**`.
- the entire `src/research_studies/**` derived catalog/corpus directory and all of `Forms/**` and `algorithm/Research Studies/**`.

The copied `v1/.gitignore` must explicitly enforce these exclusions relative to the new subtree, including `src/research_studies/`, and must keep example environment files trackable.

### Baseline evidence

Before conversion, F1 must:

1. Enumerate allowed source files as normalized relative path, byte length, and SHA-256; calculate an aggregate digest over the sorted manifest.
2. Produce the same manifest for the copied `v1/**` and require an empty `Compare-Object` result, excluding the intentionally deferred `v1/README.md` and `v1/docs/**` documentation paths.
3. Record only freeze time, aggregate digest, allowed-file count, and denied-file counts by category in the child PR. Do not record confidential filenames or absolute user paths in committed files.
4. Hash source and copied `src/styles.css`, `backend/**` logic/config/tests, `server/**`, and allowed `algorithm/**`; require equality before framework work.
5. Create a second filtered copy in a unique temporary directory outside every Git worktree and run the baseline commands there. This permits installs, builds, caches, and tests without writing to the authoritative source. Save command, exit code, and concise output in the child PR. A baseline failure blocks conversion unless it is reproducible, explicitly classified as pre-existing, and accepted in the parent Plan PR with a no-regression assertion.
6. Record the parent-base repository-root manifest separately from the external-source manifest. The filtered copy may populate only `v1/**`; it must not overwrite, delete, or use any parent-base root file as source input.
7. Capture sanitized public/error/empty and fixture-driven role UI screenshots at desktop (1440x900) and mobile (390x844) outside Git. Do not use real accounts, real repository rows, manuscript data, or email addresses. Repeat after Vue migration and document intentional pixel differences; no screenshot containing confidential/personal data may be uploaded.

Baseline commands:

```powershell
$Baseline = $env:RESEARCHNAV_BASELINE_DIR
if (-not $Baseline -or -not (Test-Path $Baseline)) { throw "Set RESEARCHNAV_BASELINE_DIR to the filtered temporary React baseline copy" }
Push-Location $Baseline
npm ci
composer install --working-dir=backend --no-interaction --prefer-dist
npm test
npm run lint
npm run build
npm run format:check
npm run test:backend
php backend\artisan route:list --path=api
Push-Location algorithm
python -m unittest
Pop-Location
Pop-Location
```

## 8. Ownership and isolated worktrees

No two mutating agents may share a worktree or concurrently own the same path. Testing/review agents are read-only. A Fix Agent temporarily inherits only the failed mutating owner's paths after that owner stops; it is not a parallel owner.

| Lane                  | Owner                                                | Branch                        | Isolated worktree                             | Exclusive writable paths                                  | Starts from                                    |
| --------------------- | ---------------------------------------------------- | ----------------------------- | --------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| Plan                  | Planning Agent                                       | `plan/react-to-vue3`          | `<plan-worktree>`                             | `docs/plans/react-to-vue3.md` only                        | `882f52c6bbbebdd75c61021cdcfdfc0aa937c0e2`     |
| Frontend migration    | Frontend Builder                                     | `feat/react-to-vue3-frontend` | `<frontend-worktree>`                         | `v1/**` except `v1/README.md` and `v1/docs/**`            | Latest `plan/react-to-vue3` after Plan PR gate |
| Documentation         | Documentation Agent                                  | `docs/react-to-vue3`          | `<documentation-worktree>`                    | `v1/README.md`, `v1/docs/migration/react-to-vue3.md` only | Updated plan branch after frontend child merge |
| Child PR verification | PR Tester, Code Reviewer, Security Reviewer          | No mutating branch            | Temporary detached `<child-pr-test-worktree>` | None (read-only)                                          | Exact frontend/docs child head                 |
| Final verification    | Integration Tester, Code Reviewer, Security Reviewer | No mutating branch            | Temporary detached `<final-test-worktree>`    | None (read-only)                                          | Exact combined plan head                       |

The frontend lane owns sanitized copying of preserved backend/server/algorithm files but may not alter their logic. Documentation deliberately does not exist in the frontend ownership set, preventing overlap. Worktrees must be clean and at the stated base before their owner starts.

## 9. Dependency graph

```text
P0 Plan verification/commit + Draft parent Plan PR
 |
 v
F1 Freeze, baseline, sanitize, and integrity-check source
 |
 v
F2 Vue toolchain and application bootstrap
 |
 v
F3 Shared components and dialog composable
 |
 v
F4 Public pages and manual navigation
 |
 v
F5 Authentication, dashboard, notifications, role workspaces
 |
 v
F6 Testing Library Vue port, React removal, full lane self-check
 |
 v
V1 Independent pre-commit test -> G1 controlled commit -> P1 child PR
 |
 v
V2 exact-commit PR test + code/security review -> merge frontend child
 |
 +----------------------+
 v                      |
D1 Documentation        |
 |                      |
 v                      |
 V3 docs pre-commit + exact-PR verification -> merge docs child
                               |
                               v
                          V4 final combined verification
                               |
                               v
                          P2 complete parent checklist / ready for review
```

There is one implementation lane. Verification and documentation are ordered behind it; no backend/database lane is created.

## 10. Ordered executable tasks

### P0 — Establish the parent Plan PR control plane

- **Owner:** PR Coordinator.
- **Dependencies:** this plan passes independent plan verification and is committed by the Git Steward; branch still points from base `882f52c` plus only the plan commit.
- **Actions:** push `plan/react-to-vue3`; open a Draft PR to `main` using Section 15; record plan commit and base; do not merge.
- **Entry gate:** plan diff contains only this file, no secrets, and all ownership/dependency/test sections are complete.
- **Exit gate:** Draft parent PR URL is available, body/checklist matches this plan, and frontend branch/worktree is created from the exact plan head.

### F1 — Freeze, baseline, sanitize, and verify the authoritative source

- **Owner:** Frontend Builder.
- **Dependencies:** P0.
- **Writable paths:** owned `v1/**` paths only; do not create `v1/README.md` or `v1/docs/**`.
- **Actions:** apply Section 7's filtered allowlist copy from external `v1/**` only (never external `v0/**`); update `v1/.gitignore` only to enforce the new nested exclusions; generate non-committed source/destination manifests and the separate parent-base root manifest; execute baseline tests; capture sanitized visual evidence; prove copied preserved files match.
- **Acceptance checks:** no denied file ever enters the worktree; destination manifest equals allowed external-v1 source; confidential filename list is not logged; copied style/backend/server/algorithm hashes match; parent-base paths outside `v1/**` have no diff; baseline evidence exists.
- **Exit gate:** cleanly classified baseline, empty allowed-file comparison, all deny scans pass, and source aggregate digest is recorded in the frontend handoff/PR evidence.

### F2 — Convert package, Vite, TypeScript, lint, test bootstrap, and mount point

- **Owner:** Frontend Builder.
- **Dependencies:** F1.
- **Exact paths:** `v1/package.json`, `v1/package-lock.json`, `v1/index.html`, `v1/vite.config.ts`, `v1/vitest.config.ts`, `v1/tsconfig.json`, `v1/tsconfig.app.json`, `v1/tsconfig.node.json`, `v1/tsconfig.server.json`, `v1/eslint.config.js`, `v1/src/main.ts`, `v1/src/vite-env.d.ts`, deletion of `v1/src/main.tsx`.
- **Actions:** perform Section 4.4 changes; keep backend/legacy scripts; preserve Vite security middleware/proxy; mount Vue at `#root`; retain all font and CSS imports.
- **Acceptance checks:** `npm ci` resolves from the regenerated lock; a minimal Vue root type-checks; Laravel/legacy command names still exist; custom DOCX/corpus deny config remains covered.
- **Exit gate:** `npm --prefix v1 run typecheck`, focused Vite config test, lint, and build pass before page migration continues.

### F3 — Port shared components and dialog focus behavior

- **Owner:** Frontend Builder.
- **Dependencies:** F2.
- **Exact paths:** `v1/src/components/*.vue`, `v1/src/components/index.ts`, `v1/src/composables/useDialogFocus.ts`, `v1/src/types.ts`, deletion of `v1/src/components.tsx` and `v1/src/useDialogFocus.ts`.
- **Actions:** implement typed slots/props/emits/attribute fallthrough; retain class strings and semantics; port focus trap; preserve status and similarity thresholds.
- **Acceptance checks:** shared component tests cover boundary scores 39/40/69/70, status class, SearchBox submit/clear/v-model behavior, and focus trap/Escape/restoration.
- **Exit gate:** focused shared/composable tests, lint, and `vue-tsc` pass.

### F4 — Port root navigation and public pages

- **Owner:** Frontend Builder.
- **Dependencies:** F3.
- **Exact paths:** `v1/src/App.vue`, `v1/src/LandingPage.vue`, `v1/src/CatalogPage.vue`, `v1/src/api.ts`, `v1/src/access.ts`, `v1/src/data.ts`; delete `v1/src/App.tsx`, `v1/src/LandingPage.tsx`, and `v1/src/CatalogPage.tsx` after parity.
- **Actions:** port root async state/lifecycle, manual History API navigation, public home, catalog filtering/sorting, and metadata dialog; preserve framework-neutral API mapping.
- **Acceptance checks:** public API fixture, empty response, failure alert, author sort/resource mapping, query/filter/sort URL updates, metadata fields, and no source filename exposure all pass.
- **Exit gate:** focused public/API tests pass; `/` and `/catalog` satisfy desktop/mobile visual comparison with byte-identical CSS.

### F5 — Port Google auth, dashboard, notifications, and all role workspaces

- **Owner:** Frontend Builder.
- **Dependencies:** F4.
- **Exact paths:** `v1/src/GoogleSignInDialog.vue`, `v1/src/Dashboard.vue`, `v1/src/RoleWorkspaces.vue`, `v1/src/google-identity.d.ts`; delete corresponding `.tsx` files after parity.
- **Actions:** implement GIS lifecycle/retry, typed emits, access states, local dashboard state, notifications, account/logout, mobile navigation, and all role workspaces.
- **Acceptance checks:** missing client ID/error/progress/retry states, active/invited/blocked access, exact notification fields/UUID read route, empty notifications, all role headings, no fabricated records, and checklist update pass.
- **Exit gate:** focused auth/dashboard/role tests, accessibility interaction checks, lint, and `vue-tsc` pass.

### F6 — Port tests, remove React, and complete frontend self-check

- **Owner:** Frontend Builder.
- **Dependencies:** F5.
- **Exact paths:** `v1/src/App.test.ts`, `v1/src/components.test.ts`, `v1/src/api.test.ts`, `v1/src/test/setup.ts`, `v1/vite.config.test.ts`; delete `v1/src/app.test.tsx` and `v1/src/components.test.tsx`.
- **Actions:** port assertions to Testing Library Vue; add focused manual-navigation, dialog, GIS-error, and deny-list tests where current coverage is implicit; in `v1/vite.config.test.ts`, replace any copied real manuscript basename with the exact neutral synthetic denied path `/src/research_studies/denied-manuscript.docx`; remove every React package/import/config artifact; rerun post-migration screenshots and integrity comparisons.
- **Acceptance checks:** all commands in Section 12 pass; `vite.config.test.ts` contains the synthetic denied DOCX path and no external corpus basename; no `.tsx`/React residue; `src/styles.css` hash matches baseline; backend/server/algorithm allowed-file hashes remain unchanged; parent-base paths outside `v1/**` remain unchanged; screenshot comparison has no unexplained visual regressions.
- **Exit gate:** builder returns an unstaged handoff with commands, exit codes, manifest digest, visual comparison summary, and acceptance mapping.

### V1 — Independent pre-commit verification

- **Owner:** Pre-Commit Tester (read-only).
- **Dependencies:** F6.
- **Actions:** inspect all uncommitted files, compare ownership and source manifest, execute Section 12, scan secrets/corpora, and inspect dependency diff.
- **Exit gate:** evidence-backed PASS. On failure, a Fix Agent inherits only frontend-owned paths, then V1 reruns. Nothing is staged before PASS.

### G1/P1 — Controlled commit and frontend child PR

- **Owner:** Git Steward for explicit staging/commit; PR Coordinator for push/PR metadata.
- **Dependencies:** V1 PASS.
- **Actions:** inspect status/diff; stage explicit `v1` files (never `git add .`); re-run tracked-file deny checks against the index; inspect cached diff; commit; push; open child PR to `plan/react-to-vue3` and link P0.
- **Exit gate:** child PR contains only owned paths, exact commit is known, and evidence maps to F1–F6.

### V2 — Exact-commit frontend PR verification and review

- **Owner:** PR Tester, Code Reviewer, and Security Reviewer (read-only, independently reported).
- **Dependencies:** P1.
- **Actions:** test the exact child head in a detached worktree; review Vue lifecycle/reactivity, parity, accessibility, dependency removals, security boundaries, and sanitization.
- **Exit gate:** CI/commands green and no blocking review findings. Corrections repeat Fix Agent -> V1 -> Git Steward -> P1 -> V2. PR Coordinator merges only after PASS.

### D1 — Document Vue setup and migration

- **Owner:** Documentation Agent.
- **Dependencies:** frontend child merged into current plan branch.
- **Exact paths:** `v1/README.md`, `v1/docs/migration/react-to-vue3.md` only.
- **Actions:** write Vue/Vite setup and commands; retain Laravel/MariaDB, Google origin, session, admin, legacy server, and non-destructive migration guidance; document architecture, manual navigation, source freeze digest, excluded data categories, rollback, and verification. Do not copy the React README verbatim and do not disclose confidential filenames.
- **Acceptance checks:** commands match `package.json`; no React description remains except migration history; paths assume execution from `v1`; no secret values or local personal paths appear.
- **Exit gate:** documentation test/review PASS, then normal pre-commit/commit/child PR gates and merge to plan branch.

### V3 — Documentation pre-commit and exact-PR verification

- **Owner:** Documentation Pre-Commit Tester (read-only); Git Steward and PR Coordinator perform their separately authorized commit/PR actions only after the pre-commit PASS.
- **Dependencies:** D1 complete; V2 PASS and the frontend child merged into the current plan branch; documentation child is based on that exact merged plan head.
- **Commands:** from the documentation child head, run `npx prettier --check v1/README.md v1/docs/migration/react-to-vue3.md`, `git diff --check`, and `git diff --name-only <documentation-child-base>...HEAD`; run the Section 12 confidentiality/secret scans scoped to the two documentation paths and review the rendered Markdown links and commands against the merged `v1/package.json`. After the controlled documentation commit and child PR exist, a PR Tester repeats these commands against the exact child head.
- **Gate:** pre-commit PASS requires only the two documentation-owned paths, no personal/absolute paths, corpus filenames, or secrets, and commands that match the merged application. The documentation child may merge only after exact-head V3 PASS plus documentation and security review PASS. A V3 failure returns only the documentation-owned paths to a Fix Agent, then repeats V3.

### V4/P2 — Final combined verification and parent completion

- **Owner:** Integration Tester, Code Reviewer, Security Reviewer; PR Coordinator updates parent PR.
- **Dependencies:** V2 PASS followed by frontend child merge, V3 PASS followed by documentation child merge, and no later changes on the plan branch except those two reviewed child merges.
- **Actions:** run Section 12 on exact combined plan head; inspect final tracked files and parent acceptance checklist; verify no external `v0/**` content was copied and no parent-base repository-root path outside `v1/**` changed; mark parent ready only when all gates pass.
- **Exit gate:** V4 PASS is the sole dependency for P2. P2 requires complete evidence, no unresolved blocking findings, both child PR links/merge commits current, and the parent checklist current; only then may the Draft be marked ready for human review. Merge/release requires separate authorization.

## 11. Acceptance criteria

- [ ] The tracked application exists under `v1/**` and corresponds to one recorded, sanitized authoritative source freeze.
- [ ] No `.env`, credential, dependency tree, build output, runtime data, cache, `*.tsbuildinfo`, DOCX, Forms corpus, research-study corpus, or derived manuscript catalog is tracked.
- [ ] No external `v0/**` file is copied or tracked; external `v0/**` remains reference-only.
- [ ] Parent-base repository-root files outside `v1/**` are unchanged and coexist with the new target.
- [ ] Vue 3 Composition API/TypeScript mounts client-side at `#root`; there is no SSR, router, or Pinia/store dependency.
- [ ] No React runtime, React tooling, React import, JSX/TSX source, `lucide-react`, or Testing Library React dependency remains in `v1`.
- [ ] Icons use `lucide-vue-next`; tests use `@testing-library/vue`; SFC typing is enforced by `vue-tsc`.
- [ ] `/`, `/catalog`, `/app`, query/filter/sort changes, History API behavior, loading/fallback behavior, and scroll behavior match the baseline.
- [ ] Public catalog mapping/pagination, empty/error states, metadata dialog, and sign-in gates match the API/UI contracts.
- [ ] Google sign-in, session lookup/logout, active/invited/blocked access, notifications, dialogs, and all ten role workspaces match the baseline.
- [ ] Keyboard, focus trap/restoration, Escape/backdrop close, accessible names/roles, skip links, responsive layouts, and reduced-motion behavior are preserved.
- [ ] `v1/src/styles.css` is byte-identical to the frozen source, or a separately approved minimal exception is evidenced in the parent PR.
- [ ] Allowed Laravel backend, legacy server, and Python algorithm files are byte-identical to source; their tests pass without migrations or logic changes.
- [ ] Vue frontend tests, type checking, lint, formatting, production build, Vite corpus denial, backend tests, route listing, and algorithm tests pass on the combined plan head.
- [ ] README and migration documentation describe Vue setup, exclusions, architecture, verification, and rollback accurately.
- [ ] Parent Plan PR links each child PR and contains command/exit-code evidence, decisions, risks, and completed checklists.

## 12. Test and security gates

Run commands from repository root unless a command changes location. Every tester reports exact command, exit code, failures/skips, and concise output.

### Frontend gate

```powershell
npm ci --prefix v1
npm --prefix v1 test
npm --prefix v1 run typecheck
npm --prefix v1 run lint
npm --prefix v1 run format:check
npm --prefix v1 run build
```

Required focused tests include `v1/src/App.test.ts`, `v1/src/components.test.ts`, `v1/src/api.test.ts`, and `v1/vite.config.test.ts`.

### Preserved logic regression gate

```powershell
composer install --working-dir=v1/backend --no-interaction --prefer-dist
npm --prefix v1 run test:backend
php v1/backend/artisan route:list --path=api
Push-Location v1/algorithm
python -m unittest
Pop-Location
```

No database-destructive command is allowed. In particular, do not run `migrate:fresh`, import the confidential corpus, or point tests at a database containing data that must be preserved.

### React and generated-artifact absence gate

```powershell
if (Get-ChildItem v1/src -Recurse -File -Include *.tsx,*.jsx) { throw "JSX/TSX remains" }
if (rg -n 'lucide-react|@testing-library/react|@vitejs/plugin-react|react-dom|from ["'']react["'']|React\.' v1/src v1/package.json v1/vite.config.ts v1/eslint.config.js) { throw "React residue remains" }
npm --prefix v1 ls react react-dom lucide-react @testing-library/react @vitejs/plugin-react --all
```

The final `npm ls` is expected to return no listed package; its conventional nonzero “missing” result must be interpreted with its output and followed by inspection of `package-lock.json`.

### Confidentiality and secret gate

```powershell
$pathDeny = '(?i)(^|/)(node_modules|vendor|\.venv|venv|env|\.tox|site-packages|dist|build|\.vite|coverage|\.nyc_output|\.cache|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.parcel-cache|\.turbo|__pycache__|\.phpunit\.cache|uploads|logs|private|tmp|temp|Forms|src/research_studies|algorithm/Research Studies)(/|$)|(^|/)public/build(/|$)|(^|/)storage(/|$)|(^|/)bootstrap/cache(/|$)|(^|/)\.phpunit\.result\.cache$|\.docx$|\.tsbuildinfo$|\.(sqlite3?|db|log|pyc|tmp|temp)$'
$envDeny = '(?i)(^|/)\.env($|\.)'
$envExample = '(?i)(^|/)\.env(\.[^/]+)?\.example$'
$runtimePlaceholder = '(?i)^(storage|bootstrap/cache)(?:/.+)?/\.gitignore$'

$filesystemForbidden = Get-ChildItem v1 -Recurse -Force -File | ForEach-Object {
  $relative = $_.FullName.Substring((Resolve-Path v1).Path.Length).TrimStart('\', '/').Replace('\', '/')
  if ((($relative -match $pathDeny) -and $relative -notmatch $runtimePlaceholder) -or (($relative -match $envDeny) -and $relative -notmatch $envExample)) { $_.FullName }
}
if ($filesystemForbidden) { $filesystemForbidden; throw "Forbidden filesystem files present" }

$trackedForbidden = git ls-files -- v1 | Where-Object {
  $relative = $_.Substring(3)
  ((($relative -match $pathDeny) -and $relative -notmatch $runtimePlaceholder) -or (($relative -match $envDeny) -and $relative -notmatch $envExample))
}
if ($trackedForbidden) { $trackedForbidden; throw "Forbidden tracked paths present" }

$externalSource = $env:RESEARCHNAV_EXTERNAL_SOURCE
if (-not $externalSource -or -not (Test-Path $externalSource)) { throw "Set RESEARCHNAV_EXTERNAL_SOURCE to the external source root" }
$corpusNames = Get-ChildItem $externalSource -Recurse -Force -File -Filter *.docx | ForEach-Object Name | Sort-Object -Unique
$viteConfigTest = Get-Content -Raw v1/vite.config.test.ts
if ($viteConfigTest -notmatch [regex]::Escape('/src/research_studies/denied-manuscript.docx')) { throw "Missing neutral denied DOCX fixture" }
$corpusLeakCount = @($corpusNames | Where-Object { $viteConfigTest.Contains($_) }).Count
if ($corpusLeakCount) { throw "A corpus basename appears in vite.config.test.ts" }

git diff --check
git status --short
```

The filesystem and tracked-path scans deliberately cover dependency directories; build output; Laravel runtime and cache output; uploads, private storage, logs, databases, and temporary runtime data; every named Python/Node/PHP cache including nested `.phpunit.result.cache`; TypeScript metadata; corpus paths; DOCX; and non-example environment files. They may report paths internally to the verifier, but PR evidence records only category/count and never a confidential filename.

Run the repository-approved secret scanner. If none is configured, Security Reviewer must run `gitleaks detect --no-git --source v1 --redact` when available plus a redacted high-risk pattern scan; scanner absence is a reported limitation, not silent success. Never paste discovered values into PRs or logs.

### Integrity and security review controls

- Compare frozen and final SHA-256 manifests for `v1/src/styles.css`, `v1/backend/**`, `v1/server/**`, and allowed `v1/algorithm/**`; only the destination prefix may differ.
- Inspect `package-lock.json` for expected Vue additions/React removals and run `npm audit --prefix v1 --omit=dev`. Findings are triaged; unrelated legacy server dependency findings are documented rather than fixed by broad unplanned upgrades.
- Confirm API requests retain relative paths, JSON handling, URL encoding, pagination cap, and `credentials: "include"`.
- Confirm no `v-html`, dynamic script URL, token logging/storage, localStorage/sessionStorage auth, or client-side role override was introduced.
- Confirm Vite retains default secret/certificate/git deny patterns and actively denies source, algorithm, and Forms corpus paths including encoded or `/@fs/` attempts.
- Confirm all state-changing Laravel requests continue to rely on existing exact-origin middleware and server authorization. The Vue client is not an authorization boundary.

## 13. Risks and controls

| Risk                                                            | Impact                                                     | Control/trigger                                                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Untracked source changes during migration                       | Mixed or unreproducible version                            | F1 freeze digest; rerun baseline and restart copy if source digest changes                                                             |
| Confidential corpus or credentials enter Git                    | Severe privacy/security incident                           | Filter-before-copy, nested `.gitignore`, tracked/index scans, secret scan, no confidential filenames in evidence; block PR immediately |
| Vue lifecycle differs from React effects                        | Duplicate requests, stale updates, leaked listeners/timers | Explicit mount/unmount guards; request count and teardown tests; code review                                                           |
| Manual navigation loses query or back behavior                  | User-visible regression                                    | Keep History API contract; tests for push/replace/popstate and encoded queries                                                         |
| Template event/default differences                              | Accidental form submission or missed event                 | Explicit button types, emits, prevent/stop modifiers, interaction tests                                                                |
| Dialog focus regression                                         | Accessibility failure                                      | Port composable first; focused Tab/Shift+Tab/Escape/restoration tests                                                                  |
| CSS/DOM drift changes layout                                    | Visual regression                                          | Byte-identical CSS gate, class/semantic contract, sanitized before/after desktop/mobile evidence                                       |
| GIS callback/script lifecycle regression                        | Sign-in unavailable or repeated initialization             | Single cached loader, retry reset, unmount guard, mocked GIS tests, manual configured-origin smoke test                                |
| Backend appears broken because runtime prerequisites are absent | False migration diagnosis                                  | Separate frontend and preserved-logic gates; report PHP/DB environment limits exactly; do not edit backend to mask setup issues        |
| Dependency migration introduces vulnerabilities                 | Supply-chain risk                                          | Lockfile review, npm audit triage, no unrelated major upgrades, Security Reviewer gate                                                 |
| Large all-at-once frontend diff is hard to review               | Defects hidden in translation                              | Ordered internal task gates F2–F6, exact source-to-target map, focused tests, one coherent owner, no concurrent edits                  |
| Documentation leaks local/confidential details                  | Privacy/reproducibility issue                              | Docs use relative paths and aggregate digest/counts only; docs security review                                                         |

Retry budget is three correction cycles per root pre-commit, PR, or final-integration failure. On exhaustion, leave work unstaged/unmerged and escalate with exact reproduction evidence.

## 14. Rollback

This migration has no database or API migration and therefore requires no data rollback.

1. Before parent merge, close or keep the Draft parent PR; `main`, all parent-base repository-root files, and the external authoritative source remain unchanged. External `v0/**` remains reference-only and is never copied.
2. Before a frontend child merge, discard only the isolated frontend branch/worktree after preserving failure evidence; never delete the authoritative source.
3. After a child merge into the plan branch, create a new revert commit for the child change range. Use `git revert -m 1 <merge-commit>` only when it was a merge commit; for squash or fast-forward merges, revert the known child squashed commit or the recorded first-parent range. Do not rewrite history or force-push.
4. After an authorized parent merge, create a new PR that reverts the known parent change range. Use `git revert -m 1 <merge-commit>` only for a merge commit; for squash or fast-forward merges, revert the recorded squashed commit or first-parent range. Do not attempt a mixed React/Vue runtime or restore dependencies manually in production.
5. The unchanged `v1/server/**` remains available only through the documented legacy commands; do not switch databases or run legacy migrations as an automatic frontend rollback.
6. Re-run confidentiality scans after any rollback/revert to ensure denied files were not reintroduced.

Rollback is complete when the affected branch returns to the last verified commit, denied-file scans pass, and the relevant pre-existing frontend/backend checks are green.

## 15. Draft parent Plan PR body

**Title:** `plan: migrate ResearchNAV frontend from React to Vue 3`

```markdown
## Goal

Migrate the authoritative ResearchNAV frontend from React 19 to Vue 3 Composition API/TypeScript under a sanitized tracked `v1/**` subtree while preserving behavior, accessibility, styles, Laravel/API contracts, legacy server logic, and the Python similarity algorithm.

Plan: `docs/plans/react-to-vue3.md`
Base snapshot: `882f52c6bbbebdd75c61021cdcfdfc0aa937c0e2`

## Users

- Public visitors searching and filtering repository metadata.
- Researchers and institutional users entering role-specific workspaces through Google sign-in.
- Administrators/coordinators using the existing provisioning API contract.
- Developers maintaining the Vue frontend and unchanged Laravel/legacy/algorithm layers.

## Scope

- Sanitized snapshot from external `<external-source-root>/v1/**` into `v1/**`; external `v0/**` is reference-only and never copied.
- Vue 3 SFC/Composition API migration with TypeScript.
- Manual History API navigation; no SSR, router, or Pinia.
- `lucide-vue-next`, Testing Library Vue, and `vue-tsc`.
- Frontend parity tests plus unchanged backend/server/algorithm regression gates.
- Vue setup, migration, exclusion, and rollback documentation.

## Non-goals

- No feature/redesign/copy/API/schema/database work.
- No Laravel, server, or algorithm logic changes.
- No copy or edit of external-reference-only `v0/**`; no change to parent-base root files outside `v1/**`.
- No credentials, runtime data, generated output, or manuscript/form DOCX corpora.
- No deployment or release in this PR.

## Architecture

Vue mounts client-side at `#root`. `App.vue` retains root session/repository/path state and manual History API navigation for `/`, `/catalog`, and `/app`. Typed props/emits and local refs replace React state/props; no global store is added. Relative `/api` requests continue through Vite to unchanged Laravel with credentialed database sessions. The legacy Express server and Python algorithm remain unchanged rollback/reference utilities.

## Acceptance criteria

- [ ] One sanitized source freeze is recorded by aggregate allowlisted manifest digest.
- [ ] No forbidden/confidential/generated/runtime files are tracked.
- [ ] No external `v0/**` content is copied; parent-base root files outside `v1/**`, backend/server/algorithm logic, and `src/styles.css` pass integrity checks.
- [ ] Vue 3 Composition API/TypeScript replaces all React/TSX code and dependencies.
- [ ] No SSR, router, Pinia, or other store is introduced.
- [ ] Manual navigation, catalog, auth/access, dialogs, notifications, and ten role workspaces retain parity.
- [ ] API request/response/session/security contracts remain unchanged.
- [ ] Accessibility, responsive behavior, fonts, icons, classes, and visual styling retain parity.
- [ ] Frontend, type, lint, format, build, Vite denial, backend, route, and algorithm gates pass.
- [ ] Vue setup/migration/rollback documentation is complete.

## Workstreams

| Workstream                              | Owner                             | Status                        | Branch                        | Pull request |
| --------------------------------------- | --------------------------------- | ----------------------------- | ----------------------------- | ------------ |
| Frontend migration + sanitized snapshot | Frontend Builder                  | [ ] Pending                   | `feat/react-to-vue3-frontend` |              |
| Independent frontend verification       | Pre-Commit/PR Testers + reviewers | [ ] Pending                   | read-only exact child head    |              |
| Documentation                           | Documentation Agent               | [ ] Blocked by frontend merge | `docs/react-to-vue3`          |              |
| Final combined verification             | Integration Tester + reviewers    | [ ] Blocked by child merges   | read-only exact plan head     |              |

## Verification

- [ ] Sanitized source/destination manifests match and deny scans pass.
- [ ] `npm --prefix v1 test`
- [ ] `npm --prefix v1 run typecheck`
- [ ] `npm --prefix v1 run lint`
- [ ] `npm --prefix v1 run format:check`
- [ ] `npm --prefix v1 run build`
- [ ] `npm --prefix v1 run test:backend`
- [ ] `php v1/backend/artisan route:list --path=api`
- [ ] `python -m unittest` from `v1/algorithm`
- [ ] React/TSX/package absence scan
- [ ] Secret/confidential/runtime/generated-file scan
- [ ] CSS/backend/server/algorithm integrity comparison
- [ ] Desktop/mobile public and fixture-driven UI parity evidence
- [ ] Code review
- [ ] Security review
- [ ] Documentation review

## Decisions

- Use Vue 3 SFCs with `<script setup lang="ts">` and Composition API.
- Preserve manual History API navigation and local/root state; do not add router or Pinia.
- Split shared TSX helpers into focused Vue components while preserving classes/semantics.
- Keep one frontend implementation lane; backend/database lanes are unnecessary because those contracts are frozen.
- Exclude derived `src/research_studies/catalog.json` with the confidential source corpus.

## Risks and assumptions

- The source is untracked; a freeze digest and integrity manifests are mandatory.
- Sanitization must occur before files enter a worktree, not as cleanup afterward.
- Lifecycle, focus, History API, and GIS differences require focused parity tests.
- A baseline failure blocks migration unless explicitly classified and accepted as pre-existing.
- Parent remains Draft until all child PRs, full verification, reviews, and documentation pass.

## Child PR checklist

- [ ] Frontend child linked and merged
- [ ] Frontend test/review/security evidence linked
- [ ] Documentation child linked and merged
- [ ] Final combined evidence linked
- [ ] Residual risks/limitations recorded
- [ ] Parent acceptance checklist complete
```

## 16. Workstream execution checklist

### Plan control plane

- [ ] Independent tester verifies this plan-only diff.
- [ ] Git Steward stages only `docs/plans/react-to-vue3.md` and commits it.
- [ ] PR Coordinator opens Draft parent PR and records URL.
- [ ] Frontend worktree is clean, isolated, and based on exact plan head.

### Frontend migration lane

- [ ] F1 source freeze digest and baseline evidence recorded.
- [ ] F1 filtered copy and source/destination manifest comparison pass.
- [ ] F1 confidentiality, secret, and generated/runtime deny checks pass.
- [ ] F2 Vue toolchain/bootstrap gate passes.
- [ ] F3 shared components/focus gate passes.
- [ ] F4 root/public/catalog/API gate passes.
- [ ] F5 GIS/dashboard/notifications/roles gate passes.
- [ ] F6 Testing Library Vue port and React removal gate passes.
- [ ] CSS/backend/server/algorithm integrity hashes pass.
- [ ] Desktop/mobile parity evidence reviewed.
- [ ] Pre-Commit Tester returns PASS before staging.
- [ ] Git Steward explicitly stages only frontend-owned `v1` paths.
- [ ] Frontend child PR is linked to parent.
- [ ] Exact-commit PR tests, code review, and security review pass.
- [ ] Frontend child PR merges into plan branch.

### Documentation lane

- [ ] Docs worktree starts from plan head containing frontend merge.
- [ ] `v1/README.md` reflects Vue and retained Laravel/legacy setup.
- [ ] `v1/docs/migration/react-to-vue3.md` records architecture, exclusions, digest, verification, and rollback.
- [ ] Documentation contains no confidential filenames, personal paths, or secrets.
- [ ] Docs pre-commit/PR review passes and child PR merges.

### Final gate

- [ ] Combined plan head passes all Section 12 commands.
- [ ] Combined tracked-file, secret, corpus, React, and integrity scans pass.
- [ ] Final code and security reviews have no blocking findings.
- [ ] Parent PR links child PRs and exact verification evidence.
- [ ] Acceptance criteria and residual-risk records are complete.
- [ ] PR Coordinator marks parent ready for human review; no merge/release without authorization.

## 17. Entry and exit gates summary

### Implementation entry gate

- Plan-only PR is Draft and accessible.
- Plan branch/worktree/base are verified.
- Frontend worktree is isolated and clean.
- Source remains read-only and F1 sanitization rules are understood.
- Ownership table has no concurrent writable overlap.

### Implementation exit gate

- Frontend and docs child PRs are merged into the plan branch through tested commits.
- All acceptance criteria and full verification/security/integrity gates pass on exact combined head.
- No denied/confidential file or out-of-scope change is present.
- Parent PR checklist, decisions, evidence, links, and residual risks are current.
- Parent is ready for human review, not automatically merged or released.
