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

Replace the authoritative ResearchNAV React 19 frontend with an equivalent Vue 3 Composition API/TypeScript frontend while preserving its observable UI, accessibility behavior, styles, Laravel API contracts, authentication/session behavior, legacy server rollback implementation, and similarity algorithm. Deliver the migrated application as a sanitized `v1/**` subtree without committing credentials, dependencies, generated output, runtime data, caches, TypeScript build metadata, or confidential manuscript/form corpora. The migration also intentionally corrects only the five approved frontend baseline defects: notification response-envelope normalization, accessible names for responsive shelf controls, programmatic notification read/unread semantics, safe validation of notification action paths, and fail-closed `links.next` normalization at the same-origin API boundary.

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
- Correct, during the Vue migration and only in frontend-owned files, the missing accessible names on shelf navigation controls whose visible text is hidden at viewport widths `<=1100px`, missing programmatic notification read/unread semantics, unsafe acceptance of notification action paths, and permissive repository/notification `links.next` normalization. Retain the already approved notification envelope normalization. Each correction requires focused regression tests.
- Preserve Google Identity Services loading, server-side credential verification, session cookies, errors, dialog focus management, and retry states.
- Require the final SHA-256 of `src/styles.css` to equal the F1-frozen source hash. The sole exception is a verified Vue selector-matching incompatibility that cannot be resolved in template markup and requires a minimal selector-only compatibility correction; no declaration, value, custom property, media query, or unrelated selector change is allowed. Any exception requires the two hashes, exact selector diff, reproduced incompatibility, focused test, and explicit parent Plan PR documentation.
- Preserve and regression-test Laravel, legacy Express/server, and Python algorithm logic without creating backend or database implementation workstreams.
- Update setup and migration documentation after the frontend child PR is merged.

### Non-goals

- No feature development, broad redesign, unplanned copy/content change, API expansion, schema/migration change, data import, or fabricated repository/workflow data. F1's required sanitized copy of allowlisted `<external-source-root>/v1` snapshot content is permitted and required; the five enumerated frontend baseline defect corrections are intentional migration remediations, not authority for adjacent cleanup or redesign.
- No correction, normalization, or cleanup of the existing odd `researchStage` mapping; preserve it exactly as frozen parity behavior.
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
2. The source may change before execution. F1 must record UTC freeze time and an aggregate preservation-manifest digest plus the separate source `v1/.gitignore` hash. A later source change, including a source `.gitignore` hash change, invalidates the baseline and requires rerunning F1; implementers must not silently mix snapshots.
3. The source `src/research_studies/catalog.json` is derived from confidential manuscripts and is treated as corpus/runtime data. It is excluded with the source DOCX files even though it is JSON.
4. `<external-source-root>/v0/**` is external-reference-only, is never copied, and is not a source for resolving ambiguities. Resolve ambiguities from the F1-frozen `<external-source-root>/v1/**` snapshot and this plan. Neither external `v0/**` nor external `v1/**` exists in the parent base.
5. The parent-base repository-root files are the compatibility baseline, not migration input. F1 must record their tracked path/hash manifest before copying, and F6/V4 must require an empty diff for every parent-base path outside `v1/**`, excluding only `docs/plans/react-to-vue3.md`, `docs/design/vue-ui-parity.md`, and `docs/contracts/vue-api-data.md`. This narrow exception authorizes only the plan and approved contracts; all other root files remain unchanged.
6. PHP 8.3+, Composer 2, Node/npm, and Python with `algorithm/requirements.txt` dependencies are available to the applicable verifier. Environment limitations must be reported, not converted into false passes.
7. The Laravel API remains the normal API on `127.0.0.1:3001`; `server/**` remains an explicit legacy rollback/reference implementation.
8. The current UI intentionally contains prototype/empty states. Migration must preserve them rather than connecting unimplemented backend workflows.
9. Public and authenticated browser behavior must remain client-rendered only. Direct navigation relies on the existing development/hosting fallback to `index.html`; no server rendering is added.
10. The pre-F1 UI and API/data contracts are necessarily provisional because their authors inspect a dirty external source. They become authoritative implementation contracts only after F1 has copied the sanitized authoritative external `v1`, recorded matching source/destination preservation manifests and aggregate digests that omit deferred `README.md`, deferred `docs/**`, and the intentionally transformed root `.gitignore` from otherwise allowlisted paths, recorded separate source/target `.gitignore` hashes and its approved sanitation delta, and C0 has re-attested both contracts against that exact frozen copy. F2 and later work cannot start on provisional contracts.
11. A nonempty but invalid Google Identity Services credential can currently cause the Laravel verifier path to return HTTP 500 rather than a stable 4xx error. This is a known pre-existing backend defect. Backend remediation and error-contract redesign are explicitly out of scope; Vue must retain the generic verification-failure message, avoid exposing server detail, and test generic handling of the 500 response. The inability to distinguish this case from a transient server failure remains a recorded residual risk.

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
- The merged `docs/design/vue-ui-parity.md` and `docs/contracts/vue-api-data.md` are provisional entry controls for F1 only. They become authoritative implementation contracts for F2 onward after C0 re-attests them against the F1-frozen sanitized copy, its matching preservation manifests/digests, and the separately hashed and reviewed root `.gitignore` sanitation delta. If either conflicts with this plan or frozen source, frontend work stops for a Plan PR/contract amendment and another C0 re-attestation; implementers may not silently choose one source.

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
| `v1/src/styles.css`                                                                                         | Same path                                                                                                                            | Exact SHA-256/selector-only exception gate                                           |

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

## 5. Provisional API contract and approved baseline corrections

Until the post-F1 C0 re-attestation, this section and `docs/contracts/vue-api-data.md` are provisional descriptions derived from the external source. They become frozen only when F1 records matching sanitized source/destination preservation manifests and aggregate digests that omit deferred `README.md`, deferred `docs/**`, and transformed root `.gitignore` from otherwise allowlisted paths, records the separate `.gitignore` source/target hashes and approved sanitation delta, and C0 re-attests the contract against that exact copy. No API route, request, response, cookie, or authorization behavior may change. `v1/src/api.ts` remains the browser boundary and must continue to send `credentials: "include"` and JSON content type. Non-2xx responses parse `{ error?: string }` and throw that stable code or `REQUEST_FAILED_<status>`; `204` returns no body. Frontend-only normalization for the discovered Laravel notification-read response envelope remains required; it does not authorize a Laravel or route change.

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

Repository and notification pagination share one frontend-only `links.next` normalization rule. An absolute HTTP(S) API link may be parsed only to discard its scheme/authority and produce a credentialed same-origin pathname/query fetch target; it must never be fetched as an absolute URL. Normalization fails closed unless the resulting pathname begins case-sensitively and exactly with `/api/` and the raw or normalized target does not begin with `//`. In particular, a raw protocol-relative value such as `//host/api/repository?page=2` is rejected before URL parsing, and `/apiary`, `/api`, same-origin non-API paths, and absolute non-API URLs are rejected. Rejection stops pagination without any follow-up fetch. Focused repository and notification tests must each prove that a benign absolute `/api/...` next link is rewritten to and fetched only as its same-origin path/query, while hostile `//host/...` and non-API next links cause no follow-up request. This correction preserves the credentialed same-origin API boundary: `credentials: "include"` must never accompany a pagination request to an authority supplied by `links.next`.

Public resource mapping remains exact: sort `authors` by `author_order`; map `author_name`; accept `publication_year` or `year`; map institution, academic unit, degree program, category, abstract, keywords, research stage, manuscript date, and abstract provenance; retain deprecated `institute`/`program` aliases used by current layouts. The existing odd `researchStage` mapping is deliberately preserved verbatim; this plan does not authorize correcting or normalizing it. Do not expose a source filename.

`NotificationResource` remains `{ id, type, event, title, message, action_url, research_document_id, read_at, created_at }`, including nullable fields.

`docs/contracts/vue-api-data.md` must distinguish the Laravel wire envelope from the normalized frontend return type. `v1/src/api.test.ts` must assert that mark-read sends the encoded UUID route with existing request options, receives `{ data: notification }`, and resolves to `notification` without fabricating, dropping, or renaming fields. This narrowly approved `api.ts` correction is required parity work, not API expansion.

Notification action navigation must add a frontend-only allowlist guard without changing the wire resource. An action is navigable only when its raw value is a root-relative path beginning with one `/` (never `//`, a scheme/authority, a backslash form, or control characters) and its parsed same-origin pathname matches a supported prefix re-attested from the F1-frozen source. The provisional expected supported prefix is `/research/`, matching the current Laravel notification producer; C0 must confirm the final exact prefix list and record it in `docs/contracts/vue-api-data.md`. Invalid, unsupported, or absent actions remain displayable and may still be marked read, but must not be passed to `history.pushState` or another navigation sink. Tests must accept representative root-relative supported paths, including query/hash where the frozen contract permits them, and reject absolute, protocol-relative, encoded/bypass, backslash, control-character, and unsupported-prefix inputs.

The approved notification fixes are limited to: (1) preserving `{ data: notification }` envelope normalization in `api.ts`; (2) exposing each notification's `read_at === null` state as deterministic programmatic read/unread text or an equivalent accessible relationship that updates after one/all mark-read actions; (3) the action-path guard above; and (4) the shared fail-closed `links.next` normalization rule above. These, the repository-side application of that pagination rule, and the responsive shelf-name correction in Section 6 are intentional baseline defect corrections required during migration, not a broad notification, navigation, copy, visual, mapping, or backend redesign. Focused API and Testing Library Vue tests are mandatory.

## 6. Provisional UI and accessibility contract

This section and `docs/design/vue-ui-parity.md` remain provisional until the post-F1 C0 re-attestation binds them to the recorded sanitized source preservation manifests/digests and the separately verified root `.gitignore` sanitation delta. F2 and later implementation must use only the re-attested contract.

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
- A synthetic nonempty invalid GIS credential returning HTTP 500 must produce only the existing generic `Google sign-in could not be verified. Please try again.` state, clear submitting state, permit the existing retry flow, and disclose no response body/server detail. This is Vue containment of the known backend defect in Assumption 11, not backend correction.
- Active users can enter; invited and blocked users see their existing distinct access blocker. No frontend role elevation is possible.
- Dashboard retains all role navigation labels, primary workspace selection, mobile tabs, notification unread count/read behavior, account details/logout, public catalog links, and toast timing.
- Every shelf navigation button whose text is hidden by the existing `@media (max-width: 1100px)` rule must retain a stable accessible name equal to its full visible desktop label, independent of CSS visibility. Tests must cover every generated shelf control rather than one example and must prove active/unread visual state does not replace the name.
- Every notification item must expose `Read notification` or `Unread notification` (or contractually equivalent deterministic text) programmatically, and that state must update after successful single-item and mark-all operations while preserving title/message naming and visible styling. The unread dot alone is insufficient. Failed mark-read requests must not announce or render a false read state.
- Notification actions navigate only after the root-relative supported-prefix guard in Section 5 passes. Rejected paths do not navigate or reach a URL sink; notification display and mark-read behavior remain available.
- All ten primary workspaces and intentional prototype/empty states remain present. The statistician checklist starts `[true, true, false, false]` and recalculates completion percentage locally.

### Shared presentation

- Existing CSS class names, font imports, DOM semantics, button types, labels, headings, roles, `aria-*` attributes, skip links, keyboard focus, responsive behavior, reduced motion, and visual content remain equivalent.
- Similarity bands remain Low `0–39`, Moderate `40–69`, Flagged `70–100`, with accessible text and the existing CSS custom properties.
- Lucide replacements must render the same named icon at the same logical location. Decorative icons remain hidden from assistive technology; meaningful controls retain text or accessible names.
- The shelf names and notification read/unread semantics are the only authorized accessibility baseline corrections. Reuse existing visually hidden utilities/markup so `styles.css` retains its exact F1 SHA-256; only the separately governed selector-only Vue compatibility exception may differ. Do not use these corrections to alter copy, hierarchy, layout, control count, or interaction design.

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

The external source `v1/.gitignore` is read-only. The copied target `v1/.gitignore` must explicitly enforce these exclusions relative to the new subtree, including nested DOCX files and `src/research_studies/`, and must keep example environment files trackable. F1 must derive it with one deterministic, additions-only sanitation step: preserve every source line and its order, append each missing approved exclusion line from the following canonical list exactly once and in the order shown, and make no other textual change:

```gitignore
*.docx
/src/research_studies/
```

The sanitation diff may therefore contain only added instances of those two exact lines. Existing protections, negations for example environment files, comments, ordering, and all other content must not be removed, weakened, reordered, or edited. If either canonical line is already present in the frozen source, it is retained in place and not duplicated. Any additional required `.gitignore` change blocks F1 for a Plan PR amendment rather than expanding this delta.

### Baseline evidence

Before conversion, F1 must:

1. After applying Section 7's deny rules, enumerate preservation-eligible source files as normalized paths relative to external `v1`, byte length, and SHA-256. From those otherwise allowlisted files, exclude the intentionally deferred `README.md` and `docs/**` documentation paths and the intentionally transformed root `.gitignore` from this source preservation manifest; calculate an aggregate digest over the sorted manifest.
2. Produce the same preservation manifest for the copied target `v1/**`, with target `README.md`, `docs/**`, and root `.gitignore` excluded, and require an empty `Compare-Object` result and equal source/destination aggregate preservation digests. These exclusions prevent intentional deferral or sanitation from being misreported as byte-preservation failure; they authorize no other mismatch.
3. Hash the frozen external source root `.gitignore` before transformation and the copied target `v1/.gitignore` after transformation as separate SHA-256 values. Retain an exact local line diff and require it to be the minimal deterministic additions-only delta defined above: only missing `*.docx` and `/src/research_studies/` lines in canonical order, with no duplicate and no removed, weakened, reordered, or edited source protection. The target hash is not expected to equal the source hash and neither `.gitignore` hash participates in the matching preservation aggregate digests.
4. Record only freeze time, matching source/destination preservation aggregate digests, preservation-file count, both `.gitignore` hashes, the approved added exclusion lines, and denied-file counts by category in the child PR. Do not record confidential filenames or absolute user paths in committed files. Retain the full manifests and sanitation diff as local verification evidence outside Git and expose only their aggregate digests/counts, the two `.gitignore` hashes, and approved added lines.
5. Hash source and copied `src/styles.css`, `backend/**` logic/config/tests, `server/**`, and allowed `algorithm/**`; require equality before framework work.
6. Create a second filtered copy in a unique temporary directory outside every Git worktree and run the baseline commands there. This permits installs, builds, caches, and tests without writing to the authoritative source. Save command, exit code, and concise output in the child PR. A baseline failure blocks conversion unless it is reproducible, explicitly classified as pre-existing, and accepted in the parent Plan PR with a no-regression assertion.
7. Record the parent-base repository-root manifest separately from the external-source preservation manifest. The filtered copy may populate only `v1/**`; it must not overwrite, delete, or use any parent-base root file as source input. Root-baseline comparison may exclude only the plan and the two merged contract documents named in Assumption 5.
8. Capture sanitized public/error/empty and fixture-driven role UI screenshots at desktop (1440x900) and mobile (390x844) only in a unique temporary directory outside every Git worktree. The capture harness must use wholly synthetic, non-identifying fixtures (including synthetic names, emails, UUIDs, timestamps, titles, paths, and counts), disable or mock live API/GIS/network access, and never load a real account, repository row, manuscript-derived value, corpus filename, browser profile, machine path, token, or email address. Before comparison, inspect rendered pixels and image metadata and run a local text/OCR review where available. Screenshots must never be added to Git, PR attachments/comments, CI artifacts, shared logs, or external visual-diff services; publish only aggregate pass/fail and redacted numeric difference summaries. Repeat after Vue migration, document intentional differences without embedding images, and securely delete the temporary evidence after final review according to local policy.
9. Hand the matching source/destination preservation aggregate digests, empty preservation-manifest comparison result, separate `.gitignore` source/target hashes and exact approved sanitation delta, authoritative supported notification-action prefixes, and relevant source-to-contract evidence to C0 for mandatory post-F1 re-attestation. F2 is blocked until that re-attestation passes.

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

Before the final exact-head review of every contract, frontend, or documentation child, the child owner must fetch and merge the latest `plan/react-to-vue3` head into that child branch with an ordinary non-force merge, push normally, and record the incorporated plan commit. Rebasing the published child, resetting it onto the plan branch, force-pushing, or reviewing a pre-correction head is prohibited. If that exact plan commit is already an ancestor, record the no-op merge result and ancestry proof. Any later plan-head advance invalidates final child review: merge the new plan head non-force and rerun the complete exact-head gate. The final reviewer must verify both ancestry and the exact reviewed child SHA.

## 9. Dependency graph

```text
P0 Verify updated Draft parent Plan PR #5 control plane
 |\
 | +-> U1 author provisional UI parity contract -> U2 pre-commit test -> U3 commit
 |       -> U4 child PR/merge latest plan head non-force -> U5 exact-head test/reviews -> U6 merge
 |
 +----> A1 author provisional API/data contract -> A2 pre-commit test -> A3 commit
         -> A4 child PR/merge latest plan head non-force -> A5 exact-head test/reviews -> A6 merge
                         \                         /
                          +---- C0 provisional merge gate --+
                                                          |
                                                          v
 F1 Freeze, baseline, sanitize, copy, and record preservation evidence
  |
  v
 C0 post-F1 re-attestation against exact sanitized copy
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
V1 Independent pre-commit test -> G1 controlled commit -> P1 child PR/merge latest plan head non-force
 |
 v
V2 exact-commit PR test + required reviews -> M1 merge frontend child
 |
 v
D1 docs -> D2 pre-commit test -> D3 commit -> D4 child PR/merge latest plan head non-force
  -> D5 exact-head test/reviews -> D6 merge docs child
 |
 v
V4 final combined verification -> P2 complete parent checklist / ready for review
```

The two documentation-only contract lanes are mandatory pre-implementation lanes and may proceed in parallel. C0's provisional merge gate blocks F1 until both ancestry-corrected, exact-head-tested contract child PRs are merged into `plan/react-to-vue3`. F1 then binds the provisional contracts to one sanitized source copy through matching preservation manifests/digests and the separately hashed root `.gitignore` sanitation delta; C0 must re-attest that evidence and both contracts before F2. After re-attestation there is one product implementation lane. No backend/database implementation lane is created.

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
- **Actions:** materialize the approved provisional UI contract as a source-to-target surface matrix covering `/`, `/catalog`, `/app`, all ten role workspaces, manual History API behavior, loading/empty/error/access states, dialogs/focus, responsive desktop/mobile behavior, reduced motion, class/semantic/style preservation, Lucide substitutions, and sanitized visual evidence. Explicitly specify the full-label accessible names for every shelf control hidden at `<=1100px`, programmatic notification read/unread semantics and updates, rejected-action non-navigation, and generic handling of an invalid nonempty GIS credential that returns 500. Use only synthetic public fixtures; include no screenshots, real identities, corpus filenames, or machine paths. Mark the contract provisional until post-F1 C0 re-attestation.
- **Acceptance checks:** every Section 6 contract has an observable assertion or named evidence method; the three UI-facing baseline corrections have focused tests and are labeled intentional narrow remediation rather than redesign; intentional prototype/empty states are explicit; CSS SHA-256 equality and the selector-only exception process remain explicit; the document introduces no router/store, API, backend, data, or adjacent redesign requirement.
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
- **Actions:** push `design/vue-ui-contract`; open a child PR targeting `plan/react-to-vue3`; link Plan PR #5 and include U2 command/evidence mapping. Immediately before U5, fetch and merge the latest plan head into the child with a normal non-force merge, push normally, and record the incorporated plan SHA and resulting child SHA; if already an ancestor, record the no-op and ancestry proof.
- **Exit gate:** child PR is open, target/base, incorporated latest plan head, and exact child head are recorded; changed files relative to that plan head contain only `docs/design/vue-ui-parity.md`; no rebase, reset, or force-push occurred.

### U5 — Verify the exact UI contract child head

- **Owner:** UI Contract PR Tester (read-only).
- **Dependencies:** U4.
- **Actions:** first verify U4's recorded latest plan SHA is an ancestor of the exact child SHA and remains the current plan head; then check out that child SHA in a detached worktree, repeat Section 12 UI contract commands, and collect required accessibility, documentation, and security review findings.
- **Exit gate:** ancestry, exact-head tests, and all required reviews PASS with no blocking finding. Any correction or plan-head advance repeats the non-force ancestry merge and U1/U2/U3/U4/U5 as applicable on the new exact head.

### U6 — Merge the UI contract child PR

- **Owner:** UI Contract Merge Coordinator.
- **Dependencies:** U5 PASS and the exact reviewed child still contains the latest plan head as an ancestor without an untested head change.
- **Actions:** merge the tested child PR into `plan/react-to-vue3` using the repository-approved strategy; record child URL, tested head, and resulting merge/squash commit in Plan PR #5.
- **Exit gate:** `docs/design/vue-ui-parity.md` is present on the plan branch at the recorded commit. If either branch head changed, the child must merge latest plan non-force and U5 must rerun before merge.

### A1 — Author the Vue API/data boundary contract

- **Owner:** Vue API Contract Author.
- **Dependencies:** P0.
- **Exact path:** `docs/contracts/vue-api-data.md` only, on `design/vue-api-contract` in `<vue-api-contract-worktree>`.
- **Actions:** materialize Section 5 as a provisional route/request/raw-wire/normalized-return matrix covering credentials, JSON/error/204 handling, session and access shapes, public and notification pagination caps/fail-closed URL normalization, public resource mapping, admin/coordinator operations, nullable notification fields, and UUID encoding. Explicitly record the discovered Laravel mark-read envelope `{ data: notification }`, approved `api.ts` boundary unwrapping, root-relative supported-prefix action guard, programmatic read-state consumption, exact preservation of the odd `researchStage` mapping, and required focused assertions; do not prescribe a backend change. Require repository and notification pagination tests for benign absolute API links and rejected protocol-relative/non-API links. Record `/research/` as the provisional notification-action prefix and require post-F1 C0 confirmation before it is frozen.
- **Acceptance checks:** wire and frontend-normalized shapes are unambiguous; `NotificationResource` fields remain exact; envelope normalization, action-path validation, and pagination fail-closed behavior are frontend-only and narrowly scoped; accepted/rejected path classes and tests are explicit; pagination cannot send credentials to a `links.next` authority; the odd `researchStage` mapping remains unchanged; the known invalid-nonempty-GIS-token 500 is recorded as an out-of-scope backend defect with generic Vue handling; no route, cookie, authorization, schema, fabricated data, mapping cleanup, or backend behavior changes.
- **Exit gate:** only the owned file is modified, Markdown is formatted, examples are synthetic, and the author returns an unstaged handoff to A2.

### A2 — Verify the API/data contract before commit

- **Owner:** API Contract Pre-Commit Tester (read-only).
- **Dependencies:** A1.
- **Actions:** inspect the complete unstaged file; run the API contract commands in Section 12; compare the contract to Section 5 and the read-only authoritative Laravel notification controller/resource evidence without copying source or disclosing local/confidential paths.
- **Exit gate:** evidence-backed PASS confirms `{ data: notification }` on the wire, normalized `NotificationResource` at the frontend boundary, fail-closed repository/notification pagination at relative `/api/` targets only, preservation of the odd `researchStage` mapping, all frozen API/security behavior, and clean privacy/path scans. Failure returns only `docs/contracts/vue-api-data.md` to the stopped A1 owner or a designated fix owner, then A2 reruns. Nothing is staged before PASS.

### A3 — Commit the verified API/data contract

- **Owner:** API Contract Git Steward.
- **Dependencies:** A2 PASS.
- **Actions:** inspect status/diff; stage only `docs/contracts/vue-api-data.md` by exact path; run `git diff --cached --check` and inspect the cached name/diff; create one focused commit without amending unrelated history.
- **Exit gate:** the known commit contains exactly the API/data contract path and the worktree is clean.

### A4 — Open the API/data contract child PR

- **Owner:** API Contract PR Coordinator.
- **Dependencies:** A3.
- **Actions:** push `design/vue-api-contract`; open a child PR targeting `plan/react-to-vue3`; link Plan PR #5 and include A2 command/evidence mapping. Immediately before A5, fetch and merge the latest plan head into the child with a normal non-force merge, push normally, and record the incorporated plan SHA and resulting child SHA; if already an ancestor, record the no-op and ancestry proof.
- **Exit gate:** child PR is open, target/base, incorporated latest plan head, and exact child head are recorded; changed files relative to that plan head contain only `docs/contracts/vue-api-data.md`; no rebase, reset, or force-push occurred.

### A5 — Verify the exact API/data contract child head

- **Owner:** API Contract PR Tester (read-only).
- **Dependencies:** A4.
- **Actions:** first verify A4's recorded latest plan SHA is an ancestor of the exact child SHA and remains the current plan head; then check out that child SHA in a detached worktree, repeat Section 12 API contract commands, and collect required API, documentation, and security review findings.
- **Exit gate:** ancestry, exact-head tests, and all required reviews PASS with no blocking finding. Any correction or plan-head advance repeats the non-force ancestry merge and A1/A2/A3/A4/A5 as applicable on the new exact head.

### A6 — Merge the API/data contract child PR

- **Owner:** API Contract Merge Coordinator.
- **Dependencies:** A5 PASS and the exact reviewed child still contains the latest plan head as an ancestor without an untested head change.
- **Actions:** merge the tested child PR into `plan/react-to-vue3` using the repository-approved strategy; record child URL, tested head, and resulting merge/squash commit in Plan PR #5.
- **Exit gate:** `docs/contracts/vue-api-data.md` is present on the plan branch at the recorded commit. If either branch head changed, the child must merge latest plan non-force and A5 must rerun before merge.

### C0 — Provisional merge gate and post-F1 contract re-attestation

- **Owner:** Contract Integration Tester (read-only).
- **Dependencies:** Phase 1 depends on U6 and A6. Phase 2 depends on F1's completed sanitized copy, matching source/destination preservation manifests and aggregate digests, separate root `.gitignore` source/target hashes and sanitation diff, supported-prefix evidence, and baseline classification.
- **Phase 1 actions:** test the exact plan head containing both contract merges with the combined contract gate in Section 12; confirm each child URL/tested head/merge commit and ancestry correction is recorded; verify no path outside this plan and the two contract files changed before implementation; cross-check both provisional contracts against Sections 5 and 6 and each other.
- **Phase 1 exit gate:** combined provisional gate PASS, no known contradiction or privacy/path violation exists, and the F1 frontend branch/worktree is created cleanly from this exact plan head. This authorizes only F1 freeze/sanitized copy/evidence work, not F2 or product conversion.
- **Phase 2 actions:** after F1, compare both contracts line by line to the exact sanitized copied source and its matching source/destination preservation manifests/digests. Independently hash the read-only source and target root `.gitignore` files and review their exact line diff; require only the missing canonical `*.docx` and `/src/research_studies/` additions in order, no duplicates, and no removed, weakened, reordered, or edited protection. Verify the notification wire envelope, final root-relative supported action-prefix list, permissive pagination baseline, exact odd `researchStage` mapping, shelf breakpoint behavior, read/unread semantics defect, GIS invalid-token 500 baseline, CSS hash, and all UI/API surfaces. Confirm evidence contains only aggregate digests/counts, the two `.gitignore` hashes, approved sanitation lines, and approved synthetic values. Record the exact F1 preservation source/destination digests, `.gitignore` source/target hashes, approved sanitation-delta result, frontend worktree head, contract versions, and re-attestation result in Plan PR #5.
- **Phase 2 exit gate:** C0 re-attestation PASS makes the contracts authoritative for the recorded F1 snapshot and authorizes F2 only when the preservation manifests/digests match and the separate `.gitignore` sanitation review passes. Any contradiction or sanitation-delta violation blocks F2 and requires a Plan PR amendment plus affected lane correction, ancestry merge, exact-head review, merge, and complete C0 re-attestation; source or source-`.gitignore` hash drift requires F1 and both C0 phases to repeat.

### F1 — Freeze, baseline, sanitize, and verify the authoritative source

- **Owner:** Frontend Builder.
- **Dependencies:** C0 Phase 1 PASS.
- **Writable paths:** owned `v1/**` paths only; do not create `v1/README.md` or `v1/docs/**`.
- **Actions:** apply Section 7's filtered allowlist copy from external `v1/**` only (never external `v0/**`); leave the external source read-only; derive target `v1/.gitignore` through only the deterministic additions-only sanitation rule; generate non-committed source/destination preservation manifests that both exclude deferred `README.md`, `docs/**`, and transformed root `.gitignore`, plus the separate parent-base root manifest; record the matching preservation aggregate digests, separate source/target `.gitignore` hashes, and exact sanitation diff; execute baseline tests; capture only the synthetic/off-Git visual evidence permitted by Section 7; prove copied preserved files match; identify the authoritative notification action-prefix producer, permissive pagination baseline, exact odd `researchStage` mapping, and other baseline defects for C0 without changing product code.
- **Acceptance checks:** no denied file ever enters the worktree; after deny filtering, source and destination preservation manifests compare empty and their aggregate digests match while omitting only deferred `README.md`, `docs/**`, and transformed root `.gitignore` from otherwise allowlisted paths; the separately hashed `.gitignore` files differ only by missing canonical `*.docx` and `/src/research_studies/` additions in order, with no duplicate or removed/weakened/reordered/edited protection; confidential filename list is not logged; copied style/backend/server/algorithm hashes match; parent-base paths outside `v1/**` have no diff except the three approved plan/contract paths; baseline evidence exists; any source/contract difference is reported rather than resolved silently.
- **Exit gate:** cleanly classified baseline, empty preservation-file comparison, matching preservation aggregate digests, passing separate `.gitignore` hash/diff review, all deny scans PASS, and the complete re-attestation packet are recorded in the frontend handoff/PR evidence and handed to C0. F2 remains blocked until C0 Phase 2 PASS.

### F2 — Convert package, Vite, TypeScript, lint, test bootstrap, and mount point

- **Owner:** Frontend Builder.
- **Dependencies:** F1 and C0 Phase 2 re-attestation PASS for the exact recorded matching preservation manifests/digests and separately reviewed `.gitignore` sanitation delta.
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
- **Actions:** port root async state/lifecycle, manual History API navigation, public home, catalog filtering/sorting, and metadata dialog; preserve framework-neutral API mapping, including the odd `researchStage` mapping without cleanup; retain the contract-approved mark-read correction by unwrapping Laravel's `{ data: notification }` response in `api.ts`; add a small typed frontend helper for the C0-re-attested root-relative supported notification-action prefixes without changing resource fields or backend behavior; make shared repository/notification `links.next` normalization stop unless it yields a non-`//` path beginning exactly `/api/`, and fetch only that path/query.
- **Acceptance checks:** public API fixture, empty response, failure alert, author sort/resource mapping including the unchanged odd `researchStage` behavior, query/filter/sort URL updates, metadata fields, and no source filename exposure all pass. Focused `api.test.ts` cases prove the encoded UUID/request options, raw `{ data: notification }` fixture, exact normalized resource return, unchanged error behavior, accepted supported root-relative action paths, and rejection of absolute/protocol-relative/encoded-bypass/backslash/control-character/unsupported action paths before any navigation sink. Separate focused repository and notification pagination cases each prove a benign absolute API next link becomes a same-origin `/api/...` path/query request and hostile `//host/...`, `/apiary`, `/api`, root-relative non-API, and absolute non-API next links cause no follow-up fetch.
- **Exit gate:** focused public/API tests pass; `/` and `/catalog` satisfy the private synthetic desktop/mobile visual comparison; CSS retains the exact F1 SHA-256 unless the documented selector-only exception gate applies.

### F5 — Port Google auth, dashboard, notifications, and all role workspaces

- **Owner:** Frontend Builder.
- **Dependencies:** F4.
- **Exact paths:** `v1/src/GoogleSignInDialog.vue`, `v1/src/Dashboard.vue`, `v1/src/RoleWorkspaces.vue`, `v1/src/google-identity.d.ts`; delete corresponding `.tsx` files after parity.
- **Actions:** implement GIS lifecycle/retry, typed emits, access states, local dashboard state, notifications, account/logout, shelf/mobile navigation, and all role workspaces. Add full-label accessible names to every shelf control hidden at `<=1100px`; add programmatic read/unread text/relationships that update only after successful mark-read; apply the F4 action-path guard before navigation. These are narrow markup/guard corrections with no visual redesign.
- **Acceptance checks:** missing client ID/error/progress/retry states, synthetic invalid nonempty credential HTTP 500 generic handling with no server detail, active/invited/blocked access, exact notification fields/UUID read route, mark-read consumption of the normalized resource, read/unread semantics before and after single/all success plus failure no-false-update, accepted/rejected action navigation, every responsive shelf control's full accessible name, empty notifications, all role headings, no fabricated records, and checklist update pass.
- **Exit gate:** focused auth/dashboard/role tests, accessibility interaction checks, lint, and `vue-tsc` pass.

### F6 — Port tests, remove React, and complete frontend self-check

- **Owner:** Frontend Builder.
- **Dependencies:** F5.
- **Exact paths:** `v1/src/App.test.ts`, `v1/src/components.test.ts`, `v1/src/api.test.ts`, `v1/src/test/setup.ts`, `v1/vite.config.test.ts`; delete `v1/src/app.test.tsx` and `v1/src/components.test.tsx`.
- **Actions:** port assertions to Testing Library Vue; add focused manual-navigation, dialog, GIS-500 generic-error, responsive shelf-name, notification read/unread, notification action-path, repository/notification pagination normalization, unchanged `researchStage` mapping, and deny-list tests where current coverage is implicit; in `v1/vite.config.test.ts`, replace any copied real manuscript basename with the exact neutral synthetic denied path `/src/research_studies/denied-manuscript.docx`; remove every React package/import/config artifact; rerun post-migration screenshots under the strict synthetic/off-Git controls and perform integrity comparisons.
- **Acceptance checks:** all commands in Section 12 pass; all five approved baseline correction test groups remain present; repository and notification pagination tests cover benign absolute API links and hostile protocol-relative/non-API links; the odd `researchStage` mapping remains unchanged and covered by mapping parity assertions; `vite.config.test.ts` contains the synthetic denied DOCX path and no external corpus basename; no `.tsx`/React residue; `src/styles.css` final SHA-256 equals the recorded F1 hash, or the sole documented selector-only exception has exact evidence and tests; backend/server/algorithm allowed-file hashes remain unchanged; source `.gitignore` still has its frozen hash and target `v1/.gitignore` still has C0's reviewed target hash and exact approved sanitation delta; parent-base paths outside `v1/**` remain unchanged except the three approved plan/contract paths; screenshot comparison has no unexplained visual regressions and no image/metadata leaves the local off-Git temporary directory.
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
- **Actions:** push `feat/react-to-vue3-frontend`; open a child PR to `plan/react-to-vue3`; link Plan PR #5 and both merged contract child PRs; attach evidence mapped to F1–F6. Immediately before V2, fetch and merge the latest plan head into the child with a normal non-force merge, push normally, and record the incorporated plan SHA and resulting child SHA; if already an ancestor, record the no-op and ancestry proof.
- **Exit gate:** child PR contains only owned paths relative to the incorporated latest plan head, exact head is recorded, its ancestry contains C0's re-attested contract commits, and no rebase, reset, or force-push occurred.

### V2 — Exact-commit frontend PR verification and review

- **Owner:** Frontend PR Verification Lead (read-only).
- **Dependencies:** P1.
- **Actions:** verify P1's recorded latest plan SHA is an ancestor of the exact child SHA and remains the current plan head; test that child SHA in a detached worktree and collect independent code, accessibility, and security review findings for Vue lifecycle/reactivity, both re-attested contracts, the five narrow baseline corrections, parity including unchanged odd `researchStage` mapping, dependency removals, security boundaries, and sanitization.
- **Exit gate:** ancestry proof, CI/commands, and reviews are green with no blocking finding. Corrections or a plan-head advance repeat Fix Agent -> V1 -> G1 -> P1 non-force ancestry merge -> V2. No merge occurs within V2.

### M1 — Merge the verified frontend child PR

- **Owner:** Frontend Merge Coordinator.
- **Dependencies:** V2 PASS and the exact reviewed child still contains the latest plan head as an ancestor without an untested head change.
- **Actions:** merge the tested frontend child into `plan/react-to-vue3` using the repository-approved strategy; record child URL, tested head, and resulting merge/squash commit in Plan PR #5.
- **Exit gate:** the tested frontend change is present on the plan branch. Any child- or plan-head update requires a non-force ancestry merge and V1/G1/P1/V2 to repeat before merge.

### D1 — Document Vue setup and migration

- **Owner:** Documentation Agent.
- **Dependencies:** M1.
- **Exact paths:** `v1/README.md`, `v1/docs/migration/react-to-vue3.md` only.
- **Actions:** write Vue/Vite setup and commands; retain Laravel/MariaDB, Google origin, session, admin, legacy server, and non-destructive migration guidance; link the merged/re-attested UI/API contracts; document architecture, manual navigation, matching source freeze preservation digests, separate `.gitignore` source/target hashes and approved sanitation result, excluded data categories, the five intentional narrow frontend baseline corrections, unchanged odd `researchStage` mapping, known invalid-GIS-token 500 residual risk, rollback, and verification. Do not copy the React README verbatim and do not disclose confidential filenames.
- **Acceptance checks:** commands match `package.json`; no React description remains except migration history; the backend GIS defect is not presented as fixed; paths assume execution from `v1`; no secret values or local personal paths appear.
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
- **Actions:** push `docs/react-to-vue3`; open a child PR to `plan/react-to-vue3`; link Plan PR #5, both contract children, and the frontend child; record D2 evidence. Immediately before D5, fetch and merge the latest plan head into the child with a normal non-force merge, push normally, and record the incorporated plan SHA and resulting child SHA; if already an ancestor, record the no-op and ancestry proof.
- **Exit gate:** child PR is open at a known exact head, contains only the two documentation paths relative to the incorporated latest plan head, and has no rebase/reset/force-push ancestry correction.

### D5 — Verify the exact documentation child head

- **Owner:** Documentation PR Verification Lead (read-only).
- **Dependencies:** D4.
- **Actions:** verify D4's recorded latest plan SHA is an ancestor of the exact child SHA and remains the current plan head; repeat D2 commands in a detached exact-head worktree and collect required documentation/security review findings.
- **Exit gate:** ancestry, exact-head tests, and all reviews PASS. Any correction or plan-head advance repeats the non-force ancestry merge and D1/D2/D3/D4/D5 as applicable on the new head.

### D6 — Merge the verified documentation child PR

- **Owner:** Documentation Merge Coordinator.
- **Dependencies:** D5 PASS and the exact reviewed child still contains the latest plan head as an ancestor without an untested head change.
- **Actions:** merge the tested child into `plan/react-to-vue3` with the repository-approved strategy and record the child URL, tested head, and merge/squash commit.
- **Exit gate:** tested documentation is present on the plan branch. Any child- or plan-head update requires a non-force ancestry merge and D5 to rerun.

### V4 — Final combined verification

- **Owner:** Integration Verification Lead (read-only).
- **Dependencies:** C0's two contract merges, M1, and D6 remain present, and no later unreviewed changes exist on the plan branch.
- **Actions:** run Section 12 on exact combined plan head; collect final code/security/accessibility review findings; inspect final tracked files and acceptance checklist; verify each child final review recorded a non-force latest-plan ancestry correction and exact reviewed SHA; verify C0 re-attestation binds the contracts to the F1 matching preservation manifests/digests and separately hashed/approved `.gitignore` sanitation delta, then rerun the sanitation check to prove the final target hash/delta remain unchanged; confirm no external `v0/**` content was copied and no parent-base repository-root path outside `v1/**` changed except the plan and two approved contract documents.
- **Exit gate:** evidence-backed V4 PASS with no unresolved blocking finding, all child ancestry proofs current, and only the documented invalid-GIS-token behavior retained as an accepted residual risk.

### P2 — Complete the parent Plan PR for review

- **Owner:** Parent PR Coordinator.
- **Dependencies:** V4 PASS.
- **Actions:** update Plan PR #5 with all four child PR links and merge commits, exact verification evidence, decisions, checklist state, and residual risks; mark Draft ready for human review only after confirming the tested combined head is still current.
- **Exit gate:** parent checklist and evidence are complete and current. Merge/release still requires separate authorization.

## 11. Acceptance criteria

- [ ] The tracked application exists under `v1/**` and corresponds to one recorded, sanitized authoritative source freeze.
- [ ] No `.env`, credential, dependency tree, build output, runtime data, cache, `*.tsbuildinfo`, DOCX, Forms corpus, research-study corpus, or derived manuscript catalog is tracked.
- [ ] No external `v0/**` file is copied or tracked; external `v0/**` remains reference-only.
- [ ] `docs/design/vue-ui-parity.md` and `docs/contracts/vue-api-data.md` pass their pre-commit and ancestry-corrected exact-child-head gates, merge before F1, and are re-attested by C0 against F1's matching sanitized source/destination preservation manifests and aggregate digests plus the separately reviewed root `.gitignore` sanitation delta before F2.
- [ ] After deny filtering, source and destination preservation manifests omit only deferred `README.md`, deferred `docs/**`, and the intentionally transformed root `.gitignore` from otherwise allowlisted paths; all included entries compare equal and their aggregate digests match.
- [ ] The read-only source and target root `.gitignore` have separate recorded SHA-256 values; the exact deterministic diff adds only missing `*.docx` and `/src/research_studies/` lines in canonical order, without duplicates or any removed, weakened, reordered, or edited source protection, and C0 Phase 2 independently approves that sanitation delta.
- [ ] Parent-base repository-root files outside `v1/**` are unchanged and coexist with the new target, except this plan and the two explicitly approved contract documents.
- [ ] Vue 3 Composition API/TypeScript mounts client-side at `#root`; there is no SSR, router, or Pinia/store dependency.
- [ ] No React runtime, React tooling, React import, JSX/TSX source, `lucide-react`, or Testing Library React dependency remains in `v1`.
- [ ] Icons use `lucide-vue-next`; tests use `@testing-library/vue`; SFC typing is enforced by `vue-tsc`.
- [ ] `/`, `/catalog`, `/app`, query/filter/sort changes, History API behavior, loading/fallback behavior, and scroll behavior match the baseline.
- [ ] Public catalog mapping/pagination, empty/error states, metadata dialog, and sign-in gates match the API/UI contracts.
- [ ] Repository and notification `links.next` pagination fails closed unless normalization yields a path beginning exactly `/api/` and never `//`; benign absolute API links are fetched only as same-origin path/query targets, while protocol-relative and non-API links cause no follow-up fetch.
- [ ] The frozen odd `researchStage` mapping remains exactly unchanged; this migration performs no adjacent mapping cleanup.
- [ ] Mark-read preserves the Laravel wire envelope `{ data: notification }`; `api.ts` unwraps it at the frontend boundary and `api.test.ts` proves the exact normalized `NotificationResource` result and encoded request.
- [ ] Every shelf control whose text hides at `<=1100px` retains its full programmatic accessible name; every notification exposes and correctly updates programmatic read/unread state; focused Testing Library Vue tests cover all controls and single/all/failure transitions.
- [ ] Notification action paths navigate only when root-relative and within the C0-re-attested supported prefix list; focused tests reject absolute, protocol-relative, bypass-encoded, backslash/control-character, and unsupported paths before a navigation sink.
- [ ] Google sign-in, session lookup/logout, active/invited/blocked access, notifications, dialogs, and all ten role workspaces match the baseline.
- [ ] A synthetic invalid nonempty GIS token returning 500 is handled by Vue with only the existing generic failure state and retry behavior; the backend defect remains unchanged and is recorded as residual risk.
- [ ] Keyboard, focus trap/restoration, Escape/backdrop close, accessible names/roles, skip links, responsive layouts, and reduced-motion behavior are preserved.
- [ ] `v1/src/styles.css` final SHA-256 is identical to the F1-frozen source hash, except for one separately documented minimal selector-only Vue compatibility correction with exact hash/diff/reproduction/test evidence and no declaration/value/media-query change.
- [ ] Allowed Laravel backend, legacy server, and Python algorithm files are byte-identical to source; their tests pass without migrations or logic changes.
- [ ] Vue frontend tests, type checking, lint, formatting, production build, Vite corpus denial, backend tests, route listing, and algorithm tests pass on the combined plan head.
- [ ] README and migration documentation describe Vue setup, exclusions, architecture, verification, and rollback accurately.
- [ ] Parent Plan PR links each child PR and contains command/exit-code evidence, decisions, risks, and completed checklists.
- [ ] Before each child's final exact-head review, that child merged the latest plan head non-force (or recorded an already-ancestor no-op), and the reviewed child SHA/plan SHA ancestry proof remains current.

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

Immediately before every final child-head review (contract, frontend, or docs), fetch the plan branch and prove the reviewed child contains its latest head:

```powershell
git fetch origin plan/react-to-vue3
$LatestPlanHead = (git rev-parse origin/plan/react-to-vue3).Trim()
git merge-base --is-ancestor $LatestPlanHead HEAD
if ($LASTEXITCODE -ne 0) { throw "Child must merge latest plan head non-force before final exact-head review" }
Write-Output "reviewed_child=$(git rev-parse HEAD) incorporated_plan=$LatestPlanHead"
```

The PR record must also show the ordinary merge/no-op result and normal push. A rebase, reset, force-push, changed child SHA, or subsequent plan-head advance invalidates the result and requires a new non-force merge plus complete exact-head review.

U2/U5 map `docs/design/vue-ui-parity.md` to every Section 6 UI/accessibility state, including all responsive shelf names, programmatic notification state, path-rejection behavior, GIS-500 generic containment, and synthetic/off-Git screenshot rules. A2/A5 map `docs/contracts/vue-api-data.md` to every Section 5 route and must verify the literal `{ data: notification }` wire envelope, frontend-only unwrapping, exact fields, encoded UUID, root-relative supported-prefix guard/rejection matrix, fail-closed repository/notification pagination normalization, exact preservation of the odd `researchStage` mapping, credentials, errors, the known GIS 500 limitation, and authorization invariants. Pagination contract tests must include benign absolute API next links and hostile protocol-relative/non-API next links with no follow-up fetch. Both documents must say they are provisional until post-F1 C0 re-attestation. Each lane runs the repository-approved secret scanner scoped to its owned file and rejects personal/absolute machine paths, real identities, confidential filenames, or corpus-derived fixture content.

After both child merges, C0 runs:

```powershell
npx prettier --check docs/design/vue-ui-parity.md docs/contracts/vue-api-data.md
git diff --check
$dirty = @(git status --porcelain=v1)
if ($dirty) { $dirty; throw "C0 requires a clean plan worktree" }
```

C0 Phase 1 also compares the exact plan head to the P0 head and requires changes only at the two contract paths plus merge metadata; it records both child URLs, incorporated plan heads, tested heads, and resulting merge/squash commits. A dirty worktree or any additional path blocks F1 branch creation.

C0 Phase 2 must independently reproduce the empty source/destination preservation-manifest comparison and matching aggregate digests after deny filtering, with only deferred `README.md`, deferred `docs/**`, and transformed root `.gitignore` omitted from otherwise allowlisted paths. It must independently calculate the source/target `.gitignore` hashes and approve the minimal deterministic sanitation delta before mapping the frozen source to every UI/API contract row. It must explicitly re-attest the `/research/` prefix or replace it through the affected contract lane with the exact source-supported prefix list, confirm the five approved defect baselines, freeze the odd `researchStage` mapping as unchanged parity behavior, verify the invalid-token 500 classification, and record PASS against the exact frontend worktree head. Any preservation digest drift, source `.gitignore` hash drift, sanitation-delta violation, or contract edit invalidates Phase 2 and blocks F2.

Run this sanitation-delta check locally in F1 and independently in C0 Phase 2; retain the exact diff outside Git and publish only the two hashes and approved added lines:

```powershell
$ExternalSourceRoot = $env:RESEARCHNAV_EXTERNAL_SOURCE
if (-not $ExternalSourceRoot) { throw "Set RESEARCHNAV_EXTERNAL_SOURCE to <external-source-root>" }
$SourceGitignore = Join-Path $ExternalSourceRoot 'v1/.gitignore'
$TargetGitignore = 'v1/.gitignore'
if (-not (Test-Path $SourceGitignore) -or -not (Test-Path $TargetGitignore)) { throw "Source and target .gitignore files are required" }

$SourceGitignoreHash = (Get-FileHash -Algorithm SHA256 $SourceGitignore).Hash.ToLowerInvariant()
$TargetGitignoreHash = (Get-FileHash -Algorithm SHA256 $TargetGitignore).Hash.ToLowerInvariant()
$sourceLines = @(Get-Content $SourceGitignore)
$targetLines = @(Get-Content $TargetGitignore)
$approvedAdditions = @('*.docx', '/src/research_studies/')
$expectedLines = [System.Collections.Generic.List[string]]::new()
$expectedLines.AddRange([string[]]$sourceLines)
foreach ($line in $approvedAdditions) {
  if ($sourceLines -cnotcontains $line) { $expectedLines.Add($line) }
}
if ($targetLines.Count -ne $expectedLines.Count) { throw "Unexpected .gitignore line count" }
for ($i = 0; $i -lt $expectedLines.Count; $i++) {
  if ($targetLines[$i] -cne $expectedLines[$i]) { throw "Unapproved .gitignore sanitation delta at line $($i + 1)" }
}
git diff --no-index -- $SourceGitignore $TargetGitignore
if ($LASTEXITCODE -notin @(0, 1)) { throw "Unable to inspect .gitignore sanitation diff" }
Write-Output "source_gitignore_sha256=$SourceGitignoreHash target_gitignore_sha256=$TargetGitignoreHash"
```

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

The five approved baseline corrections additionally require focused runs equivalent to:

```powershell
npm --prefix v1 test -- src/api.test.ts
npm --prefix v1 test -- src/App.test.ts
```

Required assertions cover: raw `{ data: notification }` to exact nested object normalization; encoded mark-read UUID/options; accepted root-relative source-supported action paths and the complete rejected-path matrix before navigation; repository and notification pagination where benign absolute API next links are reduced to same-origin `/api/...` path/query requests and raw `//host/...`, `/apiary`, `/api`, root-relative non-API, and absolute non-API next links produce no follow-up fetch; exact unchanged odd `researchStage` mapping behavior; accessible names for every shelf control whose text hides at `<=1100px`; programmatic read/unread state before/after successful single and mark-all operations plus no false state on failure; and synthetic invalid-nonempty-GIS-token HTTP 500 handling with only the generic message, retry availability, and no server-detail disclosure.

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

- Compare frozen and final SHA-256 manifests for `v1/src/styles.css`, `v1/backend/**`, `v1/server/**`, and allowed `v1/algorithm/**`; only the destination prefix may differ. `styles.css` hash inequality fails the gate unless the parent PR records the sole minimal selector-only Vue compatibility exception with both hashes, exact selector diff, reproduction, focused test, and proof that declarations, values, custom properties, media queries, and unrelated selectors are byte-identical.
- Recalculate the read-only source and final target `.gitignore` SHA-256 values and rerun the canonical sanitation-delta check. The source hash must equal F1's frozen source hash, the target hash must equal C0's approved target hash, and the line diff must still contain only the approved additions with every source protection intact.
- Inspect `package-lock.json` for expected Vue additions/React removals and run `npm audit --prefix v1 --omit=dev`. Findings are triaged; unrelated legacy server dependency findings are documented rather than fixed by broad unplanned upgrades.
- Confirm API requests retain relative paths, JSON handling, URL encoding, pagination cap, and `credentials: "include"`; mark-read must perform only the approved `{ data: notification }` boundary unwrap. Repository and notification `links.next` values may yield a follow-up request only after normalization to a non-`//` pathname beginning exactly `/api/`; absolute API authorities are discarded, and protocol-relative or non-API targets stop pagination without a request so credentials cannot leave the same-origin API boundary.
- Confirm the odd `researchStage` mapping remains byte-for-behavior equivalent to the F1-frozen source; the fifth correction does not authorize mapping cleanup.
- Confirm notification action values cannot reach navigation until the root-relative supported-prefix validator accepts them, and read/unread semantics update only from successful normalized resources.
- Confirm no `v-html`, dynamic script URL, token logging/storage, localStorage/sessionStorage auth, or client-side role override was introduced.
- Confirm Vite retains default secret/certificate/git deny patterns and actively denies source, algorithm, and Forms corpus paths including encoded or `/@fs/` attempts.
- Confirm all state-changing Laravel requests continue to rely on existing exact-origin middleware and server authorization. The Vue client is not an authorization boundary.
- Confirm screenshot generation used mocked/offline synthetic fixtures, wrote only outside Git/CI/shared artifacts, passed pixel/metadata/text privacy inspection, and published no image or identifying fixture value.

## 13. Risks and controls

| Risk                                                            | Impact                                                     | Control/trigger                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Frontend starts before contracts are reviewed and merged        | Ambiguous parity decisions and rework                      | C0 Phase 1 hard dependency; no F1 branch/worktree until both ancestry-corrected exact-head-tested contract child PRs merge        |
| Provisional contract differs from the F1-frozen source          | Implementation follows stale or conflicting behavior       | F1 preservation digests plus C0 Phase 2 re-attestation; F2 blocks for Plan/contract correction rather than silently choosing      |
| Mark-read wire envelope is treated as a bare resource           | Read action returns the wrong shape and UI state regresses | Record `{ data: notification }` in API contract; normalize only in `api.ts`; focused encoded-route/envelope/result test           |
| Hidden shelf text removes accessible names                      | Controls are unnamed at `<=1100px`                         | Full-label names on every affected control; all-controls Testing Library Vue assertion; no CSS/layout redesign                    |
| Notification state is conveyed only by a dot                    | Read/unread state is unavailable programmatically          | Deterministic accessible state that updates on successful single/all operations; success/failure transition tests                 |
| Untrusted notification action reaches History API               | Broken or unsafe cross-origin/unsupported navigation       | Root-relative C0-re-attested prefix allowlist; rejection matrix and navigation-spy tests                                          |
| Untrusted `links.next` is fetched with credentials              | Credentials or requests cross the same-origin API boundary | Normalize absolute links to path/query only; require exact `/api/` prefix, reject `//` and non-API targets, and test no follow-up |
| Pagination correction is used to clean up `researchStage`       | Unapproved data-mapping semantic change                    | Freeze and test the odd mapping verbatim; any mapping correction requires a separate approved plan amendment                      |
| Untracked source changes during migration                       | Mixed or unreproducible version                            | F1 freeze digest; rerun baseline and restart copy if source digest changes                                                        |
| Confidential corpus, identity, or screenshot data enters Git    | Severe privacy/security incident                           | Filter-before-copy; synthetic mocked/offline captures outside Git/artifacts; metadata/OCR inspection; scans; block PR immediately |
| Vue lifecycle differs from React effects                        | Duplicate requests, stale updates, leaked listeners/timers | Explicit mount/unmount guards; request count and teardown tests; code review                                                      |
| Manual navigation loses query or back behavior                  | User-visible regression                                    | Keep History API contract; tests for push/replace/popstate and encoded queries                                                    |
| Template event/default differences                              | Accidental form submission or missed event                 | Explicit button types, emits, prevent/stop modifiers, interaction tests                                                           |
| Dialog focus regression                                         | Accessibility failure                                      | Port composable first; focused Tab/Shift+Tab/Escape/restoration tests                                                             |
| CSS/DOM drift changes layout                                    | Visual regression                                          | Exact CSS SHA-256 gate; only documented selector-only Vue exception; class/semantic contract; private synthetic visual evidence   |
| GIS callback/script lifecycle regression                        | Sign-in unavailable or repeated initialization             | Single cached loader, retry reset, unmount guard, mocked GIS tests, manual configured-origin smoke test                           |
| Invalid nonempty GIS token returns backend 500                  | Generic error obscures invalid-vs-transient cause          | Known backend defect remains out of scope; Vue generic safe message/retry test; record residual risk rather than alter Laravel    |
| Backend appears broken because runtime prerequisites are absent | False migration diagnosis                                  | Separate frontend and preserved-logic gates; report PHP/DB environment limits exactly; do not edit backend to mask setup issues   |
| Dependency migration introduces vulnerabilities                 | Supply-chain risk                                          | Lockfile review, npm audit triage, no unrelated major upgrades, Security Reviewer gate                                            |
| Large all-at-once frontend diff is hard to review               | Defects hidden in translation                              | Ordered internal task gates F2–F6, exact source-to-target map, focused tests, one coherent owner, no concurrent edits             |
| Documentation leaks local/confidential details                  | Privacy/reproducibility issue                              | Docs use relative paths and aggregate digest/counts only; docs security review                                                    |
| Child review uses stale or rewritten ancestry                   | Exact-head evidence does not match merge candidate         | Merge latest plan head into every child non-force before final review; record both SHAs; invalidate on either head change         |

The transformed target `.gitignore` has a dedicated F1/C0 risk control outside preservation equality: omitting it from either preservation manifest prevents a false byte-equality failure, while separate source/target hashes and an independently reviewed canonical additions-only diff prevent sanitation from weakening or broadening existing protections.

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
- Separate pre-implementation child PRs for `docs/design/vue-ui-parity.md` on `design/vue-ui-contract` and `docs/contracts/vue-api-data.md` on `design/vue-api-contract`; both must merge latest plan head non-force, pass pre-commit/exact-head gates, and merge before F1.
- Vue 3 SFC/Composition API migration with TypeScript.
- Manual History API navigation; no SSR, router, or Pinia.
- `lucide-vue-next`, Testing Library Vue, and `vue-tsc`.
- Frontend parity tests plus unchanged backend/server/algorithm regression gates.
- Frontend-only `api.ts` normalization of Laravel's discovered notification-read `{ data: notification }` envelope, with a focused boundary test.
- Narrow frontend-only baseline corrections for responsive shelf accessible names, programmatic notification read/unread semantics, root-relative supported-prefix validation of notification action paths, and fail-closed repository/notification `links.next` normalization, all with focused tests. Pagination follows benign absolute API links only after reducing them to a same-origin path/query beginning exactly `/api/`; protocol-relative and non-API targets cause no follow-up fetch. These are intentional defect corrections, not broad redesign.
- Exact preservation of the frozen odd `researchStage` mapping; no mapping correction or cleanup is authorized.
- Vue setup, migration, exclusion, and rollback documentation.

## Non-goals

- No feature/broad-redesign/copy/API/schema/database work beyond the five explicitly enumerated frontend baseline defect corrections.
- No change to the existing odd `researchStage` mapping.
- No Laravel, server, or algorithm logic changes.
- No copy or edit of external-reference-only `v0/**`; no change to parent-base root files outside `v1/**` except this plan and the two approved contract documents.
- No credentials, runtime data, generated output, or manuscript/form DOCX corpora.
- No deployment or release in this PR.

## Architecture

The merged UI and API/data documents are provisional through F1. F1 copies the sanitized authoritative external `v1`, records matching source/destination preservation manifests and aggregate digests that exclude deferred `README.md`, deferred `docs/**`, and transformed root `.gitignore`, and separately records source/target `.gitignore` hashes plus the canonical additions-only sanitation delta. C0 Phase 2 independently reviews all of that evidence; only then are the contracts authoritative and F2 may begin. Vue mounts client-side at `#root`. `App.vue` retains root session/repository/path state and manual History API navigation for `/`, `/catalog`, and `/app`. Typed props/emits and local refs replace React state/props; no global store is added. Relative `/api` requests continue through Vite to unchanged Laravel with credentialed database sessions. Pagination accepts `links.next` only after normalization to a non-`//` path beginning exactly `/api/`; absolute API authorities are discarded, while protocol-relative and non-API values trigger no follow-up fetch. Laravel mark-read continues to emit `{ data: notification }`; `api.ts` unwraps that envelope for frontend callers. Notification actions pass a root-relative source-supported prefix guard before navigation. The odd `researchStage` mapping, legacy Express server, and Python algorithm remain unchanged parity/reference behavior.

## Acceptance criteria

- [ ] One sanitized source freeze is recorded by matching preservation aggregate digests and a separate frozen source `.gitignore` hash.
- [ ] No forbidden/confidential/generated/runtime files are tracked.
- [ ] Both contract child PRs incorporate latest plan head non-force, pass exact-head verification, merge before F1, and pass post-F1 C0 re-attestation against matching preservation manifests/digests and the separately reviewed `.gitignore` sanitation delta before F2.
- [ ] After deny filtering, preservation manifests omit only deferred `README.md`, deferred `docs/**`, and transformed root `.gitignore` from otherwise allowlisted paths; included source/target entries and aggregate digests match.
- [ ] Separate source/target `.gitignore` hashes are recorded; its exact diff adds only missing `*.docx` and `/src/research_studies/` lines in order, removes or weakens no protection, and passes independent C0 Phase 2 review.
- [ ] No external `v0/**` content is copied; parent-base root files outside `v1/**` (except the plan/contracts) and backend/server/algorithm logic pass integrity checks.
- [ ] Final `src/styles.css` SHA-256 equals F1, except a fully documented minimal selector-only Vue compatibility exception with no declaration/value/media-query change.
- [ ] Vue 3 Composition API/TypeScript replaces all React/TSX code and dependencies.
- [ ] No SSR, router, Pinia, or other store is introduced.
- [ ] Manual navigation, catalog, auth/access, dialogs, notifications, and ten role workspaces retain parity.
- [ ] API request/response/session/security contracts remain unchanged.
- [ ] Repository and notification pagination tests accept benign absolute API next links only as same-origin `/api/...` path/query requests and prove protocol-relative/non-API next links cause no follow-up fetch.
- [ ] The odd `researchStage` mapping remains exactly unchanged.
- [ ] `api.ts` unwraps the discovered `{ data: notification }` mark-read envelope and `api.test.ts` proves the exact normalized result without a backend change.
- [ ] All responsive shelf controls retain full accessible names; notifications expose and correctly update programmatic read/unread state.
- [ ] Only root-relative C0-re-attested notification action prefixes navigate; unsafe/unsupported forms are tested and rejected before navigation.
- [ ] Invalid nonempty GIS-token HTTP 500 receives only generic Vue handling; backend correction remains out of scope and residual risk is recorded.
- [ ] Accessibility, responsive behavior, fonts, icons, classes, and visual styling retain parity.
- [ ] Frontend, type, lint, format, build, Vite denial, backend, route, and algorithm gates pass.
- [ ] Vue setup/migration/rollback documentation is complete.

## Workstreams

| Workstream                              | Owner                         | Status                                                | Branch                        | Pull request |
| --------------------------------------- | ----------------------------- | ----------------------------------------------------- | ----------------------------- | ------------ |
| Vue UI parity contract                  | Vue UI Contract Author        | [ ] Pending                                           | `design/vue-ui-contract`      |              |
| Vue API/data contract                   | Vue API Contract Author       | [ ] Pending                                           | `design/vue-api-contract`     |              |
| Contract integration/re-attestation     | Contract Integration Tester   | [ ] Phase 1 blocked by both merges; Phase 2 by F1     | read-only exact plan/F1 heads | N/A          |
| Frontend migration + sanitized snapshot | Frontend Builder              | [ ] F1 blocked by C0 Phase 1; F2 by C0 re-attestation | `feat/react-to-vue3-frontend` |              |
| Independent frontend verification       | Frontend PR Verification Lead | [ ] Blocked by frontend child                         | read-only exact child head    | N/A          |
| Documentation                           | Documentation Agent           | [ ] Blocked by frontend merge                         | `docs/react-to-vue3`          |              |
| Final combined verification             | Integration Verification Lead | [ ] Blocked by all child merges                       | read-only exact plan head     | N/A          |

## Verification

- [ ] UI contract pre-commit, exact-head, accessibility, privacy/path, and merge gates pass.
- [ ] API/data contract pre-commit, exact-head, API/security, privacy/path, and merge gates pass.
- [ ] C0 Phase 1 confirms both provisional contracts are on the exact clean plan head before F1; Phase 2 re-attests them against F1 preservation manifests/digests and separately hashed `.gitignore` sanitation delta before F2.
- [ ] Sanitized source/destination preservation manifests match after deny filtering and the three governed otherwise-allowlisted path omissions, and deny scans pass.
- [ ] Source/target `.gitignore` SHA-256 values and the canonical additions-only diff pass F1 and independent C0 Phase 2 review with no removed protection.
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
- [ ] Focused repository and notification pagination assertions for benign absolute API links and hostile `//host`/non-API links with no follow-up fetch
- [ ] Frozen odd `researchStage` mapping parity assertion
- [ ] Focused shelf-name, notification read/unread transition, action-path rejection, and GIS-500 generic-handling assertions
- [ ] Every child incorporates latest plan head non-force before final exact-head review; both SHAs and ancestry proof are recorded
- [ ] Code review
- [ ] Security review
- [ ] Documentation review

## Decisions

- Use Vue 3 SFCs with `<script setup lang="ts">` and Composition API.
- Preserve manual History API navigation and local/root state; do not add router or Pinia.
- Split shared TSX helpers into focused Vue components while preserving classes/semantics.
- Merge independently owned UI and API/data contracts before allowing the frontend lane to start.
- Treat Laravel's `{ data: notification }` mark-read wire shape as frozen and correct parity only at the `api.ts` frontend boundary with a focused test.
- Treat contracts as provisional until F1 records matching sanitized source/destination preservation manifests/digests, separate source/target `.gitignore` hashes, and the canonical additions-only sanitation delta, and C0 re-attests them; block F2 until PASS.
- Intentionally correct only responsive shelf names, programmatic notification state, action-path validation, envelope normalization, and fail-closed repository/notification pagination normalization; do not broaden into redesign.
- Preserve the existing odd `researchStage` mapping exactly; the pagination correction grants no authority for mapping cleanup.
- Require exact CSS hash equality except a documented, tested minimal selector-only Vue compatibility exception.
- Exclude deferred `README.md`, deferred `docs/**`, and transformed root `.gitignore` from both preservation manifests; govern `.gitignore` separately with source/target hashes, exact approved additions, preservation of every existing protection, and C0 Phase 2 review.
- Keep one frontend implementation lane; backend/database lanes are unnecessary because those contracts are frozen after C0 re-attestation.
- Exclude derived `src/research_studies/catalog.json` with the confidential source corpus.

## Risks and assumptions

- The source is untracked; a freeze digest and integrity manifests are mandatory.
- Sanitization must occur before files enter a worktree, not as cleanup afterward.
- The authoritative source `.gitignore` remains read-only; only target `v1/.gitignore` receives the two canonical additions, and it is not part of matching preservation digests.
- Contract child branches have non-overlapping one-file ownership and require independent pre-commit/exact-head gates before merge.
- Any F1 source/contract contradiction blocks implementation for a Plan PR amendment.
- A nonempty invalid GIS token can return 500 from the existing Laravel path; Vue retains generic safe handling and the backend defect remains residual/out of scope.
- Screenshots use only mocked/offline synthetic fixtures outside Git, PR/CI artifacts, shared logs, and external services; no image is uploaded.
- Every child merges latest plan head non-force before final exact-head review; later plan movement invalidates that review.
- Lifecycle, focus, History API, and GIS differences require focused parity tests.
- Credentialed pagination must fail closed: only normalized `/api/` path/query targets may be fetched, never protocol-relative or non-API `links.next` values.
- The odd `researchStage` mapping is intentionally preserved despite its irregularity.
- A baseline failure blocks migration unless explicitly classified and accepted as pre-existing.
- Parent remains Draft until all child PRs, full verification, reviews, and documentation pass.

## Child PR checklist

- [ ] Vue UI contract child linked, exact-head verified, and merged
- [ ] Vue API/data contract child linked, exact-head verified, and merged
- [ ] C0 contract integration evidence linked
- [ ] Post-F1 C0 re-attestation links matching source/destination preservation aggregate digests, separate `.gitignore` source/target hashes, approved sanitation-delta result, and contract mapping
- [ ] Frontend child linked and merged
- [ ] Frontend test/review/security evidence linked
- [ ] Documentation child linked and merged
- [ ] Final combined evidence linked
- [ ] Residual risks/limitations recorded
- [ ] Child latest-plan non-force ancestry corrections and exact reviewed SHAs recorded
- [ ] Parent acceptance checklist complete
```

## 16. Workstream execution checklist

### Plan control plane

- [ ] Independent tester verifies this plan-only diff.
- [ ] Git Steward stages only `docs/plans/react-to-vue3.md` and commits it.
- [ ] PR Coordinator updates Draft Plan PR #5 and records the exact plan head.
- [ ] Both contract worktrees are clean, isolated, non-overlapping, and based on the exact plan head.
- [ ] No F1 branch/worktree is created before C0 Phase 1 PASS; no F2 work starts before post-F1 C0 re-attestation PASS.

### Vue UI contract lane

- [ ] U1 changes only `docs/design/vue-ui-parity.md` on `design/vue-ui-contract`.
- [ ] UI matrix is marked provisional and covers every Section 6 surface/state, all responsive shelf names, notification read/unread transitions/action rejection, GIS-500 generic handling, and strict synthetic/off-Git desktop/mobile evidence method.
- [ ] UI matrix requires exact CSS SHA-256 equality except the documented/tested selector-only compatibility exception.
- [ ] U2 formatting, ownership, accessibility, privacy/path, and secret checks PASS before staging.
- [ ] U3 explicitly stages and commits only the owned path.
- [ ] U4 child PR targets `plan/react-to-vue3`, links Plan PR #5, and records the exact head.
- [ ] Before U5, child merges latest plan head non-force (or records already-ancestor no-op); U5 verifies both SHAs/ancestry and exact-head reviews PASS.
- [ ] U6 merges the tested child and records child URL, tested head, and merge/squash commit.

### Vue API/data contract lane

- [ ] A1 changes only `docs/contracts/vue-api-data.md` on `design/vue-api-contract`.
- [ ] Contract is marked provisional and distinguishes Laravel's `{ data: notification }` wire envelope from the normalized frontend `NotificationResource`.
- [ ] Contract requires focused `api.ts` boundary normalization, encoded-route/envelope/result coverage, root-relative supported-prefix action acceptance/rejection, and fail-closed repository/notification pagination without backend changes.
- [ ] Pagination contract requires benign absolute API links to become same-origin `/api/...` path/query requests and hostile `//host`/non-API paths to cause no follow-up fetch.
- [ ] Contract freezes the odd `researchStage` mapping exactly and authorizes no mapping cleanup.
- [ ] Contract records the invalid-nonempty-GIS-token 500 as a known out-of-scope backend defect with generic Vue handling and residual risk.
- [ ] A2 formatting, ownership, API/security, privacy/path, and secret checks PASS before staging.
- [ ] A3 explicitly stages and commits only the owned path.
- [ ] A4 child PR targets `plan/react-to-vue3`, links Plan PR #5, and records the exact head.
- [ ] Before A5, child merges latest plan head non-force (or records already-ancestor no-op); A5 verifies both SHAs/ancestry and exact-head reviews PASS.
- [ ] A6 merges the tested child and records child URL, tested head, and merge/squash commit.

### Contract integration and re-attestation gate

- [ ] C0 Phase 1 starts from the exact plan head containing both ancestry-corrected contract merges.
- [ ] Phase 1 combined formatting, clean-worktree, ownership, privacy/path, and provisional cross-contract checks PASS.
- [ ] F1 records matching sanitized source/destination preservation manifests and aggregate digests that, after deny filtering, omit only deferred `README.md`, deferred `docs/**`, and transformed root `.gitignore` from otherwise allowlisted paths, plus supported-prefix/baseline evidence.
- [ ] F1 records separate source/target `.gitignore` hashes and an exact canonical additions-only sanitation diff with no duplicate or removed/weakened/reordered/edited protection.
- [ ] C0 Phase 2 independently verifies the preservation-manifest equality and `.gitignore` sanitation delta, then maps both contracts to that exact copy and re-attests all API/UI rows, five approved corrections, unchanged odd `researchStage` mapping, GIS defect classification, and CSS hash.
- [ ] F1 branch/worktree is created only after Phase 1; F2 starts only after Phase 2 PASS.

### Frontend migration lane

- [ ] F1 source freeze preservation digest, source `.gitignore` hash, and baseline evidence recorded.
- [ ] F1 filtered copy and source/destination preservation-manifest comparison plus both matching aggregate digests pass with the three governed otherwise-allowlisted path omissions only.
- [ ] F1 target `.gitignore` hash and deterministic additions-only sanitation diff pass; only missing `*.docx` and `/src/research_studies/` lines were added and every source protection remains intact.
- [ ] F1 confidentiality, secret, and generated/runtime deny checks pass.
- [ ] F2 Vue toolchain/bootstrap gate passes.
- [ ] F3 shared components/focus gate passes.
- [ ] F4 root/public/catalog/API gate passes, including `{ data: notification }` normalization, root-relative supported-prefix action validation, unchanged odd `researchStage` mapping, and repository/notification fail-closed pagination tests.
- [ ] Focused pagination tests accept benign absolute API next links only as same-origin `/api/...` path/query requests and prove hostile `//host` plus root-relative/absolute non-API next links cause no follow-up fetch.
- [ ] F5 GIS/dashboard/notifications/roles gate passes, including all shelf names, read/unread success/failure transitions, rejected action non-navigation, and generic GIS-500 handling.
- [ ] F6 Testing Library Vue port and React removal gate passes.
- [ ] Final CSS SHA-256 equals F1 or the sole selector-only exception has complete evidence; backend/server/algorithm hashes pass.
- [ ] Mocked/offline wholly synthetic desktop/mobile evidence remains only in the inspected off-Git temporary directory; no image/metadata is uploaded.
- [ ] Pre-Commit Tester returns PASS before staging.
- [ ] G1 explicitly stages and commits only frontend-owned `v1` paths.
- [ ] P1 frontend child PR is linked to parent and both contract children.
- [ ] Before V2, frontend child merges latest plan head non-force (or records already-ancestor no-op); V2 verifies both SHAs/ancestry and exact-commit tests/reviews pass.
- [ ] M1 merges the tested frontend child into the plan branch.

### Documentation lane

- [ ] Docs worktree starts from plan head containing frontend merge.
- [ ] `v1/README.md` reflects Vue and retained Laravel/legacy setup.
- [ ] `v1/docs/migration/react-to-vue3.md` records architecture, exclusions, matching preservation digests, separate `.gitignore` hashes/sanitation result, verification, and rollback.
- [ ] Documentation records the five intentional narrow baseline corrections, unchanged odd `researchStage` mapping, and invalid-GIS-token 500 residual risk without claiming a backend fix.
- [ ] Documentation contains no confidential filenames, personal paths, or secrets.
- [ ] D2 pre-commit formatting, ownership, privacy, and command checks PASS before staging.
- [ ] D3 commits only the two documentation paths; D4 opens and links the exact-head child PR.
- [ ] Before D5, docs child merges latest plan head non-force (or records already-ancestor no-op); D5 verifies ancestry/exact-head reviews PASS; D6 merges the tested child.

### Final gate

- [ ] Combined plan head passes all Section 12 commands.
- [ ] Combined tracked-file, secret, corpus, React, and integrity scans pass.
- [ ] Final source/target `.gitignore` hashes and canonical sanitation delta still equal the C0 Phase 2 reviewed evidence.
- [ ] Final code and security reviews have no blocking findings.
- [ ] C0 re-attestation and every child's latest-plan ancestry proof/exact reviewed SHA remain current.
- [ ] Known invalid-GIS-token backend 500 is documented as the accepted residual risk with tested generic Vue containment.
- [ ] Parent PR links both contract, frontend, and documentation child PRs plus exact verification evidence.
- [ ] Acceptance criteria and residual-risk records are complete.
- [ ] PR Coordinator marks parent ready for human review; no merge/release without authorization.

## 17. Entry and exit gates summary

### Freeze and implementation entry gates

- Plan PR #5 is Draft, updated, and accessible.
- Plan branch/worktree/base are verified.
- Both one-file contract child PRs merged latest plan head non-force, passed pre-commit and exact-head ancestry gates, and are merged into the plan branch.
- C0 Phase 1 passed on the exact clean plan head, with contract child URLs, incorporated plan SHAs, tested child SHAs, and merge commits recorded.
- Frontend worktree is isolated, clean, and based on that exact C0 Phase 1 plan head; only F1 is initially authorized.
- F1 copied the sanitized authoritative source and recorded matching source/destination preservation manifests and aggregate digests that, after deny filtering, omitted only deferred `README.md`, deferred `docs/**`, and transformed root `.gitignore` from otherwise allowlisted paths, without source drift.
- F1 separately recorded source/target `.gitignore` hashes and the exact canonical additions-only sanitation delta with no removed or weakened protection.
- C0 Phase 2 independently verified the matching preservation evidence and `.gitignore` sanitation delta, re-attested both provisional contracts against that exact F1 copy, and recorded PASS; only then is F2 implementation authorized.
- Source remains read-only and F1 sanitization rules are understood.
- Ownership table has no concurrent writable overlap.

### Implementation exit gate

- Both contract, frontend, and docs child PRs are merged into the plan branch through tested commits.
- All acceptance criteria and full verification/security/integrity gates pass on exact combined head.
- No denied/confidential file or out-of-scope change is present.
- Every child incorporated latest plan head non-force before final exact-head review, and each recorded ancestry proof remains current.
- The five narrow frontend baseline corrections are tested without broad redesign; pagination preserves the credentialed same-origin `/api/` boundary; the odd `researchStage` mapping is unchanged; CSS satisfies exact-hash/selector-only-exception governance.
- The invalid-nonempty-GIS-token backend 500 remains unchanged, has tested generic Vue containment, and is recorded as residual risk.
- Parent PR checklist, decisions, evidence, links, and residual risks are current.
- Parent is ready for human review, not automatically merged or released.
