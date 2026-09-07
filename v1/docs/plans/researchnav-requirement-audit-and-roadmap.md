# ResearchNAV Requirement Audit and Recovery Roadmap

## Document status

- **Artifact:** canonical planning document only; no product implementation is authorized by this file.
- **Evidence date:** 2026-09-05.
- **Repository / checkout:** `D:\ResearchNav\v1`, inside repository `D:\ResearchNav`.
- **Observed branch / HEAD:** `chore/researchnav-current-baseline` at `d6b742a`.
- **Baseline condition:** a read-only status snapshot observed an extensive dirty state, including widespread modified/deleted paths and many untracked paths (including artifacts outside `v1/`). This confirms the checkout is unreproducible; the exact staged/unstaged/untracked/ignored inventory, diffs, provenance, and secret-artifact disposition remain **pending T00**.
- **Existing GitHub control plane:** Draft PR [#8](https://github.com/MilliXPlorer/researchnav/pull/8), `plan/frontend-completion` -> `chore/researchnav-current-baseline`, is frontend-only and names baseline `d6b742a`. It must not be treated as evidence that this dirty checkout is reproducible. PRs #9 and #10 are referenced by #8 as open contract-document children; their merge/check state must be revalidated before reuse.
- **Scope boundary:** active React/Laravel/Python system only. `server/` is legacy Express/PostgreSQL reference and is excluded from implementation, migration, and release work.

## Objective

Recover a reproducible baseline without losing user data, resolve the database and authentication release blockers, align cross-layer contracts, and complete role workspaces in the user's established order:

1. Audit
2. Shared crashes/contracts
3. Researcher
4. Research Instructor
5. Research Adviser
6. Statistician
7. Research Panelist
8. Research Coordinator
9. Research Office
10. Librarian
11. Administrator
12. Guest/Public
13. Responsive/accessibility cleanup
14. Final role-navigation audit

The role order applies after the P0 baseline, migration, and institution-domain safety gates. Safety blockers may not be deferred behind UI work.

## Evidence rules and classification legend

This audit describes code present in the dirty checkout, not a tested release. Historical claims in `docs/REQUIREMENTS.md`, `docs/GANTT_GAP_ANALYSIS.md`, `backend/DATABASE_SCHEMA.md`, and `docs/DATABASE_CONSOLIDATION_ROLLOUT.md` are evidence only where current code agrees. Latest backend-suite evidence, run with `backend/` as the working directory, is **269 passed, 1 failed, 1 skipped**. The failure is `Tests\Feature\Database\CanonicalResearchSchemaTest::test_workflow_review_roles_and_unique_keys_are_migrated`: it still expects the removed `class_section_members_section_user_unique` unique index rather than the `000047` `section_document_user_unique` index. The suite is therefore not release-clean.

| Classification             | Meaning in this audit                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fully implemented**      | Frontend/backend or required single-layer behavior is present with relevant tests in the tree; current execution still needs baseline verification. |
| **Partially implemented**  | A usable portion exists, but required behavior, coverage, or integration is incomplete.                                                             |
| **Frontend only**          | UI behavior exists without an equivalent authoritative server contract, or it operates only on a client-side subset.                                |
| **Backend only**           | Server endpoints/data behavior exist but the intended actor cannot complete the flow in the UI.                                                     |
| **Implemented but broken** | Both intent and substantial code exist, but a confirmed contract/runtime/data defect prevents safe use.                                             |
| **Missing**                | No implementation was found.                                                                                                                        |
| **Needs clarification**    | Product, security, data, or deployment policy is required before implementation can safely proceed.                                                 |

## Stack and current-state summary

```text
Public HTTPS origin
  -> frontend/server.mjs: Express 5 gateway + Vite 6 SSR
  -> React 19 + TypeScript 5.7 hydration and role workspaces
  -> same-origin /api proxy (not an authorization boundary)
  -> Laravel 13 / PHP 8.3 API
  -> MariaDB runtime + database sessions + private local storage
  -> bounded Python workers for TF-IDF/cosine and manuscript extraction

Legacy reference only: server/ (Express 5 + PostgreSQL)
```

- Root npm workspaces are `frontend` and legacy `server`; root scripts start React SSR and Laravel, while legacy Express is opt-in.
- Laravel owns identity, authorization, validation, workflow, persistence, audit logging, and private-file access. The SSR gateway proxies methods, bodies, cookies, origins, statuses, and streams.
- The public repository is sessionless for browse/detail/similarity. Authenticated downloads pass through Laravel authorization and audit logging.
- Python is a child-process boundary. Weighted TF-IDF/cosine is authoritative; FastText is optional supporting context. Manuscript extraction supports PDF/DOCX with bounded input/output.
- Current Laravel tests default to in-memory SQLite. That does **not** reproduce the post-`000045` MariaDB schema because `000045` deliberately retains typed source tables on SQLite and drops them on MariaDB.
- Documentation still describes 44 migrations/29 tables and, in places, typed tables as authoritative. The tree now contains migrations through `000047` and code that dynamically uses consolidated tables when typed tables are absent.

## Critical blockers

### Blocker B0 — dirty, unreproducible baseline and competing plan lineage

No implementation worktree may be created from the current checkout until a Git steward records HEAD, all staged/unstaged/untracked paths, ignored-secret checks, and test results. PR #8 is frontend-only and based on a named earlier commit; it cannot authorize cross-stack database/authentication changes. Preserve the checkout byte-for-byte, do not reset/clean/stash it destructively, and do not merge or close #8 without explicit authorization.

### Blocker B1 — migration `2026_09_04_000045_finalize_v2_consolidated_tables.php`

`000045` is release-blocking until proven safe on MariaDB:

- It copies seven review types plus monitoring/audit, then drops ten typed tables on non-SQLite databases.
- It drops `retention_logs` and `privacy_logs` without backfilling their historical rows in `000041` or `000045`; `ConsolidationShadowService` also has no retention/privacy mirror methods. Historical data can be lost.
- `INSERT IGNORE` can preserve an older shadow row without proving field parity. The existing parity command compares counts/missing keys, not every field.
- The consolidated schema does not preserve all typed uniqueness/check semantics (for example evaluation/document/panelist, methodology/document/statistician, revision sequence, and score bounds).
- SQLite retains source tables, so the normal PHPUnit suite exercises a materially different model/table path.
- `down()` is intentionally irreversible; rollback means restoring a verified backup, not `migrate:rollback`.

**Control:** no valuable database may run `000045` until T01 passes the fresh, pre-cutover-upgrade, and already-consolidated recovery matrices below.

### Blocker B2 — migration `2026_09_04_000046_add_legacy_id_sequences.php`

`000046` is coupled to `000045` and is not independently releasable:

- It initializes retention/privacy sequences from consolidated streams that may be empty because their history was not copied.
- Its consolidated-only parity check verifies only positive sequence values, not `next_id = MAX(source_id) + 1` for every type/stream.
- `LegacyIdAllocator` fails hard when a row is absent, and runtime behavior under concurrent creation needs MariaDB coverage.
- It conditionally drops `audit_logs` based on absence of `revisions`, coupling unrelated table state and obscuring recovery behavior.

**Control:** freeze `000045`/`000046`; first inventory where they have run. If any durable environment has applied them, preserve migration names and use additive repair plus restore/reconciliation. If none has, the data owner may approve a pre-release correction strategy. The decision and checksums must be recorded before code changes.

### Blocker B3 — institution domains

`GoogleClientVerifier` verifies token audience and returns subject/email/`email_verified`, but `GoogleIdentity` does not carry `hd`, and `ApiController::google` creates/resolves a blocked account for any verified Google email. No `GOOGLE_ALLOWED_DOMAINS` setting exists.

The following are **Needs clarification** and block implementation: exact accepted domain(s), whether Google Workspace `hd` is mandatory, handling of aliases/subdomains, whether pre-provisioned external addresses are ever allowed, and the response/audit policy for denial. Safe default: require a lower-cased exact allowlisted `hd` **and** matching email domain before account creation or session regeneration; deny consumer Gmail and emit no account-discovery detail.

### Blocker B4 — route-contract drift repaired; broader contract freeze pending

The backend contract is evidenced by `backend/routes/web.php`. The following frontend path mismatches were repaired in the current dirty baseline:

| Surface                | Previous frontend call                                           | Canonical backend/frontend route                                                 | Result                              |
| ---------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| Statistician mutations | `/api/statistician/queue/{id}/checklist`, `/sign-off`, `/return` | `PUT /api/statistician/methodology/{id}`, `POST .../sign-off`, `POST .../return` | repaired and independently verified |
| Research Office        | `/api/research-office/*`                                         | `/api/office/*`                                                                  | repaired and independently verified |
| Librarian catalog      | `/api/librarian/repository-catalog`                              | `/api/librarian/catalog`                                                         | repaired and independently verified |

Use the backend route names as canonical unless the API contract owner approves a versioned change. Do not add aliases merely to make incorrect client tests pass. Add cross-layer path tests, and ensure demo fallback never converts 404/405/401/403/429 or malformed 2xx responses into apparently valid data.

Verification evidence: `frontend/src/api.ts`, `frontend/src/api.test.ts`, and `frontend/src/RoleSidebarPages.test.tsx` pass 54 focused tests, Prettier, ESLint, TypeScript checks, client and SSR builds, Laravel route comparison, deprecated-alias scanning, and a scoped security scan. Response-shape, pagination, fallback, and consolidated-MariaDB contracts remain open under T03/T04.

### Blocker B5 — public-download evidence contradicts stale documentation

Current implementation evidence (`CatalogPage.tsx`, `api.ts`, `PublicRepositoryController.php`, and `DocumentFilePolicy.php`) indicates that catalog browsing is sessionless but final-manuscript download is available only to a signed-in active account through an authorized, audited Laravel stream. In contrast, stale `docs/GANTT_GAP_ANALYSIS.md` says no public/**authenticated** archive-paper download endpoint exists and lists a “public download endpoint” as a gap, while `docs/REQUIREMENTS.md:183` says repository visitors cannot download archived manuscripts. This is an implementation-versus-documentation contradiction, not evidence to make files publicly downloadable.

**Control:** retain authenticated, authorized download as the safe current contract. T14 must execute the guest/active/inactive/unauthorized/object-status download matrix, record the product owner’s intended access policy, and update the stale documentation only after the tested contract is accepted. Do not add an anonymous download endpoint merely to satisfy the stale gap analysis.

### Blocker B6 — high-severity Composer dependency advisory

`league/commonmark` `2.9.1` has the high-severity advisory `PKSA-zyf5-hrxv-hrd7`. This is a P0 dependency remediation gate, not a documentation-only finding or an acceptable release exception.

**Control:** after T00 establishes the approved clean baseline, the Backend Security & API Builder must select and lock a compatible non-vulnerable resolution, run the backend Composer audit, Pint, and Laravel suite from `backend/`, and record the exact lockfile and advisory result. T16 and release approval are blocked until the audit no longer reports `PKSA-zyf5-hrxv-hrd7` and the dependency-change tests pass.

## Requirement audit — cross-cutting subsystems

Every row includes implementation, files, tables, gap/security disposition, recommendation, priority, and dependency.

| ID / grouped requirement                                                     | Classification             | Current implementation                                                                                                                                                                                               | Relevant files                                                                                                                                                                                                                                   | DB tables                                                                                              | Gaps                                                                                                                                                                                                                                   | Security concerns                                                                                                                        | Recommended change                                                                                                                                                                                          | Priority | Dependencies               |
| ---------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| SYS-1 Active SSR/gateway/API architecture                                    | **Fully implemented**      | React SSR/hydration is served by Express and proxies `/api` to Laravel; root scripts exclude legacy API by default.                                                                                                  | `package.json`; `frontend/package.json`; `frontend/server.mjs`; `frontend/src/entry-server.tsx`; `README.md`                                                                                                                                     | `sessions` for Laravel sessions; otherwise N/A                                                         | Production reverse-proxy/runtime smoke is not evidenced in this checkout.                                                                                                                                                              | Only the SSR origin should be public; Laravel and private storage must remain private.                                                   | Retain architecture; add exact gateway cookie/body/stream/timeout smoke checks to integration.                                                                                                              | P1       | T00, T14                   |
| SYS-2 Baseline and PR reproducibility                                        | **Needs clarification**    | Read-only inspection observed `chore/researchnav-current-baseline` at `d6b742a` with an extensive dirty state (widespread modified/deleted and untracked paths). PR #8 is Draft, frontend-only, and names `d6b742a`. | `.git/HEAD`; `.git/config`; PR #8; entire dirty checkout                                                                                                                                                                                         | All                                                                                                    | Exact staged/unstaged/untracked/ignored inventory, diff, and provenance remain pending.                                                                                                                                                | Unreviewed code/secrets or generated artifacts could be snapshotted or lost.                                                             | Run T00 forensic inventory; create no implementation branch until an approved clean SHA is reproducible. Reconcile #8/#9/#10 without blind cherry-picks.                                                    | P0       | Entry approval             |
| AUTH-1 Google SSO, session, profile, and blocked-account/access-request flow | **Partially implemented**  | Audience and verified-email checks, database session regeneration/logout, profile APIs, blocked defaults, access requests, and provisioning are present.                                                             | `backend/app/Services/GoogleClientVerifier.php`; `backend/app/Data/GoogleIdentity.php`; `backend/app/Http/Controllers/ApiController.php`; `backend/routes/web.php`; `frontend/src/GoogleSignInDialog.tsx`; `frontend/src/AccessRequestPanel.tsx` | `users`, `user_roles`, `sessions`, `access_requests`, `activity_logs`/`audit_logs`                     | Institution-domain policy is absent; frontend copy still says “Gmail.”                                                                                                                                                                 | Any verified Google account causes persistent account creation; denial ordering must avoid account enumeration.                          | Implement AUTH-2 first, then update neutral institutional copy and negative tests.                                                                                                                          | P0       | Domain decision, T00, T02  |
| AUTH-2 Institution-domain allowlist                                          | **Missing**                | No hosted-domain field or allowlist configuration was found.                                                                                                                                                         | `backend/app/Services/GoogleClientVerifier.php`; `backend/app/Data/GoogleIdentity.php`; `backend/config/services.php`; `backend/.env.example`                                                                                                    | Prefer no new table; `users` only after successful policy                                              | Exact institution domains and exception policy unknown.                                                                                                                                                                                | `hd` alone is not sufficient if email-domain consistency is not checked; logging raw tokens is prohibited.                               | Add exact normalized allowlist, validate verified payload before account lookup/create/session mutation, return generic 401/403 contract, audit only safe metadata, document rotation.                      | P0       | B3 decision, T02           |
| RBAC-1 Role and object authorization                                         | **Fully implemented**      | Active-account, active-admin, role, office-authority, owner, assignment-scoped reviewer/read-only specialist checks and a broad matrix test exist.                                                                   | `backend/bootstrap/app.php`; `backend/routes/web.php`; `backend/app/Services/DomainAuthorization.php`; `backend/tests/Feature/RoleAccessMatrixTest.php`; `docs/ROLE_PERMISSION_MATRIX.md`                                                        | `users`, `user_roles`, `research_review_assignments`                                                   | Post-consolidation MariaDB behavior and every mutable-entity policy are not fully demonstrated.                                                                                                                                        | Canonical `research_office` maps compatibility roles; authority must continue to depend on legacy persona, not only canonical slug.      | Preserve server-side checks; rerun role × route × object matrix on consolidated MariaDB and add missing policies only where they reduce duplicated checks without changing authority.                       | P0       | T01, T02, T14              |
| DB-1 Consolidated reviews/activity cutover                                   | **Implemented but broken** | Expand/shadow migrations, adapters, dynamic models, final table-drop migration, and sequence allocator exist.                                                                                                        | migrations `000041`–`000046`; `ConsolidatedReviewModel.php`; `ConsolidatedActivityModel.php`; `ConsolidationShadowService.php`; `ConsolidatedReadAdapter.php`; `LegacyIdAllocator.php`; `CheckConsolidationParity.php`                           | Typed review/activity tables; `research_review_records`, `activity_logs`, `legacy_id_sequences`        | Retention/privacy history omission; field parity and invariant loss; SQLite/MariaDB divergence; irreversible cutover; `MethodologyReviewService::updateOrCreate` uses legacy `statistician_id` as a query key on consolidated storage. | Data loss, duplicate decisions/evaluations, invalid scores/statuses, wrong route binding IDs, and audit/privacy retention failure.       | Execute T01: deployment inventory, backup/restore rehearsal, row-level parity, conditional constraints, query-key remediation, MariaDB upgrade tests, and additive recovery.                                | P0       | T00, data-owner decision   |
| DB-2 Section/title membership migration `000047`                             | **Needs clarification**    | Adds nullable `research_document_id`, replaces section/user uniqueness with section/document/user uniqueness, and cascades document deletion.                                                                        | `backend/database/migrations/2026_09_04_000047_add_title_memberships_to_section_members.php`; `InstructorController.php`; `ClassSectionService.php`                                                                                              | `class_section_members`, `class_sections`, `research_documents`, `users`                               | Meaning of existing section-level rows with null document and uniqueness of multiple null-document memberships on MariaDB need migration evidence; schema docs are stale.                                                              | Cascade deletion changes retention semantics; duplicate/null memberships may widen record visibility if queries are wrong.               | Define section roster versus title-group membership explicitly; test upgraded data, null uniqueness, authorization, and rollback on a disposable copy before release.                                       | P0       | T01, product/data decision |
| DATA-1 Schema/setup/requirements documentation                               | **Partially implemented**  | Extensive schema, rollout, role, requirement, and similarity docs exist.                                                                                                                                             | `backend/DATABASE_SCHEMA.md`; `backend/DATABASE_SETUP.md`; `docs/REQUIREMENTS.md`; `docs/GANTT_GAP_ANALYSIS.md`; `docs/DATABASE_CONSOLIDATION_ROLLOUT.md`                                                                                        | Documentation references all application tables                                                        | Counts and authority statements conflict with migrations `000045`–`000047`; rollout says both “source tables remain” and later “consolidated-only.”                                                                                    | Incorrect runbooks can trigger irreversible migration/data loss.                                                                         | Update only after T01 establishes actual supported schemas and migration state; include backup/restore and no-`migrate:fresh` warnings.                                                                     | P0       | T01, T13                   |
| SIM-1 Title/content similarity and search workers                            | **Fully implemented**      | Bounded Python protocol, weighted TF-IDF/cosine policy, public query, persisted internal checks, deterministic latest-per-pair reads, and manuscript projection are present with PHP/Python tests.                   | `backend/app/Services/Similarity*`; `backend/app/Services/similarity/`; `backend/app/Services/Manuscript*`; `docs/SIMILARITY_*`; related tests                                                                                                   | `research_documents`, `similarity_results`, `manuscript_search_documents`, `document_files`            | Production MariaDB FULLTEXT and worker binary/model availability are unknown.                                                                                                                                                          | Private manuscript text and paths must not leak; parser needs OS/container isolation; similarity must not automate approval.             | Preserve human-decision separation; add production-compatible FULLTEXT/worker smoke and malformed/timeout checks.                                                                                           | P1       | T00, T14                   |
| FILE-1 Private manuscripts, versioning, preview/download, deletion outbox    | **Fully implemented**      | Private disk, UUID storage names, MIME/size checks, version rows, authorized stream/preview, catalog download audit, and retryable pending deletion exist.                                                           | `DocumentService.php`; `PrivateDocumentFileResolver.php`; `DocumentFileController.php`; `PublicRepositoryController.php`; `config/filesystems.php`; file tests                                                                                   | `document_files`, `pending_private_file_deletions`, `research_documents`, `activity_logs`/`audit_logs` | Production ACL/encryption/backups and outbox scheduling are unknown.                                                                                                                                                                   | Path traversal, symlink/source substitution, content sniffing, orphaned private files, and IDOR remain operational risks.                | Retain server streaming; add deployment ACL/encryption check, `nosniff`, scheduled outbox drain, and restore test.                                                                                          | P1       | T01, T14                   |
| UI-1 Demo/read-only fallback contract                                        | **Implemented but broken** | Researcher dashboard/detail/activity/submission fallbacks are visibly labeled and disable writes. `isResearcherMockEligible(error, true)` nevertheless permits 404 fallback.                                         | `frontend/src/researcherMockData.ts`; `Dashboard.tsx`; `ResearcherResearchWorkspace.tsx`; `ResearchActivity.tsx`; `RoleSidebarPages.tsx`; PR #8                                                                                                  | N/A                                                                                                    | Current behavior conflicts with PR #8’s stated “no 404/405 fallback” rule and can hide missing endpoints.                                                                                                                              | Synthetic personal/research data can be mistaken for authoritative data; fallback must never bypass auth or enable URL downloads/writes. | Restrict fallback to network/status 0 and explicitly approved 5xx GET failures; reject 401/403/404/405/409/422/429, malformed 2xx, mutations, downloads, and successful empties; add provenance assertions. | P0       | T00, T03, T04              |

## Requirement audit — actors and workspaces

### Public guest and authenticated catalog visitor

| ID / grouped requirement                                     | Classification        | Current implementation                                                                                                                                                                        | Relevant files                                                                                                                        | DB tables                                                                                                         | Gaps                                                                                                                                                                                           | Security concerns                                                                                                                                 | Recommended change                                                                                                                                                                                 | Priority | Dependencies                     |
| ------------------------------------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------- |
| PUB-1 Browse/detail/literal retrieval/title-similarity       | **Fully implemented** | Sessionless public scope requires approved/archived + archived + public; metadata/detail and rate-limited title similarity exist. Literal metadata/body retrieval is implemented server-side. | `PublicRepositoryController.php`; `PublicRepositoryService.php`; `PublicRepositorySimilarityService.php`; `CatalogPage.tsx`; `api.ts` | `research_documents`, `research_authors`, `categories`, `similarity_results`, `manuscript_search_documents`       | UI search primarily invokes similarity POST rather than exposing literal/relevance modes distinctly.                                                                                           | Public responses must exclude private IDs, paths, body text, checksums, deleted/draft/registered-only records; proxy IP trust affects throttling. | Keep explicit “similarity” versus “catalog retrieval” semantics and test public-resource field allowlists and trusted-proxy rate keys.                                                             | P1       | T03, T11, T14                    |
| PUB-2 Institute filter, selectable sort, and full pagination | **Frontend only**     | Institute and sort controls operate locally over the records currently loaded; year/category use server filters.                                                                              | `frontend/src/CatalogPage.tsx`; `frontend/src/api.ts`; `frontend/src/data.ts`                                                         | UI reads `research_documents.academic_unit/institution_name`, `categories`; no server contract for institute/sort | Local filtering/sorting can cover only the fetched page; frontend discards paginator navigation, so counts/results may be incomplete.                                                          | Client-side filtering is not an authorization boundary, but incomplete results can misrepresent repository holdings.                              | Add validated server `institute`/academic-unit and sort parameters, preserve paginator metadata, and make URL state/server results authoritative. Clarify institution vs academic-unit vocabulary. | P2       | T11, product vocabulary decision |
| PUB-3 Authenticated archived-manuscript download             | **Fully implemented** | Signed-in active accounts receive an audited final-manuscript stream; guests receive sign-in affordance.                                                                                      | `CatalogPage.tsx`; `api.ts`; `PublicRepositoryController.php`; `DocumentFilePolicy.php`                                               | `research_documents`, `document_files`, `users`, `activity_logs`/`audit_logs`                                     | Deployment/storage smoke is unknown, while stale `docs/GANTT_GAP_ANALYSIS.md` and `docs/REQUIREMENTS.md:183` say no archive-manuscript download is implemented and call for a public endpoint. | Never expose direct paths; inactive accounts and non-public/non-archived records must remain denied even with guessed IDs.                        | Treat B5 as a documentation/contract decision: test guest versus active-account access, retain authenticated streaming unless policy changes, then correct both stale documents.                   | P1       | T14, B5                          |

### Researcher

| ID / grouped requirement                                           | Classification            | Current implementation                                                                                                                                 | Relevant files                                                                                                                                          | DB tables                                                                                                                                                  | Gaps                                                                                                                                                                                          | Security concerns                                                                                                               | Recommended change                                                                                             | Priority | Dependencies |
| ------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- | ------------ |
| RES-1 Dashboard, drafts, authors, files, submit/edit               | **Fully implemented**     | Owner-scoped dashboard, paginated submissions, draft create/edit, ordered authors, file upload, save/submit, dirty guards, and status filtering exist. | `RoleWorkspaces.tsx`; `RoleSidebarPages.tsx`; `ResearcherResearchWorkspace.tsx`; `ResearchController.php`; `ResearchService.php`; `DocumentService.php` | `research_documents`, `research_authors`, `document_files`, `categories`, `monitoring_logs`/`activity_logs`, `audit_logs`/`activity_logs`                  | Baseline tests must be reproduced; submission completeness currently requires title/category/author, not necessarily a manuscript. Product requirement for mandatory initial file is unknown. | Owner/role lock reauthorization and upload validation must survive consolidated runtime; mock fallback must not enable actions. | Reverify end-to-end; clarify mandatory-file rule rather than silently strengthening it; remove 404 fallback.   | P1       | T01–T04, T05 |
| RES-2 Similarity, related studies, title-validation status         | **Partially implemented** | Query and record similarity, persisted history/latest related studies, validation lists, notifications, and visual scores exist.                       | `SimilarityResults.tsx`; `ResearcherResearchWorkspace.tsx`; `SimilarityController.php`; `TitleValidationController.php`; services                       | `similarity_results`, `title_validations` or `research_review_records`, `notifications`, `research_documents`                                              | End-to-end distinction among similarity, recommendation, and final workflow decision needs UX verification after consolidation.                                                               | Researchers must not alter trusted results or reviewer identity; synthetic fallback must never show as live.                    | Add authoritative status/provenance labels and consolidated MariaDB flow tests; keep human decisions separate. | P1       | T01, T05     |
| RES-3 Feedback acknowledgement, revision upload/resubmit, timeline | **Fully implemented**     | Owner can read redacted activity, acknowledge/address feedback, upload revised manuscript after request, and resubmit latest unresolved revision.      | `ResearchActivity.tsx`; `ResearcherResearchWorkspace.tsx`; `FeedbackService.php`; `RevisionService.php`; tests                                          | `feedback_comments`/`research_review_records`, `revisions`/`research_review_records`, `document_files`, `monitoring_logs`/`activity_logs`, `notifications` | MariaDB consolidated path is unverified and depends on legacy ID allocation.                                                                                                                  | IDs and reviewer actor data must remain redacted for researchers; race/duplicate revision constraints must be retained.         | Gate on T01 row/constraint/concurrency tests, then run researcher acceptance suite.                            | P0       | T01, T05     |

### Research Instructor

| ID / grouped requirement                                         | Classification            | Current implementation                                                                                                | Relevant files                                                                                                                              | DB tables                                                                                                                                                   | Gaps                                                                                                                                                                                              | Security concerns                                                                                                                            | Recommended change                                                                                                                             | Priority | Dependencies |
| ---------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ |
| INS-1 Sections, roster/title membership, document assignment     | **Partially implemented** | Section create/update, member add/remove, available/document assignment, and per-document member APIs/UI are present. | `RoleSidebarPages.tsx`; `api.ts`; `InstructorController.php`; `ClassSectionService.php`; routes; section tests                              | `class_sections`, `class_section_members`, `research_documents`, `users`                                                                                    | `000047` semantics and upgraded rows are unresolved; schema docs describe the older membership shape.                                                                                             | Instructor ownership, cross-section IDOR, duplicate/null memberships, and cascade behavior need MariaDB checks.                              | Resolve DB-2, then verify all modal controls, duplicate handling, and assigned-only visibility.                                                | P0       | T01, T06     |
| INS-2 Title proposals, assigned review, similarity/class reports | **Partially implemented** | Assigned submissions/title proposals, overview/reports, dashboard cards, and reviewer record UI exist.                | `InstructorResearchReview.tsx`; `RoleSidebarPages.tsx`; `DashboardController.php`; `InstructorController.php`; `TitleValidationService.php` | `research_review_assignments`, `research_documents`, `similarity_results`, `title_validations`/`research_review_records`, feedback/revision/activity tables | Primary Title Proposals uses generic dashboard rather than the dedicated sidebar branch; exact recommendation/workflow semantics and all intended filters/bulk exports are incomplete or unknown. | Active assignment must be checked on every read/mutation; recommendation must not transition workflow; validator identity is server-derived. | Choose one canonical Title Proposals surface, remove unreachable duplicate composition, retain assignment checks, and test no status mutation. | P1       | T03–T06      |

### Research Adviser

| ID / grouped requirement                                  | Classification            | Current implementation                                                                                                                    | Relevant files                                                                                                       | DB tables                                                                                                                               | Gaps                                                                                                                      | Security concerns                                                                 | Recommended change                                                                                                 | Priority | Dependencies  |
| --------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- | ------------- |
| ADV-1 Advisees, pending reviews, alerts, feedback/history | **Partially implemented** | APIs and sidebar pages exist; primary Pending Reviews renders generic assigned-review dashboard with deep links and reviewer controls.    | `RoleSidebarPages.tsx`; `InstructorResearchReview.tsx`; `AdviserController.php`; `DashboardController.php`; `api.ts` | `research_review_assignments`, `research_documents`, `similarity_results`, feedback/revision/validation/activity tables                 | `listAdviserPendingReviews` is not used by a dedicated page; flagged-first compare UX from design is not fully evidenced. | Cross-advisee IDOR and inactive assignment revocation must be immediate.          | Consolidate the primary queue, verify flagged ordering/record reads, and add negative assignment-revocation tests. | P1       | T01, T03, T07 |
| ADV-2 Human feedback/revision/title recommendation        | **Fully implemented**     | Assigned adviser/instructor can comment, request revision, and record advisory title recommendations; final approval remains office-only. | `FeedbackService.php`; `RevisionService.php`; `TitleValidationService.php`; policies and tests                       | `research_review_assignments`, `research_review_records` or typed review tables, `research_documents`, `notifications`, `activity_logs` | Consolidated constraints/runtime still block release.                                                                     | No self-approval or direct final status change; similarity cannot decide outcome. | Preserve authority boundary and prove it in MariaDB + frontend network assertions.                                 | P0       | T01, T07      |

### Statistician

| ID / grouped requirement                                         | Classification             | Current implementation                                                                                                                                                                                                       | Relevant files                                                                                                                                                 | DB tables                                                                                                                                            | Gaps                                                                                                                       | Security concerns                                                                                                                    | Recommended change                                                                                                                                  | Priority | Dependencies  |
| ---------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| STA-1 Assigned queue, checklist, clarification, sign-off/history | **Implemented but broken** | Backend routes/services and frontend checklist/history exist. Frontend mutation paths use `/queue/...`; backend uses `/methodology/...`. Consolidated runtime lookup also uses legacy `statistician_id` in `updateOrCreate`. | `frontend/src/api.ts`; `RoleSidebarPages.tsx`; `backend/routes/web.php`; `StatisticianController.php`; `MethodologyReviewService.php`; `MethodologyReview.php` | `methodology_reviews` before cutover; `research_review_records` + `legacy_id_sequences` after cutover; `research_review_assignments`, activity/audit | Confirmed 404 mutations plus likely unknown-column failure after MariaDB cutover; normal SQLite tests can miss the latter. | Only assigned statistician may read/write; sign-off must not independently approve/archive; duplicate sign-offs must be constrained. | Correct client paths to canonical backend, map consolidated query keys, restore uniqueness/status constraints, and add exact route + MariaDB tests. | P0       | T01, T03, T08 |

### Research Panelist

| ID / grouped requirement                                          | Classification            | Current implementation                                                                                | Relevant files                                                                                                             | DB tables                                                                                                                         | Gaps                                                                                                                               | Security concerns                                                                                            | Recommended change                                                                                                        | Priority | Dependencies |
| ----------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ |
| PAN-1 Schedule, assigned manuscript read, one evaluation, history | **Partially implemented** | Assignment/schedule/evaluation/history APIs and evaluation UI exist; deep-linked record is read-only. | `RoleSidebarPages.tsx`; `RoleWorkspaces.tsx`; `PanelController.php`; `EvaluationService.php`; `DefenseScheduleService.php` | `defense_schedules`, `evaluations` or `research_review_records`, `research_review_assignments`, `document_files`, `activity_logs` | Consolidated table lacks the typed DB unique/check guarantees; read-only manuscript viewer behavior needs integrated verification. | Assignment IDOR, score bounds, duplicate concurrent submissions, and accidental reviewer mutation authority. | Reinstate DB invariants and test assignment revocation, concurrent duplicate submit, score bounds, read/download-only UI. | P0       | T01, T09     |

### Research Coordinator

| ID / grouped requirement                                                                           | Classification        | Current implementation                                                                                                     | Relevant files                                                                                                               | DB tables                                                                                                                                                    | Gaps                                                                                                                      | Security concerns                                                                                             | Recommended change                                                                     | Priority | Dependencies  |
| -------------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- | ------------- |
| COO-1 Program overview, schedules, duplicate flags, adviser load, reports, instructor provisioning | **Fully implemented** | Dedicated routes, reporting/service queries, UI pages, and dashboard counts exist. Coordinator is denied office authority. | `CoordinatorWorkspaceController.php`; `ReportingService.php`; `ApiController.php`; `RoleSidebarPages.tsx`; role matrix/tests | `users`, `research_documents`, `defense_schedules`, `similarity_results`, `research_review_assignments`, evaluation/methodology consolidated or typed tables | Full-stack reproducibility and export/reminder/escalation actions from the design are not evidenced and may be non-goals. | Coordinator’s canonical role mapping must never grant office access; provisioning must enforce domain policy. | Reverify after AUTH-2/T01; clarify optional exports/reminders before adding endpoints. | P1       | T01, T02, T10 |

### Research Office

| ID / grouped requirement                                        | Classification             | Current implementation                                                                                                                                                                                    | Relevant files                                                                                                                     | DB tables                                                                                                                                         | Gaps                                                                                                                                                                       | Security concerns                                                                                                                 | Recommended change                                                                                                                                          | Priority | Dependencies               |
| --------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| OFF-1 Compliance, users/access, reports, privacy logs           | **Implemented but broken** | Backend `/api/office/*` is protected by `office.authority`; frontend pages call `/api/research-office/*`. Primary Compliance Review currently renders a generic dashboard rather than the checklist page. | `frontend/src/api.ts`; `RoleSidebarPages.tsx`; `Dashboard.tsx`; `backend/routes/web.php`; `ResearchOfficeController.php`; services | `compliance_reviews` or `research_review_records`, `users`, `privacy_logs` or `activity_logs`, `research_documents`, `audit_logs`/`activity_logs` | Confirmed 404s; no dedicated compliance dispatch; privacy history is at risk in `000045`.                                                                                  | Office authority must exclude coordinator/academics; account changes and privacy events require audit integrity; no 404 fallback. | Correct client prefix, provide canonical compliance workspace, recover privacy data, and test compatibility-role denial plus actor-safe outputs.            | P0       | T01, T03, T11              |
| OFF-2 Final approval/archive/visibility and reviewer assignment | **Fully implemented**      | Office/admin-only final approval, archive, visibility, final-file support, and reviewer replacement exist in generic research APIs/services.                                                              | `ResearchService.php`; `ReviewAssignmentService.php`; `DocumentService.php`; routes; admin/reviewer UI                             | `research_documents`, `research_review_assignments`, `document_files`, review/activity/audit tables                                               | Librarian-versus-office publication ownership conflicts with design prose; `pending_archiving` transition semantics are not represented in `ResearchService::TRANSITIONS`. | Premature publication, self-approval, hidden compatibility-role authority, and public exposure of non-final files.                | Keep office/admin authority until product owner resolves LIB-2; specify whether `pending_archiving` is derived or a transition and add state-machine tests. | P0       | T01, product decision, T11 |

### Librarian

| ID / grouped requirement                            | Classification             | Current implementation                                                                                                                                         | Relevant files                                                                                                                           | DB tables                                                                                                                | Gaps                                                                                                                                                       | Security concerns                                                                                         | Recommended change                                                                                                                                                                      | Priority    | Dependencies                       |
| --------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------- |
| LIB-1 Queue/catalog, metadata review, retention log | **Implemented but broken** | Queue/dashboard, metadata checklist, retention logging, and catalog UI/backend exist. Catalog client calls `/repository-catalog`; backend route is `/catalog`. | `frontend/src/api.ts`; `RoleSidebarPages.tsx`; `LibrarianController.php`; `MetadataReviewService.php`; `RetentionLogService.php`; routes | `research_documents`, `categories`, `metadata_reviews` or `research_review_records`, `retention_logs` or `activity_logs` | Confirmed catalog 404; retention history can be lost in `000045`; consolidated metadata response omits `metadata_completeness` while frontend requires it. | Librarian must not gain office archive/account authority; retention logs must be append-only and durable. | Correct route; make source/consolidated response shapes identical; recover retention data and test immutable actor-scoped logging.                                                      | P0          | T01, T03, T12                      |
| LIB-2 Publish/unpublish ownership                   | **Needs clarification**    | Design says librarian owns final publish; current routes/services permit only research office/admin to archive, and librarian has no publish endpoint.         | `researchnav-design.md`; `docs/ROLE_PERMISSION_MATRIX.md`; `backend/routes/web.php`; `ResearchService.php`; `LibrarianController.php`    | `research_documents`, `metadata_reviews`/`research_review_records`, `document_files`, activity/audit                     | Requirements conflict; no safe default to widen authority.                                                                                                 | Granting publish could expose private manuscripts; unpublish and retention/legal rules are undefined.     | Product/security owner must choose: keep office archive authority with librarian readiness sign-off, or define a narrowly scoped librarian publish policy and two-person prerequisites. | P0 decision | T00 decision before any LIB-2 code |

### Administrator

| ID / grouped requirement                                                                   | Classification        | Current implementation                                                                                                                 | Relevant files                                                                                                                             | DB tables                                                                                            | Gaps                                                                                                                | Security concerns                                                                                                      | Recommended change                                                                                                                                    | Priority | Dependencies  |
| ------------------------------------------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| ADM-1 Bootstrap, access requests, users/coordinators, audit, status, full research console | **Fully implemented** | Active canonical admin checks, idempotent bootstrap tests, account safety rules, audit/status pages, and broad research console exist. | `AdminSidebarPages.tsx`; `AdminResearchWorkspace.tsx`; `AdminController.php`; `ApiController.php`; `AdminUserService.php`; bootstrap/tests | `users`, `user_roles`, `access_requests`, `audit_logs`/`activity_logs`, all research/workflow tables | “System Settings” displays status rather than mutable settings; naming is misleading. Audit history depends on T01. | Last-admin/self-mutation protections, immutable audit, domain policy, and no secret/config values in status responses. | Rename nav to System Status unless settings are explicitly required; reverify bootstrap role_id, audit recovery, and full-access negative boundaries. | P1       | T01, T02, T12 |

### Academics compatibility persona

| ID / grouped requirement                                               | Classification   | Current implementation                                                                                                                                                                                | Relevant files                                                                                               | DB tables                                                                                | Gaps                                                                                                                             | Security concerns                                                                                                                        | Recommended change                                                                                                                           | Priority | Dependencies                         |
| ---------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------ |
| ACA-1 Search/save, My Library remove/list, categories, recommendations | **Backend only** | Backend library CRUD/recommendations/categories exist; frontend Search can save and Browse by Category works, but primary My Library shows dashboard counts with no item list/remove/recommendations. | `AcademicsController.php`; `SavedLibraryService.php`; `RoleSidebarPages.tsx`; `RoleWorkspaces.tsx`; `api.ts` | `saved_library_items`, `research_documents`, `similarity_results`, `categories`, `users` | Intended My Library workflow is incomplete; role is a compatibility persona mapped canonically to research office identity only. | Recommendations must include only visible catalog records; academics must never inherit office authority; deletion must be owner-scoped. | Add a live My Library page using existing APIs, remove action, and recommendation list; test public/registered visibility and office denial. | P2       | T01, T13 (after required role order) |

## Decisions required before implementation

| Decision                                                                                      | Owner                          | Safe default / recommendation                                                                                                                          | Gate                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Exact institution domain(s), aliases/subdomains, and external-account exceptions              | Product owner + Security owner | Exact lowercase allowlist; require matching verified `hd` and email suffix; no consumer Gmail; no exception without explicit provisioned-policy design | Blocks T02 and release               |
| Whether `000045`/`000046` ran in any durable/shared environment                               | Data owner                     | Treat as deployed until migration ledger + backup evidence proves otherwise; do not rewrite migration history blindly                                  | Blocks T01 remediation strategy      |
| Authoritative database to preserve (`researchnav_v1`, `researchnav_db`, hosted DB, or others) | Data owner                     | Preserve all; designate one source only after row/hash comparison                                                                                      | Blocks cutover                       |
| Librarian publish authority                                                                   | Product owner + Security owner | Keep office/admin archive mutation; librarian records readiness only                                                                                   | Blocks LIB-2 only                    |
| Section roster vs per-document/title membership semantics                                     | Product owner + Data owner     | Keep distinct concepts; do not infer null-row meaning                                                                                                  | Blocks `000047` release              |
| Mandatory manuscript at first submission                                                      | Product owner                  | Keep current title/category/author minimum until explicitly changed                                                                                    | Blocks only requirement tightening   |
| Public-download access policy and stale Gantt/Requirements claims                             | Product owner + Security owner | Keep authenticated, authorized, audited downloads; do not introduce anonymous file access based on stale documentation                                 | Blocks B5/T14 documentation closure  |
| PR #8 disposition                                                                             | Repository owner               | Keep Draft and unmerged as evidence; use no implementation commit until rebased/revalidated. Close/supersede only with explicit authorization.         | Blocks frontend integration topology |

## Executable dependency graph

```text
E0 approvals + preserve dirty checkout
 -> T00 baseline forensics and reproducible clean SHA
      -> T00D Composer dependency remediation ---------------------+
      -> T01 database migration/data recovery --------------------+
      -> T02 institution-domain enforcement ----------------------+--> T03 contract freeze
      -> T03 route/response/fallback contract freeze <------------+
                                                                  |
T01 + T02 + T03 -> T04 shared crash/route/fallback fixes          |
  -> T05 Researcher                                                |
  -> T06 Research Instructor                                       |
  -> T07 Research Adviser                                          |
  -> T08 Statistician                                              |
  -> T09 Research Panelist                                         |
  -> T10 Research Coordinator                                      |
  -> T11 Research Office                                           |
  -> T12 Librarian                                                  |
  -> T13 Administrator (+ Academics compatibility closure)         |
  -> T14A Guest/Public backend contract                             |
  -> T14B Guest/Public frontend                                    |
  -> T15 responsive/accessibility cleanup                          |
T00D + T01–T15 -> T16 integration test                              |
      -> T16R code review                                           |
      -> T16S security review                                       |
  -> T17A documentation -> T17B checklist/Plan PR evidence         |
  -> X0 exit approval
```

T01 and T02 may run in parallel only after T00, in their isolated worktrees, with the exclusive paths below. Frontend actor tasks T04–T15 are deliberately sequential in one frontend worktree because `api.ts`, `RoleSidebarPages.tsx`, `RoleWorkspaces.tsx`, `Dashboard.tsx`, and shared tests/styles overlap heavily.

## Workstream ownership and isolated worktrees

Future worktrees are proposals, not actions taken by this plan. Create them only from the approved clean baseline/plan SHA. Never create them from a copied dirty directory, and never share an index.

| Workstream                        | Sole owner                     | Proposed branch                                  | Proposed worktree                                         | Exclusive file ownership                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------ | ------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan/checklist coordination       | Plan Coordinator               | `plan/researchnav-requirement-audit-and-roadmap` | `D:\ResearchNav\.worktrees\researchnav-roadmap-plan`      | `v1/docs/plans/researchnav-requirement-audit-and-roadmap.md` and parent PR body only                                                                                                                                                                                                                                                                                                                       |
| Baseline forensics                | Git/Repository Steward         | `chore/researchnav-audited-baseline`             | `D:\ResearchNav\.worktrees\researchnav-audited-baseline`  | Git metadata/reports only; no product files                                                                                                                                                                                                                                                                                                                                                                |
| Database consolidation/recovery   | Database Builder               | `fix/researchnav-consolidation-safety`           | `D:\ResearchNav\.worktrees\researchnav-db-safety`         | `v1/backend/database/migrations/`; `v1/backend/app/Console/Commands/CheckConsolidationParity.php`; `v1/backend/app/Models/Consolidated*`; typed review/activity model files; `ConsolidationShadowService.php`; `ConsolidatedReadAdapter.php`; `LegacyIdAllocator.php`; `MethodologyReviewService.php`; new `v1/backend/tests/Feature/Database/Consolidation*`; `v1/docs/DATABASE_CONSOLIDATION_ROLLOUT.md` |
| Backend auth/contracts/repository | Backend Security & API Builder | `fix/researchnav-auth-api-contracts`             | `D:\ResearchNav\.worktrees\researchnav-backend-contracts` | `v1/backend/composer.json`; `v1/backend/composer.lock`; `v1/backend/app/Contracts/`; `app/Data/GoogleIdentity.php`; `GoogleClientVerifier.php`; auth/account/API controllers and middleware; `config/services.php`; `config/researchnav.php`; `routes/web.php`; public repository controller/service; `backend/.env.example`; new auth/route/repository tests. Explicitly excludes Database Builder paths. |
| Ordered frontend completion       | Frontend Builder               | `feat/researchnav-ordered-frontend`              | `D:\ResearchNav\.worktrees\researchnav-frontend`          | Entire `v1/frontend/` tree, including frontend tests/config. No backend edits.                                                                                                                                                                                                                                                                                                                             |
| Documentation synchronization     | Documentation Owner            | `docs/researchnav-current-contracts`             | `D:\ResearchNav\.worktrees\researchnav-docs`              | `v1/README.md`; `v1/backend/README.md`; `v1/backend/DATABASE_SCHEMA.md`; `v1/backend/DATABASE_SETUP.md`; `v1/docs/REQUIREMENTS.md`; `v1/docs/GANTT_GAP_ANALYSIS.md`; `v1/docs/ROLE_PERMISSION_MATRIX.md`. Excludes this plan and consolidation rollout doc.                                                                                                                                                |
| Integration verification          | Integration Tester             | `integration/researchnav-roadmap`                | `D:\ResearchNav\.worktrees\researchnav-integration`       | Read-only. Findings return to the sole owning workstream; no direct fixes.                                                                                                                                                                                                                                                                                                                                 |
| Code review                       | Code Reviewer                  | exact PR SHAs                                    | no mutating worktree                                      | Read-only; no file ownership                                                                                                                                                                                                                                                                                                                                                                               |
| Security review                   | Security Reviewer              | exact PR SHAs                                    | no mutating worktree                                      | Read-only; no file ownership                                                                                                                                                                                                                                                                                                                                                                               |

If an unlisted file is required, work stops until the Plan Coordinator assigns it to exactly one owner. Ownership is global for this roadmap, not merely per concurrent moment.

## Ordered small phases and acceptance gates

### Phase 0 — Audit and recover a reproducible baseline

**T00 — Baseline forensics** — Owner: Git/Repository Steward; depends on E0.

1. Record branch, HEAD, upstream, worktrees, status, staged/unstaged diffs, untracked/ignored files, submodules, LFS, and remotes without modifying the checkout.
2. Scan tracked and candidate files for `.env`, keys, tokens, private manuscripts, local databases, archives, logs, caches, and build output. Do not print secret values.
3. Compare dirty paths with PR #8 baseline `d6b742a`, PR #8 head, and PR #9/#10 heads; identify provenance per path. No blind stash/reset/clean/copy/cherry-pick.
4. On owner approval, reproduce intended changes in a clean isolated branch, then run baseline checks before any implementation branch is cut.

**Acceptance:** one approved clean SHA; `git status --short` empty in its worktree; exact source/provenance manifest; no secret/private artifact tracked; baseline install/build/test results recorded; PR #8 disposition recorded.

**T00D — Composer dependency remediation** — Owner: Backend Security & API Builder; depends on T00.

1. Resolved high-severity `league/commonmark` `2.9.1` advisory `PKSA-zyf5-hrxv-hrd7` by updating the transitive lock entry to the minimum fixed compatible version, `2.10.0`; `composer.json` did not require a constraint change.
2. From `backend/`, Composer audit, repository-wide Pint, and the Laravel suite pass. `CanonicalResearchSchemaTest` now verifies migration `000047`'s `research_document_id` column, supporting index, foreign key actions, and section/document/user unique key.

**Acceptance evidence:** `composer audit` reports no advisories; `composer validate --strict` passes; Pint passes for 286 files; the focused schema suite passes with 11 tests and 120 assertions; and the full Laravel suite passes with 271 tests, 3,519 assertions, and one environment-specific Windows symlink skip. The scoped repair changes only `backend/composer.lock` and `backend/tests/Feature/Database/CanonicalResearchSchemaTest.php`; no production migration was changed.

**T01 — Database preservation and consolidation repair** — Owner: Database Builder; depends on T00 and data decisions.

1. Inventory migration ledgers and table/row counts for every database; take logical backups plus file-storage manifest and SHA-256; prove restore into isolated databases.
2. Create representative pre-`000041` MariaDB upgrade fixture with every review/activity type, retention/privacy history, null actors/files, high IDs, duplicate-attempt races, and orphan checks.
3. Prove row-by-row field parity, not counts only. Add retention/privacy copy/recovery and sequence max+1 checks. Never use `INSERT IGNORE` as parity proof.
4. Restore typed invariants in consolidated storage (conditional uniqueness/checks/status/score bounds), correct consolidated query keys and route binding, and verify idempotent retry/failure behavior.
5. Test three states: fresh empty MariaDB; typed pre-cutover upgrade; already-consolidated database needing additive recovery. SQLite remains a fast suite but cannot satisfy this gate.
6. Resolve `000047` null/uniqueness/cascade semantics with migration tests and a preservation report.

**Acceptance:** backup restore succeeds; source-to-target hashes/fields match for every type/stream; retention/privacy history preserved or explicitly recovered from backup; no orphans; `next_id` exact; concurrent writes cannot violate typed invariants; fresh and upgrade migrations pass on MariaDB; failed cutover leaves restorable source; no `migrate:fresh` used on preserved data.

**T02 — Institution-domain policy** — Owner: Backend Security & API Builder; depends on T00 and approved domains.

Implement the server-side domain contract before account resolution/session mutation, then align frontend copy in T04.

**Acceptance:** valid allowlisted `hd` + matching verified email succeeds; absent/wrong/mixed-case/trailing-dot/subdomain/consumer-domain cases follow the approved exact policy; denied identity creates no user/session; no token appears in logs; pre-existing disallowed account behavior is specified and tested; configuration fails closed in production.

**T03 — Freeze API/data/error contracts** — Owner: Backend Security & API Builder; depends on T01/T02 contract outcomes. Frontend Builder reviews read-only.

Publish an executable route inventory for statistician, office, librarian, pagination envelopes, consolidated response parity, and fallback eligibility. Keep `/api/statistician/methodology/*`, `/api/office/*`, and `/api/librarian/catalog` canonical.

**Acceptance:** Laravel route tests and frontend URL expectations agree exactly; source/consolidated responses are field-equivalent; 404/405 are contract failures, never fallback triggers; role/IDOR negatives are included.

### Phase 1 — Shared crashes and contract fixes

**T04 — Shared frontend contract/fallback correction** — Owner: Frontend Builder; depends on T01–T03.

Correct the three confirmed paths, paginator unwrapping, shared error handling, unreachable/blank composition, and strict read-only fallback eligibility before actor-specific work.

**Acceptance:** no visible nav renders `null`; exact path/method/body tests pass; malformed envelopes fail visibly; 401/403/404/405/409/422/429 never fallback; no mutation/download/similarity POST fallback; successful empty stays empty; demo state is labeled/anonymized/read-only.

### Phases 2–12 — actor completion in mandated order

| Task / phase                                          | Owner                          | Depends on       | Small scope                                                                                   | Acceptance check                                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------ | ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T05 Researcher                                        | Frontend Builder               | T04              | Dashboard, submissions, detail, files, similarity, feedback, revisions, notifications         | Owner-only flows; live/mock provenance; create/edit/upload/submit and revised upload/resubmit; no stale actor data; all states useful                                                              |
| T06 Research Instructor                               | Frontend Builder               | T05, T01         | Sections/title membership, canonical proposal queue, reviewer-safe detail                     | Section/document/member IDOR negatives; no duplicate/null corruption; recommendation does not transition status                                                                                    |
| T07 Research Adviser                                  | Frontend Builder               | T06              | Canonical pending queue, advisees, alerts, feedback history                                   | Assignment revocation immediately denies; flagged ordering/compare behavior verified; final approval unavailable                                                                                   |
| T08 Statistician                                      | Frontend Builder               | T07, T01/T03     | Queue/checklist/clarification/sign-off/history                                                | Canonical `/methodology` paths; one constrained record per document/statistician; no workflow approval; consolidated MariaDB passes                                                                |
| T09 Research Panelist                                 | Frontend Builder               | T08, T01         | Schedule/read-only manuscript/evaluation/history                                              | Assigned-only read; one bounded evaluation under concurrency; no reviewer mutations; private download authorized                                                                                   |
| T10 Research Coordinator                              | Frontend Builder               | T09, T02         | Overview/schedules/flags/load/accounts/reports                                                | All live; provisioning obeys domain policy; coordinator denied every office route; optional unsupported actions not invented                                                                       |
| T11 Research Office                                   | Frontend Builder               | T10, T01/T03     | Dedicated compliance, users, reports, privacy, final workflow links                           | Canonical `/office`; compliance mutation and privacy history work; coordinator/academics 403; archive preconditions enforced                                                                       |
| T12 Librarian                                         | Frontend Builder               | T11, T01/T03     | Queue/catalog/metadata/retention; no publish widening without decision                        | Canonical `/catalog`; metadata shape parity; retention immutable/preserved; publish authority follows approved decision only                                                                       |
| T13 Administrator (+ Academics compatibility closure) | Frontend Builder               | T12, T01/T02     | Admin live pages/status; Academics library/list/remove/recommendations                        | Last-admin/self guards; safe status output; audit available; academics owner scope and office denial; rename misleading Settings if unchanged                                                      |
| T14A Guest/Public backend                             | Backend Security & API Builder | T13, B5 decision | Validated filters/sort/pagination, public resource allowlist, authenticated download contract | Public-scope privacy matrix; guest/active/inactive/unauthorized/status download matrix; authoritative paginator totals; rate limit/proxy checks; no session on public reads                        |
| T14B Guest/Public frontend                            | Frontend Builder               | T14A             | Distinct catalog/similarity modes, server-backed filters/sort/pagination, download states     | Complete result navigation and counts; gateway streamed authenticated download; no client-only subset filtering; useful error/empty states; stale public-download docs reconciled after acceptance |

### Phase 13 — responsive and accessibility cleanup

**T15** — Owner: Frontend Builder; depends on T14B.

Verify 320/375/768/1024/1440 px layouts, keyboard-only navigation, focus trap/restore, skip link, reduced motion, table-to-card behavior, error/status announcements, visible focus, and no color-only similarity state.

**Acceptance:** axe/manual matrix has no blocking WCAG 2.2 AA finding; every role’s longest table/form is usable without hidden actions or horizontal page overflow; SSR and hydrated DOM remain equivalent.

### Phase 14 — final integration, documentation, and release gate

**T16** — Owner: Integration Tester; depends on T00D, T01–T13, T14A, T14B, and T15 merged into an isolated integration branch.

Run all commands below at exact SHAs; execute role × nav × account-state × object-scope matrix; rerun the clean Composer audit/Pint gate; run fresh/upgrade/recovery MariaDB scenarios; smoke SSR/gateway/Python/private downloads. Findings return to owning workstreams through the full pre-commit loop.

**T16R — Code review** — Owner: Code Reviewer; depends on T16 PASS. Review the exact integration SHA read-only; findings return to the owning builder.

**T16S — Security review** — Owner: Security Reviewer; depends on T16 PASS. Review auth, authorization, migration/data privacy, files, gateway, fallback, dependencies, and configuration at the exact integration SHA; findings return to the owning builder.

**T17A — Documentation synchronization** — Owner: Documentation Owner; depends on T16, T16R, and T16S PASS. Synchronize schema/setup/requirements/security/operations docs to tested behavior without editing this plan.

**T17B — Plan evidence synchronization** — Owner: Plan Coordinator; depends on T17A. Attach command/SHA evidence and update only this persistent checklist and the parent PR body; mark only evidenced checkboxes.

## Migration and data-preservation controls

1. **Inventory before mutation:** record server/version, database name, migration ledger, table schemas, row counts, max IDs, FK/unique/check definitions, and private-file manifest for every environment.
2. **Back up both data and files:** logical MariaDB dump with routines/triggers/events as applicable, migration table, and private-storage manifest. Store encrypted with access controls; record SHA-256 and timestamp. A backup is not accepted until restored and sampled/hash-compared.
3. **Never run destructive convenience commands:** no `migrate:fresh`, `db:wipe`, table drop, reset/clean, or rollback against data that must be preserved. `000045` rollback is restore-only.
4. **Disposable rehearsal first:** fresh, pre-cutover, and already-consolidated tests use separately named databases and copied private storage. Never point tests at the source database.
5. **Field parity:** compare all mapped fields, timestamps (microseconds), nulls, actor/file/similarity references, status/type, and source IDs for revisions, title validations, feedback, evaluations, methodology, compliance, metadata, monitoring, audit, retention, and privacy.
6. **Invariant parity:** prove former typed unique/check/FK behavior in consolidated storage, including concurrent attempts. Application checks alone do not replace database constraints.
7. **Sequence parity:** for every review type and activity stream, require exactly one sequence row and `next_id = COALESCE(MAX(source_id), 0) + 1`; test transaction rollback and concurrent allocation.
8. **Dual-write/cutover:** if source tables remain anywhere, freeze writes or use transactionally verified dual writes during comparison. Do not drop source tables in the same release that first proves read parity unless the data owner explicitly signs off.
9. **Recovery:** for databases already past `000045`, compare backup/source database (`researchnav_db` is described as local rollback) against consolidated rows, apply idempotent additive recovery, and preserve an exception report. Never fabricate missing privacy/retention history.
10. **Release evidence:** attach backup hashes, restore result, before/after counts and field hashes, orphan/duplicate checks, migration timings, exact app SHA, and signed data-owner approval.

## Test commands

Run from `D:\ResearchNav\v1` unless noted. Record command, exact SHA, exit code, skipped tests, environment, and concise output. All direct Composer and Pint commands below set `backend/` as their working directory; direct Artisan commands enter `backend/` first. `npm run test:backend` is the valid root wrapper for `composer --working-dir=backend test`, and `npm run start:api` is the valid root wrapper whose script invokes `php backend/artisan serve`. These are planned commands unless explicitly identified as observed evidence.

### Baseline/install and static checks

```powershell
npm ci
composer --working-dir=backend install --no-interaction
composer --working-dir=backend exec pint -- --test
npm run format:check
npm run lint
npm run build
git diff --check
```

**Observed backend-suite evidence:** run from `backend/`, the Laravel suite completed with **269 passed, 1 failed, 1 skipped**. The failure is `Tests\Feature\Database\CanonicalResearchSchemaTest::test_workflow_review_roles_and_unique_keys_are_migrated`, which expects the removed `class_section_members_section_user_unique` unique index rather than `000047`’s `section_document_user_unique`. Record it as the T01 schema/migration failure; do not misreport the suite as passing or blocked by vendor dependencies.

### T00 path-only sensitive-artifact and dependency scans

Run these from the repository checkout. They intentionally print only path names or public dependency/advisory metadata, never matching secret text. Preserve the resulting path report as T00 evidence; review any hit through an approved restricted channel.

```powershell
$repo = git rev-parse --show-toplevel
$sensitivePathPattern = '(?i)(^|/)(\.env(?:\..*)?|.*\.(pem|key|p12|pfx|jks|kdb|sqlite|sqlite3|db|bak|dump|sql|zip|rar|7z)|id_rsa|id_ed25519)$'
$visiblePaths = @(git -C $repo ls-files; git -C $repo ls-files --others --exclude-standard)
$ignoredSensitivePaths = git -C $repo ls-files --others --ignored --exclude-standard | Where-Object { $_ -match $sensitivePathPattern }
$paths = @($visiblePaths; $ignoredSensitivePaths) | Sort-Object -Unique
$paths | Where-Object { $_ -match $sensitivePathPattern }
$secretPattern = '(?i)(-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----|(?:api[_-]?key|secret|token|password)\s*[:=]\s*[^\s]{8,}|AKIA[0-9A-Z]{16})'
$paths | Where-Object { Test-Path -LiteralPath (Join-Path $repo $_) -PathType Leaf } | ForEach-Object { if (rg --pcre2 --quiet --text -- $secretPattern (Join-Path $repo $_)) { $_ } }
npm audit --workspaces --omit=dev --audit-level=high
composer --working-dir=backend audit --locked --no-interaction
```

The path-reporting commands include ignored files only when their names match the sensitive-artifact pattern, and they report candidate paths only. `rg --quiet` suppresses matching content and the loop emits only a path on a hit. The audit commands do not install packages; a missing lockfile, unavailable advisory service, or command failure is recorded as a blocked/failed scan rather than worked around by installing or changing dependencies.

### Frontend

```powershell
npm run format:check --workspace=@researchnav/frontend
npm run lint --workspace=@researchnav/frontend
npm run test --workspace=@researchnav/frontend
npm run build --workspace=@researchnav/frontend
```

Required focused test additions must be runnable with:

```powershell
npm run test --workspace=@researchnav/frontend -- --run src/api.test.ts src/app.test.tsx src/RoleSidebarPages.test.tsx
npm run test --workspace=@researchnav/frontend -- --run src/entry-server.test.tsx src/hydration.test.tsx src/CatalogPage.test.tsx
```

### Laravel fast suite and contracts

```powershell
composer --working-dir=backend test
composer --working-dir=backend exec pint -- --test
Push-Location backend
try {
  php artisan route:list --path=api
  php artisan test --filter=RoleAccessMatrixTest
  php artisan test --filter=InstitutionDomainAuthenticationTest
  php artisan test --filter=ApiRouteContractTest
  php artisan test --filter=Consolidation
} finally {
  Pop-Location
}
```

### Python workers

```powershell
python -m pip install -r backend\requirements-test.txt
python -m pytest backend\app\Services\similarity\tests
python -m ruff check backend\app\Services\similarity backend\app\Services\manuscript_text_cli.py
python -m mypy backend\app\Services\similarity
```

### MariaDB migration gate (disposable databases only)

The Database Builder must provide a repeatable harness that creates uniquely named disposable databases and loads sanitized fixtures. The gate must execute the equivalent of:

```powershell
$env:APP_ENV = "testing"
$env:DB_CONNECTION = "mariadb"
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3307"
$env:DB_DATABASE = "researchnav_migration_disposable"
Push-Location backend
try {
  php artisan migrate:status
  php artisan migrate --force
  php artisan consolidation:check-parity
  php artisan test --filter=ConsolidationMigrationMariaDbTest
} finally {
  Pop-Location
}
```

Do not copy this database name into a durable environment. The harness must refuse names outside an approved disposable prefix and must test restore separately.

### Integrated SSR/gateway smoke

Build once, then use **two separate terminals** so that the long-running API process does not prevent the SSR gateway from starting.

```powershell
# Build terminal
npm run build
```

```powershell
# Terminal A — API; leave this process running
npm run start:api
```

```powershell
# Terminal B — SSR gateway; leave this process running
$env:NODE_ENV = "production"
$env:PUBLIC_ORIGIN = "http://127.0.0.1:5173"
$env:SSR_API_ORIGIN = "http://127.0.0.1:3001"
npm run start:web
```

After both terminals report that they are listening, run this from a third terminal:

```powershell
curl.exe --fail --silent --show-error http://127.0.0.1:3001/api/health
curl.exe --fail --silent --show-error http://127.0.0.1:5173/_health
curl.exe --fail --silent --show-error http://127.0.0.1:5173/ | Out-Null
```

Manually/e2e verify SSR catalog HTML before hydration, cookie login/logout, origin rejection, body-size rejection, timeout mapping, every role nav, private preview/download streaming, public sessionlessness, the B5 guest-versus-authenticated download matrix, and Python failure/retry behavior. Stop both server processes after the smoke test.

## Persistent workstream checklist

Only the Plan Coordinator updates this section, with a linked SHA/PR/test report for every checked item.

- [ ] E0 Product, security, data, and repository owners approve decisions and preserve the dirty checkout
- [ ] T00 Exact dirty-state/provenance inventory completed
- [ ] T00 Reproducible clean baseline SHA approved and baseline checks recorded
- [ ] T00 Path-only secret/sensitive-artifact and dependency scans recorded without exposing secret contents
- [x] T00D `league/commonmark` `2.9.1` advisory `PKSA-zyf5-hrxv-hrd7` remediated with `2.10.0`; backend Composer audit and Pint pass
- [x] T00D Dependency-change Laravel test evidence and exact Composer lockfile result recorded
- [ ] T00 PR #8/#9/#10 disposition and reusable contract evidence recorded
- [ ] T01 Every database migration ledger and authoritative data source inventoried
- [ ] T01 Encrypted backup + private-file manifest hashed, restored, and verified
- [ ] T01 `000045` retention/privacy loss path repaired or safely prevented
- [ ] T01 `000046` per-type sequence max+1 and concurrency verified
- [ ] T01 Consolidated uniqueness/check/FK and route-binding parity verified on MariaDB
- [ ] T01 `000047` roster/title-membership semantics and upgraded data verified
- [ ] T01 Fresh, pre-cutover upgrade, already-consolidated recovery, and restore-only rollback scenarios pass
- [ ] T02 Institution-domain policy approved, implemented, and negatively tested
- [x] T03 Statistician, Office, and Librarian frontend paths aligned with canonical Laravel routes; 54 focused tests and frontend build pass
- [ ] T03 Statistician, Office, Librarian, paginator, response-shape, and fallback contracts frozen
- [ ] T04 Shared crashes/blank destinations/route paths/error handling/fallback fixed
- [ ] T05 Researcher acceptance checks pass
- [ ] T06 Research Instructor acceptance checks pass
- [ ] T07 Research Adviser acceptance checks pass
- [ ] T08 Statistician acceptance checks pass on consolidated MariaDB
- [ ] T09 Research Panelist acceptance checks pass on consolidated MariaDB
- [ ] T10 Research Coordinator acceptance checks pass, including office denial
- [ ] T11 Research Office acceptance checks pass, including privacy-history preservation
- [ ] T12 Librarian acceptance checks pass; publish authority matches approved decision
- [ ] T13 Administrator checks pass; Academics compatibility workflow and denial checks pass
- [ ] T14A Guest/Public backend privacy, filtering/pagination, rate-limit, and guest-versus-authenticated download-contract checks pass
- [ ] T14B Guest/Public frontend catalog/pagination/authenticated-download checks pass; stale public-download documentation is reconciled
- [ ] T15 Responsive/keyboard/focus/reduced-motion/WCAG matrix passes
- [ ] T16 Frontend full suite/build and SSR/hydration pass at exact integration SHA
- [ ] T16 Laravel full suite and role/object authorization matrix pass at exact integration SHA
- [ ] T16 Python tests/static checks and worker failure smokes pass
- [ ] T16 MariaDB fresh/upgrade/recovery/parity/restore gates pass
- [ ] T16R Code review has no unresolved blockers
- [ ] T16S Security review has no unresolved blockers
- [ ] T17A Requirements/schema/setup/operations docs match tested behavior
- [ ] T17B Parent Plan PR links all child PRs, exact SHAs, test evidence, decisions, and residual risks
- [ ] X0 Product/data/security owners approve release; Plan PR may leave Draft only after every required item is evidenced

## Entry gates

- User authorizes future Git/worktree/PR operations; this planning request itself does not.
- Dirty checkout is preserved and T00 produces an approved clean baseline SHA.
- Institution domains and exception policy are explicit.
- Data owner identifies every durable database and declares whether `000045`/`000046`/`000047` ran.
- Backup/restore rehearsal succeeds before any destructive migration test.
- File ownership table is accepted; no two mutating workstreams share a path.
- PR #8 remains unmerged until its baseline and contract claims are revalidated; no child PR is merged solely because #8 links it.

## Exit gates

- Every persistent checklist item required for scope is checked with linked evidence.
- No accepted requirement remains **Implemented but broken** or **Missing** at P0/P1; every deferred P2/P3 item has explicit owner/product acceptance.
- `composer --working-dir=backend audit --locked --no-interaction` reports no `PKSA-zyf5-hrxv-hrd7` finding, and the reviewed remediation lockfile is present.
- Institution-domain enforcement denies before account/session creation and passes security review.
- All preserved data has verified before/after parity or an owner-approved, backup-derived recovery report; no unexplained retention/privacy loss exists.
- Fresh, typed-upgrade, and consolidated-recovery MariaDB matrices pass; SQLite-only success is insufficient.
- Exact frontend/backend route and response contracts pass; fallback cannot hide auth/path/schema defects.
- Full frontend, Laravel, Python, SSR/hydration, gateway, role/navigation, authorization, private-file, accessibility, and security gates pass at the integration SHA.
- Documentation and Plan PR body match actual tested behavior, and final GitHub state is explicit.

## Risks and assumptions

| Risk / assumption                                                                       | Impact                                                               | Control                                                                                                                                            |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dirty checkout may contain the only copy of intended work                               | Loss or accidental publication                                       | Preserve; read-only inventory; no reset/clean/stash overwrite; provenance manifest and explicit-path reproduction                                  |
| PR #8 clean baseline differs from local code                                            | False confidence and merge conflicts                                 | Treat #8 as evidence, not source of truth; compare exact SHAs and retest                                                                           |
| `000045` may already have deleted historical privacy/retention data                     | Legal/audit and operational data loss                                | Locate backups/source DBs; hash compare; additive recovery; do not fabricate records                                                               |
| MariaDB and SQLite schemas/constraints differ                                           | Green test suite with broken production runtime                      | Mandatory MariaDB fresh/upgrade/concurrency suite                                                                                                  |
| Consolidated generic table weakens typed invariants                                     | Duplicate/invalid review decisions                                   | Conditional DB constraints/generated keys or equally strong approved design plus race tests                                                        |
| Unknown institution domain policy                                                       | Unauthorized account persistence or exclusion of valid users         | Explicit product/security decision; fail closed; pre-creation enforcement                                                                          |
| Fallback can hide 404 contract defects                                                  | Users see plausible but false data                                   | Network/approved-5xx GET only; explicit provenance; all actions disabled; negative tests                                                           |
| Current authenticated-download evidence contradicts stale public-download documentation | Accidental anonymous manuscript exposure or incorrect release claims | Preserve authenticated, audited streaming; execute B5 matrix and obtain policy decision before updating stale Gantt and Requirements documentation |
| `league/commonmark` `2.9.1` had high advisory `PKSA-zyf5-hrxv-hrd7`                     | Remediated in dirty baseline with minimum fixed `2.10.0`             | T00D verification passed; preserve the scoped lock update when reproducing the clean baseline                                                      |
| Local public filtering uses one fetched page                                            | Incomplete/misleading catalog                                        | Server-side filters/sort/pagination and authoritative totals                                                                                       |
| Librarian/office archive authority conflict                                             | Unauthorized publication or unusable workflow                        | Keep current narrower office/admin authority until signed decision                                                                                 |
| Private local storage deployment unknown                                                | Manuscript disclosure/loss                                           | Private ACL, encryption, backups, no direct serving, outbox drain and restore smoke                                                                |
| No CI files were found under `.github/` during inspection                               | Verification may depend on local evidence only                       | Add CI only if repository owner approves; otherwise require signed exact-SHA reports before merge                                                  |
| Historical docs/tests may be stale                                                      | Incorrect status claims                                              | Current code + executed checks override prose; update docs last                                                                                    |

## Plan PR body draft

**Title:** `plan: audit ResearchNAV requirements and recover a safe roadmap`

**Base:** `chore/researchnav-current-baseline` (only after an approved clean SHA exists)
**Head:** `plan/researchnav-requirement-audit-and-roadmap`
**State:** Draft

### Goal

Establish a reproducible ResearchNAV baseline, prevent data loss in migrations `000045`/`000046`, define and enforce institution domains, align frontend/Laravel contracts, and finish role workspaces in the user-mandated order without changing the React SSR -> Express gateway -> Laravel/MariaDB/private storage -> Python architecture.

### Current blockers

- Dirty local baseline is not reproducible; existing Draft PR #8 is frontend-only and based on an earlier named commit.
- `000045` can discard retention/privacy history and removes typed constraints while SQLite retains a different schema.
- `000046` does not prove sequence max+1 or recovery completeness.
- Institution domains are unspecified and unenforced before account creation.
- Statistician, Research Office, and Librarian frontend route mismatches are repaired in the dirty baseline; broader contract and reproducibility gates remain open.
- CommonMark advisory remediation and backend verification pass in the dirty baseline; the scoped changes must be preserved during baseline reconciliation.

### Scope

- Baseline forensics and clean-SHA gate
- MariaDB backup/restore, migration parity, invariant and recovery work
- Google Workspace institution-domain policy and negative tests
- Exact API/error/fallback contracts
- Ordered actor completion: Researcher -> Instructor -> Adviser -> Statistician -> Panel -> Coordinator -> Office -> Librarian -> Administrator -> Guest/Public
- Academics compatibility closure, responsive/accessibility matrix, integration, and documentation

### Non-goals

- No legacy `server/` implementation or PostgreSQL migration
- No framework rewrite, React Router adoption, redesign, or AI-generated decisions
- No destructive migration against preserved data and no silent migration-history rewrite
- No widening librarian/compatibility-role authority without an approved policy
- No fallback for auth, mutations, downloads, 404/405, throttling, malformed success, or real empty data

### Architecture and decisions

- Laravel remains the sole auth/data/private-file boundary; the SSR Express service remains a gateway only.
- MariaDB is the release database; SQLite is a fast test aid, not the migration acceptance environment.
- `league/commonmark` advisory remediation is a P0 dependency gate; Composer audit and Pint run with `backend/` as their working directory.
- Backend route names are canonical: `/api/statistician/methodology/*`, `/api/office/*`, `/api/librarian/catalog`.
- Similarity remains advisory; human decisions and final workflow transitions remain distinct.
- Existing narrower office/admin archive authority remains until the librarian decision is approved.
- One sequential frontend owner avoids overlap in shared monolith files; database and backend-security owners use isolated non-overlapping worktrees.

### Workstreams

| Workstream         | Owner                          | Status                      | Branch                                 | Child PR                   |
| ------------------ | ------------------------------ | --------------------------- | -------------------------------------- | -------------------------- |
| Baseline recovery  | Git/Repository Steward         | Pending                     | `chore/researchnav-audited-baseline`   | pending                    |
| Database safety    | Database Builder               | Blocked on inventory        | `fix/researchnav-consolidation-safety` | pending                    |
| Auth/API contracts | Backend Security & API Builder | Blocked on domains/baseline | `fix/researchnav-auth-api-contracts`   | pending                    |
| Ordered frontend   | Frontend Builder               | Blocked on contracts        | `feat/researchnav-ordered-frontend`    | pending; reconcile with #8 |
| Documentation      | Documentation Owner            | Blocked on integration      | `docs/researchnav-current-contracts`   | pending                    |
| Integration test   | Integration Tester             | Blocked                     | `integration/researchnav-roadmap`      | pending                    |
| Code review        | Code Reviewer                  | Blocked                     | exact integration SHA                  | n/a                        |
| Security review    | Security Reviewer              | Blocked                     | exact integration SHA                  | n/a                        |

### Acceptance

- [ ] Approved clean baseline and PR #8/#9/#10 disposition
- [ ] Verified backup restore and zero unexplained data loss
- [ ] Fresh/upgrade/recovery MariaDB matrices and consolidated invariants pass
- [ ] Institution-domain deny-before-create/session tests pass
- [ ] Exact route/response/fallback contracts pass
- [ ] Actor workstreams pass in required order
- [ ] Full frontend/Laravel/Python/SSR/gateway/security/accessibility checks pass
- [ ] Child PRs, exact SHAs, tests, decisions, and residual risks are linked

### Operational warning

Do not run `migrate:fresh`, `db:wipe`, migration rollback, `git reset --hard`, `git clean`, force-push, or source-table drops against the current checkout or any data that must be preserved. `000045` rollback is a verified database/private-storage restore.

## Recommended next action

Obtain the three blocking owner decisions (institution domains, durable database/migration inventory, and `000047`/librarian semantics), then authorize the Git/Repository Steward to perform T00 read-only forensics and establish one verified clean baseline. Do not begin PR #8 frontend implementation or run `000045`/`000046` on valuable data first.
