# React-to-Vue 3 Migration Plan

## Plan metadata

| Item                          | Value                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Status                        | Proposed implementation plan; implementation has not started                  |
| Parent branch                 | `plan/react-to-vue3`                                                          |
| Parent worktree               | `<plan-worktree>`                                                             |
| Parent base                   | `882f52c6bbbebdd75c61021cdcfdfc0aa937c0e2`                                    |
| Parent PR target              | `main`                                                                        |
| Parent Plan PR                | [#5](https://github.com/MilliXPlorer/researchnav/pull/5)                      |
| Authoritative source snapshot | Dirty external source at `<external-source-root>/v1` at execution-time freeze |
| Destination                   | Tracked, sanitized `v1/**` subtree; absent from the parent base               |
| External reference only       | `<external-source-root>/v0/**`; never copied                                  |
| Target frontend               | Vue 3, Composition API, TypeScript, Vite                                      |

This document is the execution control plane. The dirty external source app is authoritative for behavior and content, but it is not safe to copy wholesale. The parent base has neither `v0/**` nor `v1/**`; its repository-root baseline files coexist with, and remain unchanged beside, the new tracked `v1/**` target except for this plan and the two approved contract documents. All implementation work must use the contract, sanitization, and baseline gates below.

## 1. Objective

Replace the authoritative ResearchNAV React 19 frontend with an equivalent Vue 3 Composition API/TypeScript frontend while preserving its observable UI, accessibility behavior, styles, Laravel API contracts, authentication/session behavior, legacy server rollback implementation, and similarity algorithm. Deliver the migrated application as a sanitized `v1/**` subtree without committing credentials, dependencies, generated output, runtime data, caches, TypeScript build metadata, or confidential manuscript/form corpora.

Success means a developer can install and run the Vue application from `v1`, all migrated frontend tests use Testing Library Vue, `vue-tsc` validates the SFCs, no React runtime or tooling remains in `v1`, and the untouched backend/server/algorithm regression suites remain green.

## 2. Scope

### In scope

- Freeze, inventory, test, and copy a sanitized snapshot of `<external-source-root>/v1` into tracked `v1/**`.
- Materialize and merge the approved Vue UI parity contract at `docs/design/vue-ui-parity.md` and API/data boundary contract at `docs/contracts/vue-api-data.md` through separate, tested child PRs before any frontend lane work begins.
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
- No edit, deletion, move, or replacement of parent-base repository-root files except this plan and the two explicitly approved pre-implementation contract documents: `docs/design/vue-ui-parity.md` and `docs/contracts/vue-api-data.md`. All other root-baseline paths coexist with the new `v1/**` target and require a separately approved plan amendment before any change.
- No confidential DOCX, derived manuscript catalog, local database, upload, log, or user runtime data in Git or PR artifacts.

## 3. Assumptions and constraints

1. `<external-source-root>/v1` is authoritative even though it is dirty and outside the parent base. It must be treated as read-only during migration and frozen by an allowlisted manifest at task F1. `<external-source-root>` is an execution-time placeholder, not a committed machine path.
2. The source may change before execution. F1 must record UTC freeze time and an aggregate allowlisted manifest digest. A later source change invalidates the baseline and requires rerunning F1; implementers must not silently mix snapshots.
3. The source `src/research_studies/catalog.json` is derived from confidential manuscripts and is treated as corpus/runtime data. It is excluded with the source DOCX files even though it is JSON.
4. `<external-source-root>/v0/**` is external-reference-only, is never copied, and is not a source for resolving ambiguities. Resolve ambiguities from the F1-frozen `<external-source-root>/v1/**` snapshot and this plan. Neither external `v0/**` nor external `v1/**` exists in the parent base.
5. The parent-base repository-root files are the compatibility baseline, not migration input. F1 must record their tracked path/hash manifest before copying, and F6/V4 must require an empty diff for every parent-base path outside `v1/**`, excluding only `docs/plans/react-to-vue3.md`, `docs/design/vue-ui-parity.md`, and `docs/contracts/vue-api-data.md`. This narrow exception authorizes only the plan and approved contracts; all other root files remain unchanged.
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
- The merged `docs/design/vue-ui-parity.md` and `docs/contracts/vue-api-data.md` are implementation entry contracts. If either conflicts with this plan or the F1-frozen source, frontend work stops for a Plan PR amendment; implementers may not silently choose one source.

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
| `v1/src/api.ts`, `api.test.ts`, `access.ts`, `data.ts`, `types.ts`, `google-identity.d.ts`, `vite-env.d.ts` | Same paths                                                                                                                           | Normalize/test mark-read at the API boundary; otherwise preserve behavior/types      |
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

No API route, request, response, cookie, or authorization behavior may change. `v1/src/api.ts` remains the browser boundary and must continue to send `credentials: "include"` and JSON content type. Non-2xx responses parse `{ error?: string }` and throw that stable code or `REQUEST_FAILED_<status>`; `204` returns no body. The one approved parity defect correction is frontend-only boundary normalization for the discovered Laravel notification-read response envelope; it does not authorize a Laravel or route change.

| Frontend operation      | Request                                                    | Required response/behavior                                                                                                             |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Session lookup          | `GET /api/auth/session`                                    | `{ user: UserSession }`; `401 {"error":"AUTHENTICATION_REQUIRED"}` maps to `null`; other failures propagate                            |
| Google login            | `POST /api/auth/google`, body `{ credential: string }`     | `{ user: { email, role, accessStatus, isAdmin } }`; Laravel owns token/audience/email verification and session creation                |
| Logout                  | `POST /api/auth/logout`                                    | `204`; Laravel expires `researchnav.sid`                                                                                               |
| Public repository       | `GET /api/repository?per_page=50`, then `links.next`       | Collect at most 100 pages; normalize absolute next URLs to same-origin pathname/query before fetch; never manufacture fallback records |
| Notifications           | `GET /api/notifications`, then `links.next`                | Collect at most 100 pages of exact `NotificationResource` objects; empty means no fabricated alerts                                    |
| Mark read               | `PATCH /api/notifications/{encodeURIComponent(uuid)}/read` | Laravel wire response is `{ data: notification }`; `api.ts` returns the nested exact `NotificationResource`                            |
| Admin coordinators      | `GET/POST /api/admin/coordinators`                         | Existing `users`/`user` session shapes and role guards remain callable from `api.ts`                                                   |
| Coordinator instructors | `GET/POST /api/coordinator/instructors`                    | Existing `users`/`user` session shapes and role guards remain callable from `api.ts`                                                   |

`UserSession` remains `{ email: string; role: Role; accessStatus: "active" | "invited" | "blocked"; isAdmin: boolean }`. Roles remain `admin`, `researcher`, `adviser`, `instructor`, `panel`, `statistician`, `coordinator`, `librarian`, `research-office`, and `academics`.

Public resource mapping remains exact: sort `authors` by `author_order`; map `author_name`; accept `publication_year` or `year`; map institution, academic unit, degree program, category, abstract, keywords, research stage, manuscript date, and abstract provenance; retain deprecated `institute`/`program` aliases used by current layouts. Do not expose a source filename.

`NotificationResource` remains `{ id, type, event, title, message, action_url, research_document_id, read_at, created_at }`, including nullable fields.

`docs/contracts/vue-api-data.md` must distinguish the Laravel wire envelope from the normalized frontend return type. `v1/src/api.test.ts` must assert that mark-read sends the encoded UUID route with existing request options, receives `{ data: notification }`, and resolves to `notification` without fabricating, dropping, or renaming fields. This narrowly approved `api.ts` correction is required parity work, not API expansion.

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
6. Record the parent-base repository-root manifest separately from the external-source manifest. The filtered copy may populate only `v1/**`; it must not overwrite, delete, or use any parent-base root file as source input. Root-baseline comparison may exclude only the plan and the two merged contract documents named in Assumption 5.
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

| Lane                  | Owner                         | Branch                        | Isolated worktree                             | Exclusive writable paths                                  | Starts from                                      |
| --------------------- | ----------------------------- | ----------------------------- | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Plan                  | Planning Agent                | `plan/react-to-vue3`          | `<plan-worktree>`                             | `docs/plans/react-to-vue3.md` only                        | `882f52c6bbbebdd75c61021cdcfdfc0aa937c0e2`       |
| Vue UI contract       | Vue UI Contract Author        | `design/vue-ui-contract`      | `<vue-ui-contract-worktree>`                  | `docs/design/vue-ui-parity.md` only                       | Exact verified Plan PR head                      |
| Vue API/data contract | Vue API Contract Author       | `design/vue-api-contract`     | `<vue-api-contract-worktree>`                 | `docs/contracts/vue-api-data.md` only                     | Exact verified Plan PR head                      |
| Frontend migration    | Frontend Builder              | `feat/react-to-vue3-frontend` | `<frontend-worktree>`                         | `v1/**` except `v1/README.md` and `v1/docs/**`            | Exact plan head after both contract child merges |
| Documentation         | Documentation Agent           | `docs/react-to-vue3`          | `<documentation-worktree>`                    | `v1/README.md`, `v1/docs/migration/react-to-vue3.md` only | Updated plan branch after frontend child merge   |
| Child PR verification | Child PR Verification Lead    | No mutating branch            | Temporary detached `<child-pr-test-worktree>` | None (read-only)                                          | Exact contract/frontend/docs child head          |
| Final verification    | Integration Verification Lead | No mutating branch            | Temporary detached `<final-test-worktree>`    | None (read-only)                                          | Exact combined plan head                         |

Each executable task below has exactly one accountable owner. Required independent code, security, accessibility, or documentation findings are gate inputs to that owner and do not create shared write ownership. The two contract lanes may run in parallel because their paths do not overlap; they may inspect the read-only authoritative source but may not write under `v1/**`. The frontend lane owns sanitized copying of preserved backend/server/algorithm files but may not alter their logic. Contract and documentation paths deliberately do not exist in the frontend ownership set. Every worktree must be clean and at the stated base before its owner starts.

## 9. Dependency graph

```text
P0 Verify updated Draft parent Plan PR #5 control plane
 |\
 | +-> U1 author UI parity contract -> U2 pre-commit test -> U3 commit
 |       -> U4 child PR -> U5 exact-head test/reviews -> U6 merge
 |
 +----> A1 author API/data contract -> A2 pre-commit test -> A3 commit
         -> A4 child PR -> A5 exact-head test/reviews -> A6 merge
                         \                         /
                          +---- C0 contract merge gate ----+
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
F4 Public pages, API boundary normalization, and manual navigation
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
V2 exact-commit PR test + required reviews -> M1 merge frontend child
 |
 v
D1 docs -> D2 pre-commit test -> D3 commit -> D4 child PR
  -> D5 exact-head test/reviews -> D6 merge docs child
 |
 v
V4 final combined verification -> P2 complete parent checklist / ready for review
```

The two documentation-only contract lanes are mandatory pre-implementation lanes and may proceed in parallel. C0 blocks F1 and every subsequent frontend task until both exact-head-tested contract child PRs are merged into `plan/react-to-vue3`. After C0 there is one product implementation lane. No backend/database implementation lane is created.

## 10. Ordered executable tasks

### P0 — Verify the parent Plan PR control plane

- **Owner:** PR Coordinator.
- **Dependencies:** this plan passes independent plan verification and is committed by the Git Steward; branch still points from base `882f52c` plus only the plan commit.
- **Actions:** update and verify existing Draft Plan PR [#5](https://github.com/MilliXPlorer/researchnav/pull/5) against Section 15; record the updated plan commit and base; do not merge.
- **Entry gate:** plan diff contains only this file, no secrets, and all ownership/dependency/test sections are complete.
- **Exit gate:** Plan PR #5 remains Draft, its body/checklist matches this plan, and both clean contract worktrees are created from the exact verified plan head. The frontend branch/worktree does not start yet.

### U1 — Author the Vue UI parity contract

- **Owner:** Vue UI Contract Author.
- **Dependencies:** P0.
- **Exact path:** `docs/design/vue-ui-parity.md` only, on `design/vue-ui-contract` in `<vue-ui-contract-worktree>`.
- **Actions:** materialize the approved UI contract as a source-to-target surface matrix covering `/`, `/catalog`, `/app`, all ten role workspaces, manual History API behavior, loading/empty/error/access states, dialogs/focus, responsive desktop/mobile behavior, reduced motion, class/semantic/style preservation, Lucide substitutions, and sanitized visual evidence. Use only synthetic public fixtures; include no screenshots, real identities, corpus filenames, or machine paths.
- **Acceptance checks:** every Section 6 contract has an observable assertion or named evidence method; intentional prototype/empty states are explicit; CSS byte-integrity and the exception process remain explicit; the document introduces no redesign, router/store, API, backend, or data requirement.
- **Exit gate:** only the owned file is modified, Markdown is formatted, links/headings are coherent, and the author returns an unstaged handoff to U2.

### U2 — Verify the UI contract before commit

- **Owner:** UI Contract Pre-Commit Tester (read-only).
- **Dependencies:** U1.
- **Actions:** inspect the complete unstaged file and run the UI contract commands in Section 12; map its matrix to Section 6; perform privacy/path and accessibility-contract review.
- **Exit gate:** evidence-backed PASS with no missing UI surface, unverifiable requirement, secret/personal path, or confidential fixture. Failure returns only `docs/design/vue-ui-parity.md` to the stopped U1 owner or a designated fix owner, then U2 reruns. Nothing is staged before PASS.

### U3 — Commit the verified UI contract

- **Owner:** UI Contract Git Steward.
- **Dependencies:** U2 PASS.
- **Actions:** inspect status/diff; stage only `docs/design/vue-ui-parity.md` by exact path; run `git diff --cached --check` and inspect the cached name/diff; create one focused commit without amending unrelated history.
- **Exit gate:** the known commit contains exactly the UI contract path and the worktree is clean.

### U4 — Open the UI contract child PR

- **Owner:** UI Contract PR Coordinator.
- **Dependencies:** U3.
- **Actions:** push `design/vue-ui-contract`; open a child PR targeting `plan/react-to-vue3`; link Plan PR #5 and include U2 command/evidence mapping.
- **Exit gate:** child PR is open, target/base and exact head commit are recorded, and changed files contain only `docs/design/vue-ui-parity.md`.

### U5 — Verify the exact UI contract child head

- **Owner:** UI Contract PR Tester (read-only).
- **Dependencies:** U4.
- **Actions:** check out the exact child head in a detached worktree; repeat Section 12 UI contract commands and collect required accessibility, documentation, and security review findings.
- **Exit gate:** exact-head tests and all required reviews PASS with no blocking finding. Any correction repeats U1/U2/U3/U4/U5 on the new exact head.

### U6 — Merge the UI contract child PR

- **Owner:** UI Contract Merge Coordinator.
- **Dependencies:** U5 PASS and the child remains mergeable into the current plan branch without an untested head change.
- **Actions:** merge the tested child PR into `plan/react-to-vue3` using the repository-approved strategy; record child URL, tested head, and resulting merge/squash commit in Plan PR #5.
- **Exit gate:** `docs/design/vue-ui-parity.md` is present on the plan branch at the recorded commit. If updating the child head was required, U5 must rerun before merge.

### A1 — Author the Vue API/data boundary contract

- **Owner:** Vue API Contract Author.
- **Dependencies:** P0.
- **Exact path:** `docs/contracts/vue-api-data.md` only, on `design/vue-api-contract` in `<vue-api-contract-worktree>`.
- **Actions:** materialize Section 5 as a route/request/raw-wire/normalized-return matrix covering credentials, JSON/error/204 handling, session and access shapes, public and notification pagination caps/URL normalization, public resource mapping, admin/coordinator operations, nullable notification fields, and UUID encoding. Explicitly record the discovered Laravel mark-read envelope `{ data: notification }` and the approved `api.ts` boundary unwrapping plus `api.test.ts` assertion; do not prescribe a backend change.
- **Acceptance checks:** wire and frontend-normalized shapes are unambiguous; `NotificationResource` fields remain exact; the parity correction is narrowly scoped to unwrapping `data`; no route, cookie, authorization, schema, fabricated data, or backend behavior changes.
- **Exit gate:** only the owned file is modified, Markdown is formatted, examples are synthetic, and the author returns an unstaged handoff to A2.

### A2 — Verify the API/data contract before commit

- **Owner:** API Contract Pre-Commit Tester (read-only).
- **Dependencies:** A1.
- **Actions:** inspect the complete unstaged file; run the API contract commands in Section 12; compare the contract to Section 5 and the read-only authoritative Laravel notification controller/resource evidence without copying source or disclosing local/confidential paths.
- **Exit gate:** evidence-backed PASS confirms `{ data: notification }` on the wire, normalized `NotificationResource` at the frontend boundary, all frozen API/security behavior, and clean privacy/path scans. Failure returns only `docs/contracts/vue-api-data.md` to the stopped A1 owner or a designated fix owner, then A2 reruns. Nothing is staged before PASS.

### A3 — Commit the verified API/data contract

- **Owner:** API Contract Git Steward.
- **Dependencies:** A2 PASS.
- **Actions:** inspect status/diff; stage only `docs/contracts/vue-api-data.md` by exact path; run `git diff --cached --check` and inspect the cached name/diff; create one focused commit without amending unrelated history.
- **Exit gate:** the known commit contains exactly the API/data contract path and the worktree is clean.

### A4 — Open the API/data contract child PR

- **Owner:** API Contract PR Coordinator.
- **Dependencies:** A3.
- **Actions:** push `design/vue-api-contract`; open a child PR targeting `plan/react-to-vue3`; link Plan PR #5 and include A2 command/evidence mapping.
- **Exit gate:** child PR is open, target/base and exact head commit are recorded, and changed files contain only `docs/contracts/vue-api-data.md`.

### A5 — Verify the exact API/data contract child head

- **Owner:** API Contract PR Tester (read-only).
- **Dependencies:** A4.
- **Actions:** check out the exact child head in a detached worktree; repeat Section 12 API contract commands and collect required API, documentation, and security review findings.
- **Exit gate:** exact-head tests and all required reviews PASS with no blocking finding. Any correction repeats A1/A2/A3/A4/A5 on the new exact head.

### A6 — Merge the API/data contract child PR

- **Owner:** API Contract Merge Coordinator.
- **Dependencies:** A5 PASS and the child remains mergeable into the current plan branch without an untested head change.
- **Actions:** merge the tested child PR into `plan/react-to-vue3` using the repository-approved strategy; record child URL, tested head, and resulting merge/squash commit in Plan PR #5.
- **Exit gate:** `docs/contracts/vue-api-data.md` is present on the plan branch at the recorded commit. If updating the child head was required, A5 must rerun before merge.

### C0 — Verify both contracts are merged before frontend work

- **Owner:** Contract Integration Tester (read-only).
- **Dependencies:** U6 and A6.
- **Actions:** test the exact plan head containing both contract merges with the combined contract gate in Section 12; confirm each child URL/tested head/merge commit is recorded; verify no path outside this plan and the two contract files changed before implementation; cross-check both contracts against Sections 5 and 6 and each other.
- **Entry gate:** both child PRs are merged and the plan worktree is clean.
- **Exit gate:** combined contract gate PASS, no contradiction or privacy/path violation exists, and the frontend branch/worktree is created cleanly from this exact plan head. C0 failure blocks F1 and requires correction through the affected contract lane's test/commit/child-PR/merge cycle.

### F1 — Freeze, baseline, sanitize, and verify the authoritative source

- **Owner:** Frontend Builder.
- **Dependencies:** C0 PASS.
- **Writable paths:** owned `v1/**` paths only; do not create `v1/README.md` or `v1/docs/**`.
- **Actions:** apply Section 7's filtered allowlist copy from external `v1/**` only (never external `v0/**`); update `v1/.gitignore` only to enforce the new nested exclusions; generate non-committed source/destination manifests and the separate parent-base root manifest; execute baseline tests; capture sanitized visual evidence; prove copied preserved files match.
- **Acceptance checks:** no denied file ever enters the worktree; destination manifest equals allowed external-v1 source; confidential filename list is not logged; copied style/backend/server/algorithm hashes match; parent-base paths outside `v1/**` have no diff except the three approved plan/contract paths; baseline evidence exists; the frozen source does not contradict either merged contract.
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

### F4 — Port root navigation, public pages, and API boundary normalization

- **Owner:** Frontend Builder.
- **Dependencies:** F3.
- **Exact paths:** `v1/src/App.vue`, `v1/src/LandingPage.vue`, `v1/src/CatalogPage.vue`, `v1/src/api.ts`, `v1/src/api.test.ts`, `v1/src/access.ts`, `v1/src/data.ts`; delete `v1/src/App.tsx`, `v1/src/LandingPage.tsx`, and `v1/src/CatalogPage.tsx` after parity.
- **Actions:** port root async state/lifecycle, manual History API navigation, public home, catalog filtering/sorting, and metadata dialog; preserve framework-neutral API mapping; implement only the contract-approved mark-read boundary correction by unwrapping Laravel's `{ data: notification }` response in `api.ts`.
- **Acceptance checks:** public API fixture, empty response, failure alert, author sort/resource mapping, query/filter/sort URL updates, metadata fields, and no source filename exposure all pass. A focused `api.test.ts` case proves the encoded UUID/request options, raw `{ data: notification }` fixture, exact normalized resource return, and unchanged error behavior.
- **Exit gate:** focused public/API tests pass; `/` and `/catalog` satisfy desktop/mobile visual comparison with byte-identical CSS.

### F5 — Port Google auth, dashboard, notifications, and all role workspaces

- **Owner:** Frontend Builder.
- **Dependencies:** F4.
- **Exact paths:** `v1/src/GoogleSignInDialog.vue`, `v1/src/Dashboard.vue`, `v1/src/RoleWorkspaces.vue`, `v1/src/google-identity.d.ts`; delete corresponding `.tsx` files after parity.
- **Actions:** implement GIS lifecycle/retry, typed emits, access states, local dashboard state, notifications, account/logout, mobile navigation, and all role workspaces.
- **Acceptance checks:** missing client ID/error/progress/retry states, active/invited/blocked access, exact notification fields/UUID read route, mark-read consumption of the normalized resource, empty notifications, all role headings, no fabricated records, and checklist update pass.
- **Exit gate:** focused auth/dashboard/role tests, accessibility interaction checks, lint, and `vue-tsc` pass.

### F6 — Port tests, remove React, and complete frontend self-check

- **Owner:** Frontend Builder.
- **Dependencies:** F5.
- **Exact paths:** `v1/src/App.test.ts`, `v1/src/components.test.ts`, `v1/src/api.test.ts`, `v1/src/test/setup.ts`, `v1/vite.config.test.ts`; delete `v1/src/app.test.tsx` and `v1/src/components.test.tsx`.
- **Actions:** port assertions to Testing Library Vue; add focused manual-navigation, dialog, GIS-error, and deny-list tests where current coverage is implicit; in `v1/vite.config.test.ts`, replace any copied real manuscript basename with the exact neutral synthetic denied path `/src/research_studies/denied-manuscript.docx`; remove every React package/import/config artifact; rerun post-migration screenshots and integrity comparisons.
- **Acceptance checks:** all commands in Section 12 pass; the notification-read envelope test remains present; `vite.config.test.ts` contains the synthetic denied DOCX path and no external corpus basename; no `.tsx`/React residue; `src/styles.css` hash matches baseline; backend/server/algorithm allowed-file hashes remain unchanged; parent-base paths outside `v1/**` remain unchanged except the three approved plan/contract paths; screenshot comparison has no unexplained visual regressions.
- **Exit gate:** builder returns an unstaged handoff with commands, exit codes, manifest digest, visual comparison summary, and acceptance mapping.

### V1 — Independent pre-commit verification

- **Owner:** Pre-Commit Tester (read-only).
- **Dependencies:** F6.
- **Actions:** inspect all uncommitted files, compare ownership and source manifest, execute Section 12, scan secrets/corpora, and inspect dependency diff.
- **Exit gate:** evidence-backed PASS. On failure, a Fix Agent inherits only frontend-owned paths, then V1 reruns. Nothing is staged before PASS.

### G1 — Controlled frontend commit

- **Owner:** Frontend Git Steward.
- **Dependencies:** V1 PASS.
- **Actions:** inspect status/diff; stage explicit `v1` files (never `git add .`); re-run tracked-file deny checks against the index; inspect cached diff; commit only the verified frontend-owned paths.
- **Exit gate:** the exact commit is known, contains only frontend-owned paths, and the worktree is clean.

### P1 — Open the frontend child PR

- **Owner:** Frontend PR Coordinator.
- **Dependencies:** G1.
- **Actions:** push `feat/react-to-vue3-frontend`; open a child PR to `plan/react-to-vue3`; link Plan PR #5 and both merged contract child PRs; attach evidence mapped to F1–F6.
- **Exit gate:** child PR contains only owned paths, exact head is recorded, and its base contains C0's tested contract commits.

### V2 — Exact-commit frontend PR verification and review

- **Owner:** Frontend PR Verification Lead (read-only).
- **Dependencies:** P1.
- **Actions:** test the exact child head in a detached worktree and collect independent code, accessibility, and security review findings for Vue lifecycle/reactivity, both merged contracts, parity, dependency removals, security boundaries, and sanitization.
- **Exit gate:** CI/commands green and no blocking review findings. Corrections repeat Fix Agent -> V1 -> G1 -> P1 -> V2. No merge occurs within V2.

### M1 — Merge the verified frontend child PR

- **Owner:** Frontend Merge Coordinator.
- **Dependencies:** V2 PASS and the child remains mergeable into the current plan branch without an untested head change.
- **Actions:** merge the tested frontend child into `plan/react-to-vue3` using the repository-approved strategy; record child URL, tested head, and resulting merge/squash commit in Plan PR #5.
- **Exit gate:** the tested frontend change is present on the plan branch. Any child-head update requires V1/G1/P1/V2 to repeat before merge.

### D1 — Document Vue setup and migration

- **Owner:** Documentation Agent.
- **Dependencies:** M1.
- **Exact paths:** `v1/README.md`, `v1/docs/migration/react-to-vue3.md` only.
- **Actions:** write Vue/Vite setup and commands; retain Laravel/MariaDB, Google origin, session, admin, legacy server, and non-destructive migration guidance; link the merged UI/API contracts; document architecture, manual navigation, source freeze digest, excluded data categories, rollback, and verification. Do not copy the React README verbatim and do not disclose confidential filenames.
- **Acceptance checks:** commands match `package.json`; no React description remains except migration history; paths assume execution from `v1`; no secret values or local personal paths appear.
- **Exit gate:** documentation is ready for D2 as an unstaged two-file handoff.

### D2 — Verify documentation before commit

- **Owner:** Documentation Pre-Commit Tester (read-only).
- **Dependencies:** D1.
- **Actions:** run `npx prettier --check v1/README.md v1/docs/migration/react-to-vue3.md`, `git diff --check`, and a name-only ownership check; run confidentiality/secret scans scoped to the two documentation paths and review rendered links/commands against merged `v1/package.json` and both contracts.
- **Exit gate:** PASS requires only the two documentation-owned paths, no personal/absolute paths, corpus filenames, or secrets, and accurate commands. Failure returns only those paths to a designated fix owner and repeats D2. Nothing is staged before PASS.

### D3 — Commit verified documentation

- **Owner:** Documentation Git Steward.
- **Dependencies:** D2 PASS.
- **Actions:** stage the two documentation paths explicitly, inspect `git diff --cached --check` and the cached name/diff, then create one focused commit.
- **Exit gate:** the exact commit contains only `v1/README.md` and `v1/docs/migration/react-to-vue3.md`; worktree is clean.

### D4 — Open the documentation child PR

- **Owner:** Documentation PR Coordinator.
- **Dependencies:** D3.
- **Actions:** push `docs/react-to-vue3`; open a child PR to `plan/react-to-vue3`; link Plan PR #5, both contract children, and the frontend child; record D2 evidence.
- **Exit gate:** child PR is open at a known exact head and contains only the two documentation paths.

### D5 — Verify the exact documentation child head

- **Owner:** Documentation PR Verification Lead (read-only).
- **Dependencies:** D4.
- **Actions:** repeat D2 commands in a detached exact-head worktree and collect required documentation/security review findings.
- **Exit gate:** exact-head tests and all reviews PASS. Any correction repeats D1/D2/D3/D4/D5 on the new head.

### D6 — Merge the verified documentation child PR

- **Owner:** Documentation Merge Coordinator.
- **Dependencies:** D5 PASS and the child remains mergeable without an untested head change.
- **Actions:** merge the tested child into `plan/react-to-vue3` with the repository-approved strategy and record the child URL, tested head, and merge/squash commit.
- **Exit gate:** tested documentation is present on the plan branch. Any child-head update requires D5 to rerun.

### V4 — Final combined verification

- **Owner:** Integration Verification Lead (read-only).
- **Dependencies:** C0's two contract merges, M1, and D6 remain present, and no later unreviewed changes exist on the plan branch.
- **Actions:** run Section 12 on exact combined plan head; collect final code/security review findings; inspect final tracked files and acceptance checklist; verify no external `v0/**` content was copied and no parent-base repository-root path outside `v1/**` changed except the plan and two approved contract documents.
- **Exit gate:** evidence-backed V4 PASS with no unresolved blocking finding.

### P2 — Complete the parent Plan PR for review

- **Owner:** Parent PR Coordinator.
- **Dependencies:** V4 PASS.
- **Actions:** update Plan PR #5 with all four child PR links and merge commits, exact verification evidence, decisions, checklist state, and residual risks; mark Draft ready for human review only after confirming the tested combined head is still current.
- **Exit gate:** parent checklist and evidence are complete and current. Merge/release still requires separate authorization.

## 11. Acceptance criteria

- [ ] The tracked application exists under `v1/**` and corresponds to one recorded, sanitized authoritative source freeze.
- [ ] No `.env`, credential, dependency tree, build output, runtime data, cache, `*.tsbuildinfo`, DOCX, Forms corpus, research-study corpus, or derived manuscript catalog is tracked.
- [ ] No external `v0/**` file is copied or tracked; external `v0/**` remains reference-only.
- [ ] `docs/design/vue-ui-parity.md` and `docs/contracts/vue-api-data.md` pass their pre-commit and exact-child-head gates and merge before the frontend branch starts.
- [ ] Parent-base repository-root files outside `v1/**` are unchanged and coexist with the new target, except this plan and the two explicitly approved contract documents.
- [ ] Vue 3 Composition API/TypeScript mounts client-side at `#root`; there is no SSR, router, or Pinia/store dependency.
- [ ] No React runtime, React tooling, React import, JSX/TSX source, `lucide-react`, or Testing Library React dependency remains in `v1`.
- [ ] Icons use `lucide-vue-next`; tests use `@testing-library/vue`; SFC typing is enforced by `vue-tsc`.
- [ ] `/`, `/catalog`, `/app`, query/filter/sort changes, History API behavior, loading/fallback behavior, and scroll behavior match the baseline.
- [ ] Public catalog mapping/pagination, empty/error states, metadata dialog, and sign-in gates match the API/UI contracts.
- [ ] Mark-read preserves the Laravel wire envelope `{ data: notification }`; `api.ts` unwraps it at the frontend boundary and `api.test.ts` proves the exact normalized `NotificationResource` result and encoded request.
- [ ] Google sign-in, session lookup/logout, active/invited/blocked access, notifications, dialogs, and all ten role workspaces match the baseline.
- [ ] Keyboard, focus trap/restoration, Escape/backdrop close, accessible names/roles, skip links, responsive layouts, and reduced-motion behavior are preserved.
- [ ] `v1/src/styles.css` is byte-identical to the frozen source, or a separately approved minimal exception is evidenced in the parent PR.
- [ ] Allowed Laravel backend, legacy server, and Python algorithm files are byte-identical to source; their tests pass without migrations or logic changes.
- [ ] Vue frontend tests, type checking, lint, formatting, production build, Vite corpus denial, backend tests, route listing, and algorithm tests pass on the combined plan head.
- [ ] README and migration documentation describe Vue setup, exclusions, architecture, verification, and rollback accurately.
- [ ] Parent Plan PR links each child PR and contains command/exit-code evidence, decisions, risks, and completed checklists.

## 12. Test and security gates

Run commands from repository root unless a command changes location. Every tester reports exact command, exit code, failures/skips, and concise output.

### Pre-implementation contract gates

Run the applicable pre-commit gate in the isolated contract worktree before staging:

```powershell
# UI contract lane
npx prettier --check docs/design/vue-ui-parity.md
git diff --check
$UiStatusPaths = @(git status --porcelain=v1 | ForEach-Object { $_.Substring(3).Replace('\', '/') })
if (-not $UiStatusPaths -or @($UiStatusPaths | Where-Object { $_ -ne 'docs/design/vue-ui-parity.md' })) { $UiStatusPaths; throw "UI contract worktree must modify only its owned path" }

# API/data contract lane
npx prettier --check docs/contracts/vue-api-data.md
git diff --check
$ApiStatusPaths = @(git status --porcelain=v1 | ForEach-Object { $_.Substring(3).Replace('\', '/') })
if (-not $ApiStatusPaths -or @($ApiStatusPaths | Where-Object { $_ -ne 'docs/contracts/vue-api-data.md' })) { $ApiStatusPaths; throw "API contract worktree must modify only its owned path" }
```

For each exact child head, set the child base and expected path, then require a one-path diff:

```powershell
$ContractBase = $env:RESEARCHNAV_CONTRACT_BASE
$ContractPath = $env:RESEARCHNAV_CONTRACT_PATH
if (-not $ContractBase) { throw "Set RESEARCHNAV_CONTRACT_BASE to the child PR base commit" }
if ($ContractPath -notin @('docs/design/vue-ui-parity.md', 'docs/contracts/vue-api-data.md')) { throw "Set RESEARCHNAV_CONTRACT_PATH to the lane-owned contract path" }
$changed = @(git diff --name-only "$ContractBase...HEAD")
$unexpected = @($changed | Where-Object { $_ -ne $ContractPath })
if ($unexpected -or $changed.Count -ne 1) { $changed; throw "Contract child must contain exactly its owned path" }
npx prettier --check $ContractPath
git diff --check "$ContractBase...HEAD"
```

U2/U5 map `docs/design/vue-ui-parity.md` to every Section 6 UI/accessibility state. A2/A5 map `docs/contracts/vue-api-data.md` to every Section 5 route and must verify the literal `{ data: notification }` wire envelope, frontend-only unwrapping, exact fields, encoded UUID, credentials, errors, and authorization invariants. Each lane runs the repository-approved secret scanner scoped to its owned file and rejects personal/absolute machine paths, real identities, confidential filenames, or corpus-derived fixture content.

After both child merges, C0 runs:

```powershell
npx prettier --check docs/design/vue-ui-parity.md docs/contracts/vue-api-data.md
git diff --check
$dirty = @(git status --porcelain=v1)
if ($dirty) { $dirty; throw "C0 requires a clean plan worktree" }
```

C0 also compares the exact plan head to the P0 head and requires changes only at the two contract paths plus merge metadata; it records both child URLs, tested heads, and resulting merge/squash commits. A dirty worktree or any additional path blocks frontend branch creation.

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

The API boundary parity defect correction additionally requires a focused run equivalent to `npm --prefix v1 test -- src/api.test.ts` and an assertion that a raw `{ data: notification }` mark-read response resolves to the exact nested notification object.

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
- Confirm API requests retain relative paths, JSON handling, URL encoding, pagination cap, and `credentials: "include"`; mark-read must perform only the approved `{ data: notification }` boundary unwrap.
- Confirm no `v-html`, dynamic script URL, token logging/storage, localStorage/sessionStorage auth, or client-side role override was introduced.
- Confirm Vite retains default secret/certificate/git deny patterns and actively denies source, algorithm, and Forms corpus paths including encoded or `/@fs/` attempts.
- Confirm all state-changing Laravel requests continue to rely on existing exact-origin middleware and server authorization. The Vue client is not an authorization boundary.

## 13. Risks and controls

| Risk                                                            | Impact                                                     | Control/trigger                                                                                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend starts before contracts are reviewed and merged        | Ambiguous parity decisions and rework                      | C0 hard dependency; no frontend branch/worktree until both exact-head-tested contract child PRs merge                                  |
| Contract or source drifts after pre-implementation review       | Implementation follows stale or conflicting behavior       | F1 cross-check against both merged contracts; stop for Plan PR amendment rather than silently choosing a source                        |
| Mark-read wire envelope is treated as a bare resource           | Read action returns the wrong shape and UI state regresses | Record `{ data: notification }` in API contract; normalize only in `api.ts`; focused encoded-route/envelope/result test                |
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

1. Before parent merge, close or keep the Draft parent PR; `main`, all non-approved parent-base repository-root files, and the external authoritative source remain unchanged. External `v0/**` remains reference-only and is never copied.
2. Before either contract child merge, discard only that isolated contract branch/worktree after preserving non-sensitive failure evidence. After a contract child merge, revert its recorded merge/squash commit rather than editing the other contract or rewriting history; frontend work remains blocked until C0 passes again.
3. Before a frontend child merge, discard only the isolated frontend branch/worktree after preserving failure evidence; never delete the authoritative source.
4. After a child merge into the plan branch, create a new revert commit for the child change range. Use `git revert -m 1 <merge-commit>` only when it was a merge commit; for squash or fast-forward merges, revert the known child squashed commit or the recorded first-parent range. Do not rewrite history or force-push.
5. After an authorized parent merge, create a new PR that reverts the known parent change range. Use `git revert -m 1 <merge-commit>` only for a merge commit; for squash or fast-forward merges, revert the recorded squashed commit or first-parent range. Do not attempt a mixed React/Vue runtime or restore dependencies manually in production.
6. The unchanged `v1/server/**` remains available only through the documented legacy commands; do not switch databases or run legacy migrations as an automatic frontend rollback.
7. Re-run confidentiality scans after any rollback/revert to ensure denied files were not reintroduced.

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
- Separate pre-implementation child PRs for `docs/design/vue-ui-parity.md` on `design/vue-ui-contract` and `docs/contracts/vue-api-data.md` on `design/vue-api-contract`; both must pass pre-commit/exact-head gates and merge before frontend work.
- Vue 3 SFC/Composition API migration with TypeScript.
- Manual History API navigation; no SSR, router, or Pinia.
- `lucide-vue-next`, Testing Library Vue, and `vue-tsc`.
- Frontend parity tests plus unchanged backend/server/algorithm regression gates.
- Frontend-only `api.ts` normalization of Laravel's discovered notification-read `{ data: notification }` envelope, with a focused boundary test.
- Vue setup, migration, exclusion, and rollback documentation.

## Non-goals

- No feature/redesign/copy/API/schema/database work.
- No Laravel, server, or algorithm logic changes.
- No copy or edit of external-reference-only `v0/**`; no change to parent-base root files outside `v1/**` except this plan and the two approved contract documents.
- No credentials, runtime data, generated output, or manuscript/form DOCX corpora.
- No deployment or release in this PR.

## Architecture

The merged UI and API/data documents are hard implementation entry contracts. Vue mounts client-side at `#root`. `App.vue` retains root session/repository/path state and manual History API navigation for `/`, `/catalog`, and `/app`. Typed props/emits and local refs replace React state/props; no global store is added. Relative `/api` requests continue through Vite to unchanged Laravel with credentialed database sessions. Laravel mark-read continues to emit `{ data: notification }`; `api.ts` unwraps that envelope for frontend callers. The legacy Express server and Python algorithm remain unchanged rollback/reference utilities.

## Acceptance criteria

- [ ] One sanitized source freeze is recorded by aggregate allowlisted manifest digest.
- [ ] No forbidden/confidential/generated/runtime files are tracked.
- [ ] Both contract child PRs pass pre-commit and exact-head verification and merge before frontend work starts.
- [ ] No external `v0/**` content is copied; parent-base root files outside `v1/**` (except the plan/contracts), backend/server/algorithm logic, and `src/styles.css` pass integrity checks.
- [ ] Vue 3 Composition API/TypeScript replaces all React/TSX code and dependencies.
- [ ] No SSR, router, Pinia, or other store is introduced.
- [ ] Manual navigation, catalog, auth/access, dialogs, notifications, and ten role workspaces retain parity.
- [ ] API request/response/session/security contracts remain unchanged.
- [ ] `api.ts` unwraps the discovered `{ data: notification }` mark-read envelope and `api.test.ts` proves the exact normalized result without a backend change.
- [ ] Accessibility, responsive behavior, fonts, icons, classes, and visual styling retain parity.
- [ ] Frontend, type, lint, format, build, Vite denial, backend, route, and algorithm gates pass.
- [ ] Vue setup/migration/rollback documentation is complete.

## Workstreams

| Workstream                              | Owner                         | Status                                   | Branch                        | Pull request |
| --------------------------------------- | ----------------------------- | ---------------------------------------- | ----------------------------- | ------------ |
| Vue UI parity contract                  | Vue UI Contract Author        | [ ] Pending                              | `design/vue-ui-contract`      |              |
| Vue API/data contract                   | Vue API Contract Author       | [ ] Pending                              | `design/vue-api-contract`     |              |
| Contract integration gate               | Contract Integration Tester   | [ ] Blocked by both contract merges      | read-only exact plan head     | N/A          |
| Frontend migration + sanitized snapshot | Frontend Builder              | [ ] Blocked by contract integration PASS | `feat/react-to-vue3-frontend` |              |
| Independent frontend verification       | Frontend PR Verification Lead | [ ] Blocked by frontend child            | read-only exact child head    | N/A          |
| Documentation                           | Documentation Agent           | [ ] Blocked by frontend merge            | `docs/react-to-vue3`          |              |
| Final combined verification             | Integration Verification Lead | [ ] Blocked by all child merges          | read-only exact plan head     | N/A          |

## Verification

- [ ] UI contract pre-commit, exact-head, accessibility, privacy/path, and merge gates pass.
- [ ] API/data contract pre-commit, exact-head, API/security, privacy/path, and merge gates pass.
- [ ] C0 confirms both contracts are on the exact clean plan head before frontend branch creation.
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
- [ ] Focused `api.test.ts` mark-read `{ data: notification }` normalization assertion
- [ ] Code review
- [ ] Security review
- [ ] Documentation review

## Decisions

- Use Vue 3 SFCs with `<script setup lang="ts">` and Composition API.
- Preserve manual History API navigation and local/root state; do not add router or Pinia.
- Split shared TSX helpers into focused Vue components while preserving classes/semantics.
- Merge independently owned UI and API/data contracts before allowing the frontend lane to start.
- Treat Laravel's `{ data: notification }` mark-read wire shape as frozen and correct parity only at the `api.ts` frontend boundary with a focused test.
- Keep one frontend implementation lane; backend/database lanes are unnecessary because those contracts are frozen.
- Exclude derived `src/research_studies/catalog.json` with the confidential source corpus.

## Risks and assumptions

- The source is untracked; a freeze digest and integrity manifests are mandatory.
- Sanitization must occur before files enter a worktree, not as cleanup afterward.
- Contract child branches have non-overlapping one-file ownership and require independent pre-commit/exact-head gates before merge.
- Any F1 source/contract contradiction blocks implementation for a Plan PR amendment.
- Lifecycle, focus, History API, and GIS differences require focused parity tests.
- A baseline failure blocks migration unless explicitly classified and accepted as pre-existing.
- Parent remains Draft until all child PRs, full verification, reviews, and documentation pass.

## Child PR checklist

- [ ] Vue UI contract child linked, exact-head verified, and merged
- [ ] Vue API/data contract child linked, exact-head verified, and merged
- [ ] C0 contract integration evidence linked
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
- [ ] PR Coordinator updates Draft Plan PR #5 and records the exact plan head.
- [ ] Both contract worktrees are clean, isolated, non-overlapping, and based on the exact plan head.
- [ ] No frontend branch/worktree is created before C0 PASS.

### Vue UI contract lane

- [ ] U1 changes only `docs/design/vue-ui-parity.md` on `design/vue-ui-contract`.
- [ ] UI matrix covers every Section 6 surface/state, accessibility interaction, and sanitized desktop/mobile evidence method.
- [ ] U2 formatting, ownership, accessibility, privacy/path, and secret checks PASS before staging.
- [ ] U3 explicitly stages and commits only the owned path.
- [ ] U4 child PR targets `plan/react-to-vue3`, links Plan PR #5, and records the exact head.
- [ ] U5 exact-head commands and required accessibility/documentation/security reviews PASS.
- [ ] U6 merges the tested child and records child URL, tested head, and merge/squash commit.

### Vue API/data contract lane

- [ ] A1 changes only `docs/contracts/vue-api-data.md` on `design/vue-api-contract`.
- [ ] Contract distinguishes Laravel's `{ data: notification }` wire envelope from the normalized frontend `NotificationResource`.
- [ ] Contract requires focused `api.ts` boundary normalization and `api.test.ts` encoded-route/envelope/result coverage without backend changes.
- [ ] A2 formatting, ownership, API/security, privacy/path, and secret checks PASS before staging.
- [ ] A3 explicitly stages and commits only the owned path.
- [ ] A4 child PR targets `plan/react-to-vue3`, links Plan PR #5, and records the exact head.
- [ ] A5 exact-head commands and required API/documentation/security reviews PASS.
- [ ] A6 merges the tested child and records child URL, tested head, and merge/squash commit.

### Contract integration gate

- [ ] C0 starts from the exact plan head containing both contract merges.
- [ ] Combined formatting, clean-worktree, ownership, privacy/path, and cross-contract checks PASS.
- [ ] F1-frozen source contradiction rule is understood and no unresolved contract conflict exists.
- [ ] Frontend branch/worktree is created only after C0 PASS, from that exact plan head.

### Frontend migration lane

- [ ] F1 source freeze digest and baseline evidence recorded.
- [ ] F1 filtered copy and source/destination manifest comparison pass.
- [ ] F1 confidentiality, secret, and generated/runtime deny checks pass.
- [ ] F2 Vue toolchain/bootstrap gate passes.
- [ ] F3 shared components/focus gate passes.
- [ ] F4 root/public/catalog/API gate passes, including `{ data: notification }` boundary normalization and focused test.
- [ ] F5 GIS/dashboard/notifications/roles gate passes.
- [ ] F6 Testing Library Vue port and React removal gate passes.
- [ ] CSS/backend/server/algorithm integrity hashes pass.
- [ ] Desktop/mobile parity evidence reviewed.
- [ ] Pre-Commit Tester returns PASS before staging.
- [ ] G1 explicitly stages and commits only frontend-owned `v1` paths.
- [ ] P1 frontend child PR is linked to parent and both contract children.
- [ ] V2 exact-commit PR tests, code review, and security review pass.
- [ ] M1 merges the tested frontend child into the plan branch.

### Documentation lane

- [ ] Docs worktree starts from plan head containing frontend merge.
- [ ] `v1/README.md` reflects Vue and retained Laravel/legacy setup.
- [ ] `v1/docs/migration/react-to-vue3.md` records architecture, exclusions, digest, verification, and rollback.
- [ ] Documentation contains no confidential filenames, personal paths, or secrets.
- [ ] D2 pre-commit formatting, ownership, privacy, and command checks PASS before staging.
- [ ] D3 commits only the two documentation paths; D4 opens and links the exact-head child PR.
- [ ] D5 exact-head documentation/security review PASS; D6 merges the tested child.

### Final gate

- [ ] Combined plan head passes all Section 12 commands.
- [ ] Combined tracked-file, secret, corpus, React, and integrity scans pass.
- [ ] Final code and security reviews have no blocking findings.
- [ ] Parent PR links both contract, frontend, and documentation child PRs plus exact verification evidence.
- [ ] Acceptance criteria and residual-risk records are complete.
- [ ] PR Coordinator marks parent ready for human review; no merge/release without authorization.

## 17. Entry and exit gates summary

### Implementation entry gate

- Plan PR #5 is Draft, updated, and accessible.
- Plan branch/worktree/base are verified.
- Both one-file contract child PRs passed pre-commit and exact-head gates and are merged into the plan branch.
- C0 passed on the exact clean plan head, with contract child URLs, tested heads, and merge commits recorded.
- Frontend worktree is isolated, clean, and based on that exact C0-verified plan head.
- Source remains read-only and F1 sanitization rules are understood.
- Ownership table has no concurrent writable overlap.

### Implementation exit gate

- Both contract, frontend, and docs child PRs are merged into the plan branch through tested commits.
- All acceptance criteria and full verification/security/integrity gates pass on exact combined head.
- No denied/confidential file or out-of-scope change is present.
- Parent PR checklist, decisions, evidence, links, and residual risks are current.
- Parent is ready for human review, not automatically merged or released.
