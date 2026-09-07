# ResearchNAV Completion Audit and Implementation Plan

## Plan status and control record

- **Artifact:** canonical planning document only. It authorizes no product-code, Git, migration, infrastructure, or GitHub mutation.
- **Plan branch:** `plan/researchnav-completion-audit`
- **Plan worktree:** `D:\ResearchNav\.worktrees\plan-researchnav-completion-audit`
- **Plan base:** `d6b742ac45053e0e74cbb2fb7e634a248d502304`
- **Plan file:** `v1/docs/plans/researchnav-completion-audit.md`
- **Evidence date:** 2026-09-05
- **Source condition:** `D:\ResearchNav\v1` is reported dirty. It is read-only evidence, not a reproducible implementation base. Preserve it byte-for-byte; do not reset, clean, overwrite, or run migrations from it.
- **Active product boundary:** `v1/frontend` (React/Vite SSR), `v1/backend` (Laravel/MariaDB/private storage), and the bounded active Python workers. `v1/server` is legacy Express/PostgreSQL reference and is out of scope.
- **Plan maintenance:** only the Plan Coordinator may update this document and the parent Plan PR checklist. A checked item must link an exact SHA/PR and command evidence.

## Objective

Establish one reproducible ResearchNAV baseline, prevent destructive consolidation and historical-record loss, stabilize authentication and cross-layer contracts, then complete the approved system as an auditable sequence of isolated workstreams:

1. preserve typed domain tables and privacy/retention history;
2. make consolidated identifiers and API identifiers unambiguous;
3. implement explicit least-privilege access for eleven actor personas and document-scoped assignment designations;
4. complete the human-controlled research workflow;
5. make private uploads, queued extraction, OCR, metadata, and indexing reliable;
6. provide authorization-safe OpenSearch BM25 retrieval with optional FastText support and separate TF-IDF/cosine similarity;
7. complete review, monitoring, defense, repository, notification, reporting, and responsive role UI flows; and
8. prove the result on MariaDB, OpenSearch, queue workers, SSR, and browser-level authorization tests before documentation and release.

## Scope, non-goals, and governing decisions

### In scope

- Forensic reconciliation of the dirty source checkout into an owner-approved clean implementation SHA.
- Migrations `2026_09_04_000045`, `2026_09_04_000046`, and `2026_09_04_000047`, including fresh, pre-cutover-upgrade, and already-applied recovery paths.
- All typed review/activity tables, especially `retention_logs` and `privacy_logs`, and any consolidated shadow/projection tables.
- Google SSO, account state, explicit role identity, assignment-scoped authorization, session/origin/rate-limit behavior, and IDOR prevention.
- Canonical statistician, librarian, and research-office API contracts and strict frontend error behavior.
- Research lifecycle, files, jobs, OCR, metadata, authorized search, similarity, role operations, public repository, reports, notifications, UI, tests, and operational documentation.

### Non-goals

- No implementation in legacy `v1/server`, no PostgreSQL migration, and no framework rewrite.
- No destructive removal of typed source tables in this plan. Consolidated tables may be verified projections, never the only surviving copy.
- No vector database. OpenSearch is a rebuildable retrieval index, not the system of record or authorization authority.
- No AI-generated research, automated approval/rejection, or workflow transition based on search/similarity/OCR output.
- No public exposure of manuscript text, storage paths, checksums, private metadata, or restricted files.
- No external OCR/model service receiving manuscripts without a separate privacy/security approval.
- No widening of librarian, coordinator, academics, panelist, or statistician authority by compatibility aliases.

### Approved architecture decisions carried into execution

1. **System of record:** MariaDB and private file storage remain authoritative. OpenSearch and consolidated tables are derived/rebuildable projections.
2. **Typed preservation:** revisions, title validations, feedback, evaluations, methodology, compliance, metadata, monitoring, audit, retention, and privacy retain typed authoritative tables and constraints. `000045`/`000046`/`000047` must not drop them.
3. **Explicit IDs:** a typed resource's API `id` is its typed-table primary key. A consolidated row's physical `id` is internal only; `(source_type, source_id)` or `(stream, source_id)` is lineage, unique only as a pair. Physical consolidated IDs must never silently replace typed API IDs.
4. **Canonical paths:** Laravel routes are canonical: `/api/statistician/methodology/{researchDocument}` (plus `/sign-off` and `/return`), `/api/librarian/catalog`, and `/api/office/*`. Do not add aliases merely to preserve incorrect frontend calls.
5. **Eleven personas:** ten authenticated roles - Researcher, Research Instructor, Research Adviser, Research Panelist, Statistician, Research Coordinator, Librarian, Research Office Personnel, Academics, Administrator - plus virtual Guest/Public. Coordinator and Academics receive explicit identities, not `research_office` identity aliases.
6. **Assignment designations:** `adviser`, `instructor`, `panel`, and `statistician` are document-scoped designations, separate from account roles; `panel` maps only to the explicit Research Panelist account role. Every assigned read or mutation requires an active assignment, matching account role, active account, object scope, and current workflow gate.
7. **Search separation:** OpenSearch BM25 is lexical retrieval; FastText may supply versioned supporting/reranking evidence; TF-IDF/cosine is the authoritative similarity calculation. Ranking formulas and model/index versions are explicit and test-fixtured. None grants access or changes workflow.
8. **Authorization boundary:** Laravel authorizes before indexing/query construction and reauthorizes hydrated result IDs after search. The SSR gateway and OpenSearch are never authorization boundaries.
9. **Human workflow:** reviews and similarity produce evidence. Only the workflow service, acting for an authorized human and enforcing prerequisites, changes lifecycle state.
10. **Fail closed:** malformed 2xx responses and 401/403/404/405/409/422/429 responses are visible contract/auth failures. Demo data cannot hide them or enable mutations/downloads.

### Assumptions requiring confirmation at entry gates

- The eleven-persona list above is the approved interpretation of "11-role RBAC"; Guest/Public is virtual and is not inserted into `user_roles`.
- Exact institutional Google Workspace domains, alias/subdomain rules, and pre-provisioned external-account policy will be supplied by Product and Security before Phase 1 auth completion. Safe default: exact normalized allowlist, matching verified email domain and `hd`, deny before user/session creation.
- Typed tables remain authoritative for this release even if a future, separately approved consolidation is desired.
- Self-hosted Tesseract-compatible OCR is the reversible default. Manuscripts do not leave the controlled environment.
- OpenSearch deployment/version, retention, snapshots, and capacity are approved before Phase 5. Development may use a pinned local container; production credentials remain outside Git.
- Whether `000045`/`000046`/`000047` ran in any durable environment is unknown until migration ledgers and backups prove otherwise. Treat them as deployed for recovery planning and as frozen for new deployments.

## Evidence and audit classification

No suite was executed while producing this plan. Classifications use only this taxonomy: **Fully implemented**, **Partially implemented**, **Frontend only**, **Backend only**, **Implemented but broken**, **Missing**, and **Needs clarification**. Observed, dirty-source, unverified, substantial, unsafe, and similar terms are evidence qualifiers, not classifications. Current prose/tests are secondary to an executed exact-SHA result.

| Area                                | Classification             | Evidence/gap summary                                                                                                                                                       | Release priority |
| ----------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Reproducible baseline               | **Needs clarification**    | Clean plan base is `d6b742a`; newer dirty-source evidence has unknown provenance and is unverified.                                                                        | P0               |
| `000045` consolidation finalization | **Implemented but broken** | Dirty-source evidence shows selected-record copying and MariaDB drops of ten typed tables; retention/privacy lack equivalent backfill and SQLite follows a different path. | P0               |
| `000046` legacy sequences           | **Implemented but broken** | Observed sequence rows omit empty streams; concurrency, exact max+1, and unrelated `audit_logs` drop behavior are unsafe.                                                  | P0               |
| `000047` follow-on recovery         | **Needs clarification**    | Its ledger state, DDL/data effects, ordering relative to `000045`/`000046`, and durable-environment deployment history require the same forensic audit before any run.     | P0               |
| Consolidated/typed ID contract      | **Implemented but broken** | Dynamic models overload Eloquent/API identity with `source_id`; IDs collide across source types and query aliases are inconsistently applied.                              | P0               |
| Statistician API                    | **Implemented but broken** | Frontend uses `/queue/{id}/*`; Laravel defines `/methodology/{id}/*`; consolidated checklist lookup also risks an unmapped query key.                                      | P0               |
| Librarian API                       | **Implemented but broken** | Frontend uses `/repository-catalog`; Laravel defines `/catalog`; metadata source/projection response parity is unproven.                                                   | P0               |
| Research Office API                 | **Implemented but broken** | Frontend uses `/research-office/*`; Laravel defines `/office/*`; compatibility-role denial must remain explicit.                                                           | P0               |
| Authentication/session              | **Partially implemented**  | Google audience/verified-email and session behavior are observed; institutional-domain policy and complete negative coverage are missing/unverified.                       | P0               |
| Roles and assignments               | **Partially implemented**  | Eight canonical roles, legacy mappings, and four assignment values are observed; coordinator/academics aliases conflict with explicit-role requirements.                   | P0               |
| Research workflow                   | **Partially implemented**  | Core submission/revision/review/archive operations are observed, but the prerequisite/state matrix and race behavior are not one enforced contract.                        | P1               |
| Upload/private files                | **Partially implemented**  | Private streaming/versioning is present in handoff evidence; durable queue state, malware policy, OCR, reprocessing, and production restore need completion.               | P1               |
| OCR/metadata/indexing               | **Partially implemented**  | PDF/DOCX extraction is observed; scanned PDFs are unsearchable and OpenSearch indexing is absent.                                                                          | P1               |
| Authorized OpenSearch retrieval     | **Missing**                | Dirty source uses MariaDB FULLTEXT/BM25-family behavior, not approved OpenSearch with ACL filtering and stale-index reauthorization.                                       | P1               |
| TF-IDF/cosine similarity            | **Partially implemented**  | A substantial bounded Python implementation and FastText support are observed, but integration, corpus authorization, versioning, and production-failure tests remain.     | P1               |
| Reviews/monitoring/defense          | **Partially implemented**  | Services/routes/UI are observed for much of the domain; typed constraints, complete policies, transition prerequisites, and integrated role tests remain.                  | P1               |
| Repository/notifications/reports    | **Partially implemented**  | Main APIs/UI are observed; complete server pagination/filtering, delivery/outbox behavior, export safety, and privacy matrices remain.                                     | P1               |
| Role UI/accessibility               | **Partially implemented**  | Reading Room shell and role pages are observed; broken contracts, duplicate/fallback surfaces, all-state UX, responsive behavior, and WCAG evidence remain.                | P1               |
| CI/e2e/operations docs              | **Partially implemented**  | Unit/feature tests and docs are observed, but no accepted exact-SHA cross-service release gate is evidenced.                                                               | P1               |

## Requirements traceability

| ID         | Requirement and observable outcome                                                                                                      | Implementing tasks | Verification                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------- |
| BASE-1     | One clean, reproducible implementation SHA with provenance for dirty-source changes.                                                    | T00, T01           | V0, signed provenance manifest           |
| DATA-1     | `000045`/`000046`/`000047` cannot drop typed, audit, retention, or privacy tables/rows.                                                 | T10, T11           | V2 fresh/upgrade/recovery matrix         |
| DATA-2     | Every typed row and constraint survives; projections have complete field-level parity.                                                  | T11, T12           | V2 hash/field/orphan/constraint checks   |
| DATA-3     | Typed IDs, consolidated physical IDs, and lineage IDs have explicit non-interchangeable semantics.                                      | T12, T13           | V2 + API resource/binding tests          |
| CONTRACT-1 | Statistician, librarian, and office frontend calls match canonical method/path/body/envelope/error contracts.                           | T14, T15           | V3, V4                                   |
| AUTH-1     | Google/domain/account/session/origin/rate-limit behavior denies safely before persistence or session mutation.                          | T16                | V3 auth negatives                        |
| RBAC-1     | Ten explicit authenticated roles and virtual Guest/Public have no authority aliases.                                                    | T20, T21           | V3 role x route matrix                   |
| RBAC-2     | Adviser/instructor/panelist/statistician assignments are active, role-compatible, revocable, and object-scoped.                         | T20-T22            | V3 role x designation x object matrix    |
| WF-1       | The complete lifecycle and prerequisites are atomic, human-controlled, idempotent, and auditable.                                       | T30-T32            | V3 workflow transition/concurrency tests |
| INGEST-1   | Uploads are private, validated, checksummed, versioned, quarantined as required, and authorized.                                        | T40, T41           | V3 upload/IDOR/storage tests             |
| INGEST-2   | Queue/extraction/OCR/index jobs are idempotent, retryable, observable, and stale-version safe.                                          | T40-T43            | V3, V5 worker/job tests                  |
| META-1     | Metadata has provenance/completeness status and only authorized, current fields reach the index/repository.                             | T43                | V3 projection tests                      |
| SEARCH-1   | OpenSearch BM25/FastText retrieval searches only an actor-authorized projection and reauthorizes every result.                          | T50-T54            | V6 ACL/ranking/stale-index tests         |
| SEARCH-2   | Public search returns only archived public records; internal search honors owner/assignment/office/admin scopes.                        | T53, T54, T80      | V6, V7 privacy matrix                    |
| SIM-1      | TF-IDF/cosine similarity is deterministic, versioned, bounded, self-excluding, advisory, and transactionally persisted when applicable. | T60, T61           | V5, V3 similarity suites                 |
| REV-1      | Title, adviser/instructor, statistician, panel, compliance, and metadata reviews enforce typed constraints and human authority.         | T70                | V3 review matrix                         |
| MON-1      | Monitoring/audit/privacy/retention events are append-only, actor-safe, and complete.                                                    | T71                | V2, V3 immutability tests                |
| DEF-1      | Defense schedule/evaluation lifecycle prevents overlaps and duplicate/out-of-scope evaluations.                                         | T72                | V3 concurrency/time-zone tests           |
| REP-1      | Repository browse/detail/filter/page/download behavior preserves visibility and private-file boundaries.                                | T80                | V3, V4, V7                               |
| NOT-1      | Notifications are event/outbox driven, idempotent, deep-linked, scoped, and read-state safe.                                            | T81                | V3 notification tests                    |
| RPT-1      | Reports use authorized aggregates, bounded filters/exports, stable definitions, and no private-text leakage.                            | T82                | V3 report/privacy tests                  |
| UI-1       | All eleven personas have useful loading/empty/error/success/denied states and accessible responsive navigation.                         | T90-T93            | V4, V7                                   |
| QUAL-1     | Full MariaDB/OpenSearch/queue/Python/SSR/browser/security matrix passes at an exact SHA.                                                | T100-T102          | V7, V8                                   |
| DOC-1      | Requirements, schema, APIs, search, migration, backup/restore, and operations docs match tested behavior.                               | T103, T104         | documentation verification               |

## Executable dependency graph

```text
E0 preserve source + authorize read-only audit
  -> T00 dirty-source provenance and environment inventory
  -> T01 approve implementation baseline and decision ledger
      -> Phase 1 stabilization
         T10 migration `000045`-`000047` freeze/recovery schema -> T11 typed preservation/parity --+
                                            +-> T12 explicit ID schema semantics -+-> T13 runtime/resource IDs
                                                                                     -> T14 backend contract -> T15 frontend alignment
         T16 authentication hardening/tests
         T10..T16 -> T17 Phase 1 integration gate
      -> Phase 2 access foundation
         T20 explicit roles/designations -> T21 policies/routes -> T22 RBAC regression -> T23 gate
      -> Phase 3 workflow
         T30 workflow schema -> T31 state/prerequisite service -> T32 event/concurrency gate
      -> Phase 4 ingestion
         T40 job/file schema -> T41 upload/jobs ----+
                               T42 OCR worker ------+-> T43 metadata/projection -> T44 gate
      -> Phase 5 authorized search
         T50 OpenSearch runtime -> T51 index/outbox -----------+
         T43 + T50 -> T52 BM25/FastText ----------------------+-> T53 authorized API -> T54 search gate
         T23 --------------------------------------------------+
      -> Phase 6 similarity
         T43 + T54 -> T60 TF-IDF/cosine worker -> T61 persistence/API -> T62 gate
      -> Phase 7 domain operations
         T32 + T62 -> T70 reviews -> T71 monitoring/logs --+
                                 +-> T72 defense ----------+-> T73 gate
      -> Phase 8 delivery services
         T54 + T73 -> T80 repository -> T81 notifications -> T82 reports -> T83 gate
      -> Phase 9 UI completion
         T17 + T23 + T32 + T44 + T54 + T62 + T83
           -> T90 generated/typed client contracts -> T91 shared shell
           -> T92 eleven-persona workspaces -> T93 accessibility/responsive gate
      -> Phase 10 release proof
         T100 e2e fixtures -> T101 combined integration -> T102 security/review
         -> T103 documentation -> T104 Plan PR closure -> X0 release approval
```

Parallelism is allowed only where the graph shows independent ready tasks and the ownership table gives disjoint paths. A child branch starts from the latest tested plan branch, not from the dirty source checkout. Downstream work does not start on an unmerged dependency.

## Workstream ownership, branches, and isolated worktrees

These are future assignments, not worktrees created by this plan. One owner has exclusive mutation rights for each path for the entire program; reviewers/testers are read-only. An unlisted path requires Plan Coordinator reassignment before editing.

| Workstream                    | Sole mutating owner            | Proposed branch                           | Proposed worktree                           | Exclusive paths                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------ | ----------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan control                  | Plan Coordinator               | `plan/researchnav-completion-audit`       | current plan worktree                       | `v1/docs/plans/researchnav-completion-audit.md`; parent PR body only                                                                                                                                                                                                                                                                                                                                       |
| Baseline/provenance           | Git/Repository Steward         | `chore/researchnav-reproducible-baseline` | `D:\ResearchNav\.worktrees\rn-baseline`     | Git metadata and external handoff report only; no product-file edits until owner approval                                                                                                                                                                                                                                                                                                                  |
| Database/persistence schema   | Database Builder               | `fix/researchnav-data-foundation`         | `D:\ResearchNav\.worktrees\rn-data`         | `v1/backend/database/**` (including migrations `000045`-`000047`); `v1/backend/tests/Feature/Database/**`; `v1/backend/app/Console/Commands/CheckConsolidationParity.php`; new `v1/tests/provisioning/**`                                                                                                                                                                                                  |
| Laravel application/API       | Backend Builder                | `feat/researchnav-backend-core`           | `D:\ResearchNav\.worktrees\rn-backend`      | `v1/backend/app/**` except `app/Console/Commands/CheckConsolidationParity.php`, `app/Services/similarity/**`, and `app/Services/manuscript_text_cli.py`; `v1/backend/routes/**`; `v1/backend/bootstrap/**`; `v1/backend/config/**`; `v1/backend/tests/**` except `tests/Feature/Database/**`; `v1/backend/composer.json`; `v1/backend/composer.lock`; `v1/backend/phpstan.neon`; `v1/backend/.env.example` |
| Search/OCR/similarity workers | Search Worker Builder          | `feat/researchnav-search-workers`         | `D:\ResearchNav\.worktrees\rn-workers`      | `v1/backend/app/Services/similarity/**`; `v1/backend/app/Services/manuscript_text_cli.py`; `v1/backend/workers/**` (including `workers/tests/**`); `v1/backend/requirements.txt`; new locked `v1/backend/requirements-test.lock`; `v1/algorithm/**` only if retained as a compatibility CLI                                                                                                                |
| OpenSearch runtime            | Search Infrastructure Builder  | `feat/researchnav-search-infra`           | `D:\ResearchNav\.worktrees\rn-search-infra` | new `v1/infra/opensearch/**`; new `v1/docker-compose.search.yml`; new `.github/workflows/search-integration.yml` only                                                                                                                                                                                                                                                                                      |
| Frontend/UI                   | Frontend Builder               | `feat/researchnav-complete-ui`            | `D:\ResearchNav\.worktrees\rn-frontend`     | `v1/frontend/**`                                                                                                                                                                                                                                                                                                                                                                                           |
| Cross-service test automation | QA Automation Builder          | `test/researchnav-e2e`                    | `D:\ResearchNav\.worktrees\rn-e2e`          | new `v1/tests/**` except `v1/tests/provisioning/**`; `v1/package.json`; `v1/package-lock.json`; new `.github/workflows/ci.yml` only                                                                                                                                                                                                                                                                        |
| Production deployment         | Operations/Deployment Owner    | `ops/researchnav-deployment`              | `D:\ResearchNav\.worktrees\rn-deployment`   | new `v1/infra/deployment/**`; new `.github/workflows/deploy*.yml`; external deployment-control repository and environment configuration                                                                                                                                                                                                                                                                    |
| Documentation                 | Documentation Owner            | `docs/researchnav-release-contracts`      | `D:\ResearchNav\.worktrees\rn-docs`         | `v1/README.md`; `v1/backend/README.md`; `v1/backend/DATABASE_*.md`; `v1/backend/docs/**`; `v1/docs/**` except `v1/docs/plans/**`                                                                                                                                                                                                                                                                           |
| Independent verification      | Integration Tester / reviewers | exact candidate SHA                       | read-only disposable checkout               | no files; findings return to the exclusive owner                                                                                                                                                                                                                                                                                                                                                           |

Rules:

- Specific exclusions override broad path patterns. Worker tests are disjoint: similarity tests live in the worker-owned `backend/app/Services/similarity/**`; general worker tests live in the worker-owned `backend/workers/tests/**`; neither may be added under `backend/tests/**`. Backend Builder may call workers through adapters but may not edit worker-owned Python or requirements; Search Worker Builder may not edit Laravel adapters/routes/config.
- Database Builder owns every schema migration and seeder, explicitly including `000045`, `000046`, and `000047`, plus roles, workflow, jobs, and search outbox schema. Other builders submit a schema contract to that owner.
- Database Builder owns the reusable, parameterized disposable-MariaDB provision/cleanup scripts in `v1/tests/provisioning/**`; QA Automation Builder consumes but does not edit them. The `tests/provisioning/**` exclusion overrides QA's broad `tests/**` ownership.
- Plan Coordinator exclusively owns this document, including the verification command catalog. QA Automation Builder exclusively owns `.github/workflows/ci.yml`; Search Infrastructure Builder exclusively owns `.github/workflows/search-integration.yml`; Operations/Deployment Owner exclusively owns `v1/infra/deployment/**` and `.github/workflows/deploy*.yml`. Search Worker Builder supplies V5/CI contract changes to those named owners and does not edit the catalog, CI, or deployment paths.
- Frontend contract corrections and final UI remain on one sequential frontend branch because `src/api.ts`, shared shell, role pages, and tests overlap heavily.
- Each coherent child PR follows: clean worktree -> implementation/self-check -> independent Pre-Commit Tester PASS -> explicit-path staging by Git Steward -> child PR to plan branch -> exact-SHA tests/reviews -> merge -> recreate/rebase the next dependent worktree from the updated plan branch.
- Never use `git add .`, force-push, history rewriting, shared indexes, or staging from the dirty source checkout.

## Entry gates

### E0 - before any implementation worktree

- [ ] Preserve `D:\ResearchNav\v1`; record branch, HEAD, staged/unstaged/untracked/ignored paths, hashes, remotes, worktrees, and secret/private-artifact scan without changing it.
- [ ] Confirm the parent PR base branch contains `d6b742ac45053e0e74cbb2fb7e634a248d502304`; do not infer or move the base.
- [ ] Reconcile the dirty source, prior handoffs, and any open PRs into one approved clean implementation SHA with path provenance.
- [ ] Product/Security/Data owners confirm roles, assignment designations, domain policy, workflow gates, librarian publication authority, and authoritative databases/storage.
- [ ] Data owner reports where `000045`/`000046`/`000047` ran and supplies backup/restore access. Unknown means "possibly applied," not "safe to rewrite."
- [ ] OpenSearch/OCR deployment and manuscript data-residency constraints are approved.
- [ ] Ownership paths and child-PR topology are accepted.

### Global task entry gate

A task may start only when its dependencies are merged into the plan branch; its worktree is clean and based on that exact SHA; owned paths are exclusive; acceptance criteria and fixtures are available; no unresolved destructive/security decision remains; and the parent checklist names the task owner/branch.

## Ordered phases and tasks

### Phase 0 - persistent audit and baseline recovery

**T00 - Source and environment forensics**
Owner: Git/Repository Steward. Depends on E0 preservation authorization.

- Inventory Git state and provenance without stash/reset/clean; compare the dirty paths with `d6b742a` and all relevant PR SHAs.
- Inventory MariaDB instances, migration ledgers/checksums/order and DDL/data effects for `000045`-`000047`, table definitions/counts/max IDs, storage roots/manifests, queue state, OpenSearch state if any, and environment versions. Never print secret values.
- Classify every requested capability with the seven audit classifications above; record observed/verified/unverified, source, safety, and decision-blocked details as separate evidence qualifiers.

Acceptance: signed provenance/environment manifest; no source mutation; every dirty path attributed or quarantined; no secret/private manuscript proposed for Git; all durable databases and file stores named.

**T01 - Baseline and decision ledger**
Owner: Product/Architecture Owner. Depends on T00.

- Approve the clean implementation SHA and disposition of prior branches/PRs.
- Resolve assumptions listed above, including exact domains and publication authority.
- Freeze API, ID, role/designation, workflow, search-ranking, and data-authority contracts as acceptance fixtures.

Acceptance: one SHA is reproducible and clean; decisions have owner/date/rationale; unresolved choices are explicitly scoped blockers rather than implicit builder choices.

### Phase 1 - destructive-migration freeze, IDs, contracts, and focused safety tests

No later phase may start until T17 passes. `000045`/`000046`/`000047` remain deployment-blocked throughout this phase.

**T10 - Freeze destructive `000045`/`000046`/`000047` behavior**
Owner: Database Builder. Depends on T01 and verified backups.

- Audit `000047`'s ordered DDL/data effects and ledger/checksum history with `000045`/`000046`; make fresh and pre-cutover paths retain all typed review/activity tables, `audit_logs`, `retention_logs`, and `privacy_logs`; remove every conditional/unrelated audit drop and source-table drop behavior. Define `000047` membership exactly: a row is section-only only when its persisted section foreign key is non-NULL and its persisted title foreign key is NULL; a title member only when its persisted title foreign key is non-NULL and its persisted section foreign key is NULL. Matching title text never establishes membership; both-NULL and both-present rows are rejected or recorded as explicit anomalies, never silently reclassified.
- Make `000046` seed and retain exactly one sequence row for every defined stream, including empty streams, with `next_source_id = COALESCE(MAX(source_id), 0) + 1`; enforce unique `stream`, allocate under a transaction with the sequence row locked (`SELECT ... FOR UPDATE`), and roll back the allocation with a failed transaction. `audit_logs` is never dropped by `000046` or its recovery.
- If no durable database has applied the files, record approved checksums and correct them before release. If any has applied any of `000045`-`000047`, preserve migration history and add idempotent forward recovery migrations instead of silently rewriting deployed history.
- Add a migration preflight that refuses unsafe/non-disposable destructive execution and emits no sensitive data.

Acceptance: fresh MariaDB and typed-upgrade runs through `000047` contain every source table/row; none of `000045`-`000047` in the release performs those drops; already-applied fixtures take only additive recovery paths; migration failure leaves a restorable database. MariaDB fixtures prove the `000047` section-only/title-membership cases, NULL membership cases, permitted and forbidden FK cascade behavior, retention preservation, and authenticated migration/application access boundaries; `000046` proves one row per stream, COALESCE initialization, lock contention, rollback, and `audit_logs` non-drop behavior.

**T11 - Typed history recovery and field parity**
Owner: Database Builder. Depends on T10.

- Restore/reconstruct typed rows from verified backups and complete projections where loss has not occurred. Never fabricate absent retention/privacy history.
- Compare every field, null, timestamp precision, actor/file/similarity reference, status, source ID, duplicate, orphan, FK, unique, and check constraint for all ten typed domains. MariaDB nullable unique indexes are insufficient where NULL means one business value: use a non-NULL normalized/generated key (for example, `COALESCE` with a reserved sentinel) and test that duplicate NULL-key rows are rejected.
- Keep typed uniqueness and bounds (revision sequence; one evaluation/methodology/compliance/metadata decision per approved key; score/status bounds) in MariaDB.

Acceptance: row-level before/after parity report is exact or has an owner-approved backup-derived exception report; retention/privacy are append-only and complete; no orphans; invariant/concurrency tests fail invalid writes.

**T12 - Explicit consolidated ID schema semantics**
Owner: Database Builder. Depends on T10.

- Retain globally unique physical projection PKs while enforcing unique lineage pairs `(source_type, source_id)` and `(stream, source_id)`.
- Treat sequence rows, if retained for compatibility, as projection lineage only: retain exactly one row per defined stream (including empty streams), initialize with `COALESCE(MAX(source_id), 0) + 1`, lock that stream row atomically, roll it back on transaction failure, and never infer one stream from another.
- Add schema comments/contracts and collision fixtures where different source types intentionally share the same `source_id`.

Acceptance: collisions across types are safe; duplicate pairs, including NULL-normalized business keys, are rejected; concurrent lineage allocation is unique and rollback-safe; no API FK references a consolidated physical ID by accident.

**T13 - Runtime and resource ID semantics**
Owner: Backend Builder. Depends on T11 and T12.

- Remove dynamic table-existence behavior as an authority switch. Typed models always use typed storage; projection adapters use explicit projection models.
- Type-specific route binding resolves typed `id` in the parent document/object scope. Projection lookup always includes type/stream. API resources keep typed `id`; internal projection IDs are not exposed.
- Correct mapped query keys, especially statistician methodology `updateOrCreate`, and test nested-ID substitution/IDOR.

Acceptance: source IDs that collide across types cannot cross-bind/update/delete; Eloquent saves target one typed row; all resource IDs remain stable before/after projection rebuild; projection deletion/rebuild does not change API IDs.

**T14 - Canonical backend contract freeze**
Owner: Backend Builder. Depends on T13.

- Publish executable route/method/body/status/envelope fixtures for statistician, librarian, and office APIs.
- Keep the canonical paths in Decision 4; normalize pagination and source/projection resource shapes; return stable safe error codes.
- Assert active role, assignment/object scope, origin protection for mutations, throttles, and compatibility-role denial.

Acceptance: `route:list` and feature tests exactly match fixtures; no duplicate aliases; 401/403/404/405/409/422/429 cases are distinct; source and projection representations are field-equivalent where projections are read.

**T15 - Frontend contract reconciliation**
Owner: Frontend Builder. Depends on T14.

- Replace statistician `/queue/{id}/*`, librarian `/repository-catalog`, and research-office `/research-office/*` calls/tests with canonical Laravel paths and exact methods/bodies/envelopes.
- Validate successful envelopes at runtime boundaries; preserve paginator metadata; make contract/auth failures visible.
- Restrict any demonstration fallback to explicitly approved read-only network/unavailable cases; never use it for auth, 404/405, validation, throttling, mutations, downloads, malformed success, or valid empty results.

Acceptance: exact URL/method/body tests pass; no failing canonical request appears successful; empty remains empty; fallback is labeled, anonymized, and actionless.

**T16 - Focused authentication safety and contract tests**
Owner: Backend Builder. Depends on T01.

- Enforce approved Google `aud`, expiry, verified email, normalized domain/`hd`, account state, and deny-before-user/session behavior.
- Cover session regeneration/logout/expiry, secure cookie configuration, origin checks, body limits, rate limits, generic denial responses, blocked/suspended/inactive accounts, and token/log redaction.

Acceptance: allowlisted identity succeeds; absent/wrong/alias/subdomain/consumer-domain fixtures follow approved policy; denied attempts create no account/session and leak no discovery detail; auth mutation/origin/rate tests pass.

**T17 - Phase 1 exact-SHA gate**
Owner: Integration Tester. Depends on T10-T16 merged.

Acceptance: V2 on MariaDB, V3 focused migration/contract/auth suites, and V4 frontend API tests pass at the same SHA; code/security review has no blocking finding; typed/privacy/retention tables and rows remain intact.

### Phase 2 - explicit roles, policies, and assignment designations

**T20 - Role/designation persistence** - Owner: Database Builder; depends on T17. Seed ten explicit authenticated role slugs idempotently, migrate legacy coordinator/academics identities without granting office authority, preserve users, and constrain four designation values. Acceptance: reruns are idempotent; unknown roles fail safely; each assignment's account role matches its designation; active uniqueness/reassignment history is defined and race-safe.

**T21 - Central authorization policies** - Owner: Backend Builder; depends on T20. Define capability policies for every mutable/read-sensitive entity and remove canonical-role alias authority. Apply account state + role + designation + object + lifecycle predicates in services and routes. Acceptance: revocation is immediate; no UI/client claim grants access; administrator elevation is explicit; coordinator/academics cannot enter office paths.

**T22 - RBAC/IDOR regression suite** - Owner: Backend Builder; depends on T21. Build guest plus ten-role x route x method x account-state x assignment-state x own/other-object matrix. Acceptance: every allow/deny is fixture-backed; nested foreign IDs, stale assignments, deleted users, and role changes are negative-tested.

**T23 - Access gate** - Owner: Security Reviewer; depends on T22. Acceptance: no unresolved privilege-escalation, confused-deputy, mass-assignment, session, or IDOR finding; V3 role matrix passes on MariaDB.

### Phase 3 - complete human-controlled workflow

**T30 - Workflow persistence/invariants** - Owner: Database Builder; depends on T23. Preserve the document lifecycle `draft -> submitted -> under_review -> revision_required -> under_review -> approved -> archived`, with separate typed gate records for title recommendation, adviser/instructor review, methodology, defense/evaluation, compliance, metadata, and publication readiness. Acceptance: legal states/checks/indexes exist; state and review evidence are not conflated; transition/event idempotency keys are unique.

**T31 - Workflow service and prerequisites** - Owner: Backend Builder; depends on T30. Centralize transitions, role authority, assignment checks, latest-current-file rules, revision/resubmission, rejection/return semantics, and archive/publication prerequisites. Acceptance: one transition matrix defines actor/from/to/prerequisites/side effects; illegal/stale/concurrent transitions fail atomically; similarity/OCR/search cannot transition state.

**T32 - Workflow audit/concurrency gate** - Owner: Backend Builder; depends on T31. Add end-to-end domain tests for initial submission through archive, all return/resubmit loops, human actor attribution, transaction rollback, duplicate commands, and optimistic/row locking. Acceptance: every successful mutation has one immutable event/outbox record; failed transitions have no partial file/review/notification/index side effects.

### Phase 4 - private uploads, jobs, OCR, and metadata

**T40 - File/job/outbox schema** - Owner: Database Builder; depends on T32. Add durable processing status, checksums, version lineage, job attempts/errors, metadata provenance, OCR status, index generation, and transactional outbox/deletion records. Acceptance: current-version uniqueness and job idempotency keys are constrained; deleting/replacing a file cannot orphan blobs or searchable content.

**T41 - Upload and job orchestration** - Owner: Backend Builder; depends on T40. Stream to private storage; validate size, extension, MIME magic, filename, ownership, quota, checksum, and approved malware policy; enqueue only after commit; authorize preview/download; implement retry/backoff/dead-letter/reprocess and pending deletion. Acceptance: path traversal/polyglot/oversize/wrong-owner cases fail; duplicate upload/retry is idempotent; stale job cannot mark a superseded file current; range/content headers are safe.

**T42 - Extraction and OCR worker** - Owner: Search Worker Builder; depends on T40. Extract bounded PDF/DOCX text, detect image-only pages, run local OCR under CPU/memory/time/page/language limits, normalize text, and return a versioned bounded JSON contract without DB credentials or arbitrary paths. Create the worker-owned, hash-pinned `backend/requirements-test.lock` (the sole V5 test/static dependency input, including `pytest`, `ruff`, and `mypy`); place tests only in the two worker-owned paths defined in the ownership table. Acceptance: selectable/scanned/encrypted/corrupt/oversize/timeout fixtures produce deterministic statuses; no shell interpolation; temporary plaintext is permission-restricted and deleted; a clean environment can run V5 using committed lockfile inputs. Submit any V5 command-catalog change to Plan Coordinator and any `.github/workflows/ci.yml` change to QA Automation Builder; submit deployment changes to Operations/Deployment Owner.

**T43 - Metadata/projection orchestration** - Owner: Backend Builder; depends on T41 and T42. Validate worker output, store provenance/hash/language/page counts/completeness, select only latest authorized source, and enqueue index updates/deletes transactionally. Acceptance: malformed output writes nothing; reprocessing is idempotent; manual metadata and extracted metadata have explicit precedence; private body text is never returned by API resources.

**T44 - Ingestion gate** - Owner: Integration Tester; depends on T43. Acceptance: V3/V5 upload, queue, worker, retry, replacement, backup/restore, and private-file authorization scenarios pass at one SHA.

### Phase 5 - authorization-safe OpenSearch BM25 and FastText retrieval

**T50 - Pinned OpenSearch runtime** - Owner: Search Infrastructure Builder; depends on T44 and infrastructure approval. Provide local/test runtime pinned to immutable `repository@sha256:<digest>` references (never mutable tags), TLS/auth/secrets interface, health checks, least-privilege service user, snapshot/rebuild procedure, and resource limits. Acceptance: no anonymous production access; data volume is private; credentials are untracked; immutable image digest/build provenance is recorded; disposable integration environment and snapshot restore pass.

**T51 - Index mapping and transactional projection** - Owner: Backend Builder; depends on T50. Define versioned mapping/analyzers for title, abstract, keywords, authors, metadata, and OCR body; include visibility/owner/assignment/role ACL tokens and source version; process outbox idempotently; support zero-downtime alias rebuild/delete. Acceptance: index is fully rebuildable from MariaDB/private storage; stale versions cannot overwrite current; deletion/privacy/visibility changes remove access promptly.

**T52 - BM25/FastText ranking worker** - Owner: Search Worker Builder; depends on T50 and T43. Implement versioned query normalization and optional FastText supporting/reranking according to the approved fixture; do not silently change weights/order when a model is absent. Acceptance: golden corpus order is deterministic within documented ties; Unicode/empty/long/adversarial queries are bounded; model hash/version is reported; degraded behavior is explicit.

**T53 - Authorized search API** - Owner: Backend Builder; depends on T23, T51, and T52. Derive actor scope in Laravel, send mandatory filters to OpenSearch, cap candidate/page sizes, reauthorize hydrated IDs against current MariaDB state, and omit stale/unauthorized hits. Separate retrieval scores from similarity scores. Acceptance: forced filter omission, stale ACL/index, guessed cursor, cross-role, private/draft/deleted, and assignment-revocation tests fail closed; response contains no raw manuscript body or OpenSearch internals.

**T54 - Search relevance/security gate** - Owner: Integration Tester; depends on T53. Acceptance: V6 passes public, owner, assignee, office, admin, inactive, and guest corpora; ranking fixture, timeout/degraded mode, rebuild, snapshot, pagination, and audit/metrics checks pass.

### Phase 6 - TF-IDF/cosine similarity

**T60 - Deterministic similarity worker** - Owner: Search Worker Builder; depends on T54. Retain the approved normalization/tokenization/stopword/TF-IDF/cosine pipeline, self-exclusion, bounded corpus/input, stable score precision/ties, and optional separate FastText context. Define title/content weighting and content-unavailable behavior in fixtures. Acceptance: known pairs, duplicate titles, Unicode, punctuation/stopword-only, empty corpus, malformed input/output, timeout, NaN/infinity, and model absence pass; FastText never silently changes the official score.

**T61 - Similarity service/API/persistence** - Owner: Backend Builder; depends on T60. Authorize source/candidate corpus, invoke the fixed worker process, atomically persist versioned internal results, keep public/pre-submission checks non-mutating as approved, and expose human-readable provenance/thresholds. Acceptance: no self/private/unauthorized candidate; worker failure writes zero rows; repeat/concurrent checks follow an explicit idempotency/history policy; no result changes workflow.

**T62 - Similarity gate** - Owner: Integration Tester; depends on T61. Acceptance: V3/V5 golden, authorization, atomicity, rate-limit, performance-cap, and public-sessionless tests pass.

### Phase 7 - reviews, monitoring, and defense

**T70 - Typed review operations** - Owner: Backend Builder; depends on T32 and T62. Complete title validation, adviser/instructor feedback and revisions, statistician checklist/sign-off/clarification, panel evaluation, office compliance, librarian metadata review, and publication-readiness APIs. Acceptance: each uses typed IDs/constraints, current assignment/role, server-derived actor, allowed status, and one approved duplicate policy; no specialist grants final approval by implication.

**T71 - Monitoring, audit, privacy, retention** - Owner: Backend Builder; depends on T70. Emit append-only structured events with correlation/idempotency IDs and actor-safe resources; support authorized timelines while redacting sensitive actor/network details. Acceptance: update/delete is denied; failed transactions emit no success event; retention/privacy history remains queryable and backup-restorable; audit access is role-scoped.

**T72 - Defense scheduling/evaluation** - Owner: Backend Builder; depends on T70. Complete schedule lifecycle, timezone rules, participant assignments, conflict checks, reschedule/cancel history, manuscript read access, and submit-once bounded evaluation. Acceptance: unauthorized/unassigned/revoked/overlapping/duplicate/concurrent cases fail; panelists remain read/evaluate-only; completed defense evidence feeds workflow prerequisites explicitly.

**T73 - Operations gate** - Owner: Integration Tester; depends on T71 and T72. Acceptance: V3 role-specific happy/negative paths and MariaDB concurrency/immutability tests pass.

### Phase 8 - repository, notifications, and reports

**T80 - Repository** - Owner: Backend Builder; depends on T54 and T73. Complete public and authenticated browse/detail/search/filter/sort/cursor/page/download contracts. Public eligibility is nondeleted + archived + public + approved/archived status; downloads are reauthorized and audited. Acceptance: privacy field allowlist, no-session public reads, trusted-proxy throttling, full-result server filtering, stale-index omission, and private stream headers/IDOR tests pass.

**T81 - Notifications** - Owner: Backend Builder; depends on T80. Consume workflow outbox idempotently; target current authorized recipients; provide pagination, unread/read, safe deep links, retry/dead-letter, and revocation-safe reads. Acceptance: one logical event does not duplicate delivery; users cannot read/mark another user's item; stale links reauthorize; no secrets/body text appear.

**T82 - Reports/exports** - Owner: Backend Builder; depends on T80 and T81. Define metric dictionaries, authorized aggregate queries, date/timezone filters, pagination, bounded asynchronous exports where needed, CSV-injection defenses, and audit records. Acceptance: totals reconcile with fixtures; role/section/program scope is enforced; cells cannot execute formulas; exports contain no private manuscript text or hidden IDs.

**T83 - Delivery-services gate** - Owner: Integration Tester; depends on T82. Acceptance: repository privacy/download, notification, report/export, queue, and degraded-search tests pass.

### Phase 9 - complete role UI, responsive behavior, and accessibility

**T90 - Typed frontend contract boundary** - Owner: Frontend Builder; depends on all backend gates through T83. Consolidate API schemas/types, pagination/cursors, errors, request cancellation, loading/empty/error/denied states, and provenance labels. Acceptance: runtime schema failures are visible; stale requests cannot overwrite current actor/record; no fallback masks contracts.

**T91 - Shared Reading Room shell** - Owner: Frontend Builder; depends on T90. Complete SSR-safe role navigation, global search, notifications, profile/logout, focus restoration, route/deep-link handling, and no unauthorized controls. Acceptance: server/hydrated markup is equivalent; role/account change clears stale state; keyboard navigation and announcements work.

**T92 - Eleven-persona workspaces** - Owner: Frontend Builder; depends on T91. Complete Guest/Public, Researcher, Instructor, Adviser, Panelist, Statistician, Coordinator, Librarian, Research Office, Academics, and Administrator surfaces against live contracts. Acceptance: each approved capability is reachable and every forbidden mutation is absent and server-denied; uploads/jobs/OCR status, search versus similarity, review history, defense, repository, notifications, and reports have useful all-state UX.

**T93 - Responsive/accessibility UI gate** - Owner: Frontend Builder; depends on T92. Verify 320/375/768/1024/1440 px, table-to-card behavior, zoom/reflow, keyboard-only use, skip links, focus trap/restore, reduced motion, status announcements, labels/errors, and non-color similarity meaning. Acceptance: no blocking WCAG 2.2 AA automated/manual finding; no hidden action or page-level horizontal overflow; V4 passes.

### Phase 10 - integration, security, documentation, and exit

**T100 - Cross-service e2e harness** - Owner: QA Automation Builder; depends on T93. Create sanitized deterministic users/assignments/documents/files/OCR/search/similarity/workflow fixtures and browser tests; never use production data. Add the root `test:e2e` script, a pinned `@playwright/test` dependency, and `tests/playwright.config.ts`; consume the Database Builder-owned parameterized `tests/provisioning/Remove-DisposableResources.ps1` cleanup provisioner so `npm run test:e2e` is a committed, reproducible Playwright command. Acceptance: harness provisions uniquely generated disposable MariaDB/OpenSearch/storage/queue state, refuses unsafe names, hosts outside the Database Builder-owned allowlist, or absent server attestation, tears down only its asserted project/database/resources, and `npm run test:e2e` reports the exact runner version and fixture/environment identifiers.

**T101 - Combined exact-SHA verification** - Owner: Integration Tester; depends on T100 merged. Run V0-V8 only from the parameterized disposable clean exact-SHA checkout/isolated worktree, including fresh/upgrade/already-applied `000045`-`000047` migration recovery, queue retries, OpenSearch rebuild/degraded mode, SSR/gateway, every role/nav/object scope, private downloads, and browser journeys. Acceptance: commands, versions, candidate and explicitly set `BASE_SHA`, generated resource names, immutable image digests, exit codes, skips, timings, and output summaries are attached; skips require owner acceptance.

**T102 - Final code/security/data review** - Owner: Security Reviewer; depends on T101 PASS. Review auth/RBAC/IDOR, migration evidence, privacy/retention, upload/parser/OCR isolation, OpenSearch ACL/stale index, injection/SSRF/path traversal, exports, secrets/dependencies/config, and denial logging. Acceptance: no unresolved blocker/high finding and every accepted medium has owner/date/control.

**T103 - Documentation synchronization** - Owner: Documentation Owner; depends on T102. Update requirements/status, role matrix, schema/ERD, API/search/similarity contracts, environment, setup, migration freeze/recovery, backup/restore, queue/OCR/OpenSearch operations, incident/degraded behavior, and user guidance. Acceptance: a new operator can deploy/rebuild/restore/test from docs without destructive commands; claims cite exact tested behavior.

**T104 - Plan closure evidence** - Owner: Plan Coordinator; depends on T103. Link child PRs, SHAs, reviews, tests, decisions, migration/backup evidence, and residual risks; check only evidenced items. Acceptance: parent Draft PR is complete and may be marked ready only with release-owner authorization.

## Verification command catalog

Commands are planned and were not run while writing this document. **Every install, build, test, or migration command below runs only in a disposable clean checkout at the candidate exact SHA or an isolated clean worktree at that SHA - never in the dirty evidence source.** V0 is the sole read-only forensic exception and makes no install, test, build, or migration change. Before any V1-V8 command, the runner supplies the following PowerShell 5.1 parameters, then runs the guard. Bootstrap downloads and dependency caches are outside every source checkout; provisioning them must not scan, install into, or otherwise execute against the dirty source. Builders run focused checks, independent Pre-Commit Testers repeat them before staging, and PR/Integration Testers run exact committed SHAs. Record exact SHA, versions, exit code, skips, duration, and summary.

```powershell
# Required runner parameters; substitute approved values, never secrets.
$Checkout = "<absolute disposable checkout or isolated-worktree root>"
$EvidenceSource = "<absolute dirty evidence-source checkout>"
$CandidateSha = "<40-character candidate commit SHA>"
$BaseSha = "<40-character approved base commit SHA>"
$TestDbHost = "<dedicated disposable MariaDB host>"
$ToolCache = "<absolute external read-only tool cache>"
$EvidenceDir = "<absolute external evidence-output directory>"

if ($CandidateSha -notmatch '^[0-9a-fA-F]{40}$' -or $BaseSha -notmatch '^[0-9a-fA-F]{40}$') { throw "CandidateSha and BaseSha must be 40-character SHAs." }
if (-not (Test-Path -LiteralPath $Checkout -PathType Container)) { throw "Checkout does not exist." }
$Repo = Join-Path $Checkout "v1"
if (-not (Test-Path -LiteralPath $Repo -PathType Container)) { throw "Expected v1 repository directory is absent." }
if (-not (Test-Path -LiteralPath $EvidenceDir -PathType Container)) { throw "External evidence-output directory is absent." }
if ((git -C $Checkout rev-parse HEAD).Trim() -ne $CandidateSha.ToLowerInvariant()) { throw "Checkout HEAD is not CandidateSha." }
if ((git -C $Checkout status --porcelain).Count -ne 0) { throw "Checkout must be clean before provisioning or checks." }
git -C $Checkout merge-base --is-ancestor $BaseSha $CandidateSha
if (-not $?) { throw "BASE_SHA is not an ancestor of CandidateSha." }
$env:BASE_SHA = $BaseSha.ToLowerInvariant()
$RunToken = ("{0}_{1}_{2}" -f $env:USERNAME, $PID, ([guid]::NewGuid().ToString("N").Substring(0, 12))).ToLowerInvariant() -replace '[^a-z0-9_]', '_'
$DbName = "rn_test_$RunToken"
$DockerProject = "rnsearch_$RunToken"
if ($DbName -notmatch '^rn_test_[a-z0-9_]+$' -or $DockerProject -notmatch '^rnsearch_[a-z0-9_]+$') { throw "Unsafe disposable resource name." }
$DisposableHostAllowlist = Join-Path $Repo "tests\provisioning\approved-disposable-mariadb-hosts.json"
if (-not (Test-Path -LiteralPath $DisposableHostAllowlist -PathType Leaf)) { throw "Missing Database Builder-owned disposable-host allowlist." }
$ApprovedDisposableDbHosts = @((Get-Content -LiteralPath $DisposableHostAllowlist -Raw | ConvertFrom-Json).hosts)
if ([string]::IsNullOrWhiteSpace($TestDbHost) -or $TestDbHost -notin $ApprovedDisposableDbHosts) { throw "TestDbHost is not an approved disposable MariaDB host." }
$BootstrapPython = Join-Path $ToolCache "python\3.13.0\python.exe"
$PythonVenv = Join-Path $Repo ".venv"
$Python = Join-Path $PythonVenv "Scripts\python.exe"
function Initialize-RnWorktreeVenv {
    if (-not (Test-Path -LiteralPath $BootstrapPython -PathType Leaf)) { throw "Approved Python bootstrap is unavailable." }
    & $BootstrapPython -m venv $PythonVenv
    if (-not $?) { throw "Failed to provision the worktree-local Python virtual environment." }
    $resolvedRepo = (Resolve-Path -LiteralPath $Repo).Path.TrimEnd('\')
    $resolvedVenv = (Resolve-Path -LiteralPath $PythonVenv).Path
    if (-not $resolvedVenv.StartsWith("$resolvedRepo\", [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $Python -PathType Leaf)) { throw "Python virtual environment must resolve inside this worktree." }
}
function Remove-RnDisposableResources {
    if ($DbName -notmatch '^rn_test_[a-z0-9_]+$' -or $DockerProject -notmatch '^rnsearch_[a-z0-9_]+$') { throw "Refusing unscoped cleanup." }
    # The server-attested test provisioner may drop only $DbName on $TestDbHost; it must never enumerate or remove other databases.
    & (Join-Path $Repo "tests\provisioning\Remove-DisposableResources.ps1") -DatabaseName $DbName -DatabaseHost $TestDbHost -DockerProject $DockerProject
}
```

The Database Builder owns the committed, parameterized `tests/provisioning/Assert-DisposableMariaDb.ps1`, `New-DisposableMariaDb.ps1`, and `Remove-DisposableResources.ps1` provisioners before V2 is runnable. Until they exist, V2 is blocked; do not substitute manual cleanup, broad `docker system prune`, `docker compose down` without `--project-name`, or wildcard database cleanup.

### V0 - repository/diff safety

```powershell
$source = $EvidenceSource # read-only forensic evidence only; no install/test/migration runs here
git -C $source status --porcelain=v2 --branch --untracked-files=all --ignored=matching
git -C $source diff --check
git -C $source diff --cached --check
git -C $source diff --name-status --find-renames
git -C $source diff --cached --name-status --find-renames
git -C $source ls-files --others --exclude-standard
git -C $source ls-files --others --ignored --exclude-standard
git -C $source rev-parse --verify HEAD
git -C $source rev-parse --verify "HEAD^{tree}"
git -C $source ls-files -s
git -C $source remote | Sort-Object | ForEach-Object { "remote=$_ url=<redacted>" }
git -C $source worktree list --porcelain
git -C $source for-each-ref --format="%(refname) %(objectname)" refs/heads refs/remotes
$paths = @(git -C $source diff --name-only; git -C $source diff --cached --name-only; git -C $source ls-files --others --exclude-standard; git -C $source ls-files --others --ignored --exclude-standard) | Sort-Object -Unique
$paths | ForEach-Object { $path = Join-Path $source $_; if (Test-Path -LiteralPath $path -PathType Leaf) { Get-FileHash -LiteralPath $path -Algorithm SHA256 } }
& (Join-Path $ToolCache "gitleaks\8.28.0\gitleaks.exe") dir --no-git --redact $source
```

T00's Git/Repository Steward bootstrap-provisions the read-only `gitleaks` v8.28.0 binary to `$ToolCache\gitleaks\8.28.0` from an approved artifact source, verifies its approved SHA-256 and version, and records the artifact source/checksum before any source scan. If it is unavailable, record a blocker and do not use an ambient scanner or run any install against the dirty source. The signed manifest retains path/status inventories, source `HEAD`/tree/index hashes, SHA-256 for every extant changed/untracked/ignored file, remote names only (all remote URLs and userinfo are redacted), worktrees, refs, scanner version/config/checksum, redacted result, exit codes, and timestamps. It must **never** retain unredacted binary diffs, binary payloads, private manuscript content, credentials, tokens, or other secrets: record only binary path/status, pre-existing Git blob ID where available, byte count, and SHA-256. Deleted paths retain status and prior Git blob hash rather than a working-tree hash. No command in V0 mutates the source checkout.

### V1 - install, static, and build

```powershell
Push-Location $Repo
try {
    npm ci
    composer install --working-dir=backend --no-interaction
    npm run format:check
    npm exec --workspace=@researchnav/frontend -- prettier --check "..\docs\plans\researchnav-completion-audit.md"
    npm run lint
    npm run build
    composer --working-dir=backend exec pint -- --test
} finally { Pop-Location }
```

Available static checks are frontend/legacy ESLint via `npm run lint`, TypeScript compilation in `npm run build`, and Laravel Pint via the final command. Bootstrap Node, npm, PHP, and Composer from approved external tool-cache/image inputs when unavailable; verify their recorded versions/checksums, then run `npm ci`/`composer install` only in `$Repo`. If a tool or locked package cannot be provisioned, record a blocker rather than using an ambient dependency or touching the dirty source. Backend Builder/T14 owns the pinned Composer PHPStan development dependency, `backend/phpstan.neon`, and `composer analyse`; run it only after the V1 `composer install` in `$Repo`: `Push-Location $Repo; try { composer --working-dir=backend run analyse } finally { Pop-Location }`. Evidence records tool/package versions, configuration hashes, target paths, exit codes, and zero unapproved findings.

### V2 - MariaDB migration/data gate (disposable names only)

```powershell
$env:APP_ENV = "testing"
$env:DB_CONNECTION = "mariadb"
$env:DB_HOST = $TestDbHost
$env:DB_DATABASE = $DbName
if ($env:RN_DISPOSABLE_DB -ne "1" -or $env:DB_DATABASE -notmatch '^rn_test_[a-z0-9_]+$') { throw "Refusing migration outside the generated disposable database." }
Push-Location $Repo
try {
    & ".\tests\provisioning\Assert-DisposableMariaDb.ps1" -DatabaseName $DbName -DatabaseHost $TestDbHost
    & ".\tests\provisioning\New-DisposableMariaDb.ps1" -DatabaseName $DbName -DatabaseHost $TestDbHost
    & ".\tests\provisioning\Assert-DisposableMariaDb.ps1" -DatabaseName $DbName -DatabaseHost $TestDbHost
    php backend\artisan migrate:status
    php backend\artisan migrate --force
    php backend\artisan consolidation:check-parity
    php backend\artisan test --testsuite=Feature --filter="Migration|Consolidation|TypedTable|LegacyId|Retention|Privacy|Migration000046|Migration000047|SectionOnly|TitleMembership|NullUnique|Cascade|MigrationAuth"
} finally { Remove-RnDisposableResources }
```

The Database Builder owns `v1/tests/provisioning/approved-disposable-mariadb-hosts.json`, `Assert-DisposableMariaDb.ps1`, `New-DisposableMariaDb.ps1`, and `Remove-DisposableResources.ps1`. The allowlist records each approved host and expected server identity. The provisioning guard and provisioners must refuse a host absent from that allowlist and a name outside `^rn_test_[a-z0-9_]+$`; the guard runs before every create, migrate, or drop and obtains server-side attestation from the dedicated test server's definer-owned control procedure, which validates its own immutable host/server identity and the generated database name. `RN_DISPOSABLE_DB=1` is only a caller marker and cannot substitute for the allowlist or server attestation. The provisioners create/drop only `$DbName`, and never inspect/drop another database. The test harness separately loads fresh empty schema; sanitized pre-`000041` typed data; pre-`000045` shadow data; pre-`000047` data; and already-`000045`/`000046`/`000047` fixtures requiring additive recovery. It asserts the ledger order/checksum and preservation through `000047`, including section-only/title membership semantics, NULL uniqueness, permitted/forbidden cascades, retention preservation, authenticated access, one `000046` sequence row per stream, COALESCE initialization, locking, rollback, and `audit_logs` non-drop. A verified restore test is separate from migration rollback.

### V3 - Laravel focused and full suites

```powershell
Push-Location $Repo
try {
    composer --working-dir=backend test
    php backend\artisan route:list --path=api
    php backend\artisan test --filter="ApiRouteContract|Authentication|InstitutionDomain|Session|Origin"
    php backend\artisan test --filter="RoleAccessMatrix|Assignment|Authorization|Idor"
    php backend\artisan test --filter="Workflow|Review|Monitoring|Defense"
    php backend\artisan test --filter="Upload|DocumentFile|Job|Metadata|Repository|Notification|Report|Similarity|Search"
} finally { Pop-Location }
```

### V4 - frontend/SSR

```powershell
Push-Location $Repo
try {
    npm run format:check --workspace=@researchnav/frontend
    npm run lint --workspace=@researchnav/frontend
    npm run test --workspace=@researchnav/frontend
    npm run build --workspace=@researchnav/frontend
    npm run test --workspace=@researchnav/frontend -- --run src/api.test.ts src/app.test.tsx src/RoleSidebarPages.test.tsx
    npm run test --workspace=@researchnav/frontend -- --run src/entry-server.test.tsx src/hydration.test.tsx src/CatalogPage.test.tsx
} finally { Pop-Location }
```

### V5 - Python extraction/OCR/similarity

```powershell
Push-Location $Repo
try {
    Initialize-RnWorktreeVenv
    & $Python -m pip install --require-hashes -r backend\requirements-test.lock
    & $Python -m pytest backend\app\Services\similarity\tests backend\workers\tests
    & $Python -m ruff check backend\app\Services\similarity backend\workers
    & $Python -m mypy backend\app\Services\similarity backend\workers
} finally { Pop-Location }
```

V5 is intentionally unavailable until T42 commits its owned `backend/requirements-test.lock`, with every transitive test/runtime dependency version- and hash-pinned, and `backend/workers/tests/**`; the current repository does not provide that lockfile. The approved external `$BootstrapPython` may only create `$Repo\.venv`; `Initialize-RnWorktreeVenv` resolves and asserts that path before every Python dependency/test/static command, and every such command uses `$Python` from that worktree-local environment. Verify bootstrap Python/pip version/checksum first. If bootstrap or a locked dependency is unavailable, record a blocker; do not fall back to ambient dependencies or install/run anything in the dirty source. If worker paths differ, Search Worker Builder supplies the change to Plan Coordinator for this catalog and to QA Automation Builder for `.github/workflows/ci.yml`; Operations/Deployment Owner owns any deployment path. Evidence includes Python and package versions, committed lockfile hash, fixture identifiers, command output, and exit codes.

### V6 - OpenSearch integration

```powershell
$ComposeFile = Join-Path $Repo "docker-compose.search.yml"
$env:OPENSEARCH_IMAGE = "<registry>/<repository>@sha256:<64-lowercase-hex-digest>"
if ($env:OPENSEARCH_IMAGE -notmatch '^[^\s@]+@sha256:[0-9a-f]{64}$') { throw "OpenSearch image must be an immutable digest reference." }
if ($DockerProject -notmatch '^rnsearch_[a-z0-9_]+$' -or -not (Test-Path -LiteralPath $ComposeFile -PathType Leaf)) { throw "Refusing unscoped Docker operation." }
Push-Location $Repo
try {
    docker compose --project-name $DockerProject -f $ComposeFile up -d --wait
    php backend\artisan search:index --rebuild --environment=testing
    php backend\artisan test --filter="OpenSearch|AuthorizedSearch|SearchRanking|SearchProjection"
} finally {
    if ($DockerProject -notmatch '^rnsearch_[a-z0-9_]+$') { throw "Refusing unscoped Docker cleanup." }
    docker compose --project-name $DockerProject -f $ComposeFile down -v --remove-orphans
    Pop-Location
}
```

T50 must commit the compose configuration with immutable digest image references (not tags) and verify the supplied digest against approved build provenance before V6. `$DockerProject` is generated once per run and namespaces all containers/networks/volumes; the `finally` cleanup targets that project and compose file only. Do not run `down -v` without the asserted project name or against shared/production infrastructure.

### V7 - end-to-end/integration

```powershell
# Available only after T100 adds the committed Playwright harness and root test:e2e script.
Push-Location $Repo
try {
    npm run test:e2e
    npm test
    npm run test:backend
    npm run build
} finally { Pop-Location }
```

`npm run test:e2e` is not currently available; T100 owns its creation and the pinned `@playwright/test` runner described above. Its harness must consume `$DbName`, `$DockerProject`, `$TestDbHost`, and immutable image digest variables; assert their approved disposable prefixes before provisioning and use `Remove-RnDisposableResources` in `finally`. Manually or automatically verify production-mode `/_health`, SSR-before-hydration, login/logout cookies, origin/body/timeout rejection, queue processing/dead letters, OCR, OpenSearch degraded mode, all eleven personas, stale assignment revocation, private streams, public sessionlessness, accessibility, and backup/restore.

### V8 - security and dependency checks

```powershell
Push-Location $Repo
try {
    Initialize-RnWorktreeVenv
    composer audit --working-dir=backend
    npm audit --omit=dev
    & $Python -m pip check
    composer --working-dir=backend run analyse
    & (Join-Path $ToolCache "gitleaks\8.28.0\gitleaks.exe") git --redact --log-opts="$env:BASE_SHA..$CandidateSha"
    $ImageReference = "<registry>/<repository>@sha256:<64-lowercase-hex-digest>"
    if ($ImageReference -notmatch '^[^\s@]+@sha256:[0-9a-f]{64}$') { throw "Trivy target must be an immutable digest reference." }
    $TrivyJson = Join-Path $EvidenceDir "trivy-$CandidateSha.json"
    $TrivySarif = Join-Path $EvidenceDir "trivy-$CandidateSha.sarif"
    & (Join-Path $ToolCache "trivy\0.67.2\trivy.exe") image --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --exit-code 1 --no-progress --format json --output $TrivyJson $ImageReference
    $TrivyJsonExit = $LASTEXITCODE
    & (Join-Path $ToolCache "trivy\0.67.2\trivy.exe") image --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --exit-code 1 --no-progress --format sarif --output $TrivySarif $ImageReference
    $TrivySarifExit = $LASTEXITCODE
    if ($TrivyJsonExit -ne 0 -or $TrivySarifExit -ne 0) { throw "Trivy reported a HIGH/CRITICAL finding or scan failure; retain both reports." }
} finally { Pop-Location }
```

The first three commands are currently available only after their V1/V5 locked bootstrap inputs are installed in `$Repo`; PHPStan is T14-owned as specified in V1. T100 must bootstrap-provision pinned, checksum-recorded Gitleaks v8.28.0 and Trivy v0.67.2 into `$ToolCache` from approved artifacts before V8, verify each version/SHA-256, and make them available to CI; ambient scanner installations are not acceptable. If either tool or a locked dependency cannot be provisioned, record a blocked check rather than scanning/installing against the dirty source. T50 must publish each scan target's immutable image digest and build provenance before the Trivy command runs. Expected evidence is the candidate/base SHA, tool versions and binary/image/config hashes, redacted Gitleaks report, Trivy JSON/SARIF report, severity policy, exit codes, and documented disposition for every permitted finding; never print credentials, secrets, or manuscript content.

## Migration, rollback, and data-security controls

1. **Deployment freeze:** block `000045`/`000046`/`000047` in release automation until T17. Do not rely only on a comment or operator memory.
2. **Inventory first:** capture DB server/version/name, migration ledger/checksums, DDL, constraints, counts, max IDs, projection parity, queue/outbox state, and private-file/index manifests for every durable environment.
3. **Verified backups:** create encrypted logical backups including migration metadata and applicable routines/triggers/events plus encrypted private-storage manifests. Record SHA-256, timestamp, custodian, retention, and restore evidence.
4. **No destructive convenience commands:** never use `migrate:fresh`, `db:wipe`, table drops, destructive rollback, reset/clean, or copied production credentials against preserved data. `000045`/`000046`/`000047` rollback means restore/recovery, not `migrate:rollback`.
5. **Disposable rehearsal:** use uniquely generated databases, private-storage copies, queue namespaces, OpenSearch indexes, and Docker Compose project names. Harnesses fail unless names match approved test prefixes, `$TestDbHost` is in the Database Builder-owned allowlist, and the dedicated server attests its own approved identity; `RN_DISPOSABLE_DB` alone never authorizes execution. Cleanup is limited to the generated names.
6. **Field and invariant parity:** counts are insufficient. Compare all columns/nulls/timestamps/references and re-prove typed FK/unique/check/status/score constraints under concurrent writes.
7. **Append-only records:** audit, monitoring, retention, and privacy may be appended but never rewritten/deleted through application APIs. Corrections are compensating events linked to originals.
8. **Already-applied recovery:** preserve the `000045`/`000046`/`000047` ledger history and checksums, locate backups/source DBs, recreate typed schema additively, recover only evidenced rows, reconcile bidirectionally, and retain an exception report. Never synthesize legal/privacy history.
9. **Cutover posture:** consolidated tables remain projections. Do not drop typed sources in the release that first establishes parity. Any future removal requires a separate approved plan and retention/legal review.
10. **ID safety:** route/API IDs remain typed; projection physical IDs stay internal; every lineage operation includes type/stream; sequence allocation is transactional and isolated per lineage.
11. **Private content:** encryption at rest/in transit, least-privilege service users, private ACLs, no direct web serving, bounded parsers, ephemeral OCR text, log redaction, and tested deletion propagation are release requirements.
12. **Search revocation:** visibility/assignment changes write an outbox event in the same MariaDB transaction; APIs still reauthorize result IDs so index lag cannot leak data.
13. **Rollback triggers:** stop on parity mismatch, orphan, constraint regression, unexplained row loss, `000047` ledger/order mismatch, backup-restore failure, migration timeout beyond approved window, or security denial regression. Preserve evidence and restore/forward-repair according to the signed runbook.

## Risks and controls

| Risk                                                                    | Impact                                     | Control / stop condition                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Dirty source contains unique intended work                              | Loss or accidental publication             | Read-only provenance, hashes, owner-approved clean reproduction; no reset/clean/stash overwrite        |
| `000045`/`000046`/`000047` already altered typed/privacy/retention data | Legal/audit/data loss                      | Treat as applied; verified backups; additive typed recovery; explicit exception report; no fabrication |
| SQLite passes while MariaDB fails                                       | False release confidence                   | MariaDB fresh/upgrade/recovery/concurrency is mandatory; SQLite cannot satisfy DATA gates              |
| ID collisions or overloaded Eloquent key                                | Wrong-row read/update/IDOR                 | Typed route IDs; pair-scoped projection lineage; collision fixtures; nested parent scope               |
| Explicit-role migration grants alias authority                          | Privilege escalation                       | Ten explicit roles, no identity aliases, capability policies, full negative matrix                     |
| Stale assignment/index                                                  | Private manuscript leak                    | Immediate MariaDB reauthorization after search and on download; transactional outbox; lag SLO/alerts   |
| OCR/parser exploit or resource exhaustion                               | Host compromise/availability               | No shell, sandbox/container, MIME magic, limits/timeouts, encrypted temp files, malformed corpus tests |
| Search ranking is silently changed by missing FastText/model            | Unreproducible results                     | Versioned formula/model hash, golden corpus, explicit degraded state; TF-IDF/cosine remains separate   |
| Queue retries duplicate side effects                                    | Duplicate notifications/reviews/index rows | Idempotency keys, outbox uniqueness, stale-version checks, dead-letter/replay tests                    |
| Public/API resources leak body/path/internal IDs                        | Privacy breach                             | Field allowlists, contract snapshots, response scanning, security review                               |
| Report/CSV export leaks scope or executes formulas                      | Data exposure/client exploit               | Server authorization, bounded async export, formula escaping, audit, expiry                            |
| Frontend fallback hides backend/auth defects                            | False user data and unsafe decisions       | Fail closed on defined statuses/malformed success; labeled read-only demo only; exact path tests       |
| OpenSearch is unavailable                                               | Search outage or unsafe bypass             | Defined degraded behavior; never broaden SQL fallback scope; health/metrics/runbook                    |
| Large long-running plan causes ownership drift                          | Merge conflicts/unreviewed integration     | Global path ownership, small child PRs, dependency gates, parent checklist as control plane            |

## Persistent workstream checklist

Only the Plan Coordinator checks items, with links to exact evidence.

- [ ] E0 dirty source preserved; read-only audit authorized
- [ ] T00 provenance, secrets/private-artifact scan, DB/storage/migration inventory complete
- [ ] T01 clean implementation SHA and decision ledger approved
- [ ] Phase 1 `000045`/`000046`/`000047` destructive behavior frozen in every deployment path
- [ ] Phase 1 typed review/activity/audit/retention/privacy rows and constraints preserved
- [ ] Phase 1 `000045`/`000046`/`000047` already-applied additive recovery and verified restore pass
- [ ] Phase 1 physical/typed/lineage ID semantics and collision tests pass
- [ ] Phase 1 statistician canonical methodology API passes frontend/backend contract tests
- [ ] Phase 1 librarian `/api/librarian/catalog` contract passes
- [ ] Phase 1 research-office `/api/office/*` contract and compatibility-role denial pass
- [ ] Phase 1 focused migration, contract, authentication, session, origin, and rate tests pass on one SHA
- [ ] Phase 2 ten authenticated roles + virtual Guest/Public are explicit and documented
- [ ] Phase 2 adviser/instructor/panel/statistician designation constraints pass
- [ ] Phase 2 full role x route x method x state x assignment x object IDOR matrix passes
- [ ] Phase 3 lifecycle/prerequisite matrix and return/resubmit/archive journeys pass
- [ ] Phase 3 mutations/events are atomic, idempotent, human-controlled, and audited
- [ ] Phase 4 private upload/version/download/delete authorization passes
- [ ] Phase 4 queued extraction/OCR/retry/dead-letter/stale-version tests pass
- [ ] Phase 4 metadata provenance/completeness and projection tests pass
- [ ] Phase 5 pinned secured OpenSearch runtime and snapshot/rebuild pass
- [ ] Phase 5 BM25/FastText golden ranking and explicit degraded behavior pass
- [ ] Phase 5 public/internal authorization, stale-index, revocation, and pagination tests pass
- [ ] Phase 6 TF-IDF/cosine deterministic worker and edge-case tests pass
- [ ] Phase 6 authorized corpus, atomic persistence, non-mutating public/query, and no-auto-workflow tests pass
- [ ] Phase 7 review operations preserve typed IDs/constraints and least privilege
- [ ] Phase 7 monitoring/audit/privacy/retention append-only tests pass
- [ ] Phase 7 defense scheduling/evaluation conflict, concurrency, and assignment tests pass
- [ ] Phase 8 repository privacy/filter/page/download tests pass
- [ ] Phase 8 notification outbox/idempotency/deep-link/read-scope tests pass
- [ ] Phase 8 reports/exports reconcile, authorize, escape, and audit correctly
- [ ] Phase 9 all eleven persona workspaces pass live contract and denied-action tests
- [ ] Phase 9 SSR/hydration, responsive breakpoints, keyboard/focus, reduced-motion, and WCAG 2.2 AA gate pass
- [ ] Phase 10 disposable e2e harness refuses durable resources and passes
- [ ] Phase 10 full MariaDB/OpenSearch/queue/Python/Laravel/frontend/SSR/browser suite passes at exact SHA
- [ ] Phase 10 code/security/data reviews have no unresolved blockers/highs
- [ ] Phase 10 requirements/schema/API/search/migration/backup/operations/user docs match tested behavior
- [ ] Parent Plan PR links every child PR, SHA, command report, decision, exception, and residual risk
- [ ] X0 Product, Data, Security, Operations, and Release owners authorize leaving Draft/merging

## Exit gates

- Every in-scope traceability row has linked implementation and exact-SHA verification; no P0/P1 item remains broken/missing without explicit deferral approval.
- Typed tables and all audit/monitoring/retention/privacy history are preserved or have a signed backup-derived exception; no unexplained loss exists.
- Fresh, typed-upgrade, shadow-upgrade, and `000045`/`000046`/`000047` already-applied recovery matrices pass on MariaDB. A verified restore succeeds.
- Explicit role/designation and object-level authorization matrices pass; institution-domain denial occurs before account/session creation.
- OpenSearch returns only prefiltered and post-reauthorized records; private/revoked/stale results are never exposed.
- Upload/OCR/job/search/similarity failures are bounded, observable, retry-safe, and cannot partially transition workflow.
- All eleven persona journeys, public sessionlessness, private downloads, reports, notifications, SSR/hydration, responsiveness, and accessibility pass.
- Documentation and Plan PR evidence match the release candidate; required checks/reviews are green; residual risks have owners.
- Parent PR remains Draft until explicit release authorization. Merge, tag, deployment, or destructive cleanup are outside this planning action.

---

## Draft Plan PR body

**Title:** `plan: audit and complete ResearchNAV safely`

**Base:** repository owner must confirm the branch containing `d6b742ac45053e0e74cbb2fb7e634a248d502304`
**Head:** `plan/researchnav-completion-audit`
**State:** Draft

### Goal

Freeze destructive consolidation, preserve ResearchNAV's typed/privacy/retention records, stabilize IDs/auth/API contracts, and execute the remaining RBAC, workflow, ingestion, authorized search, similarity, operational, UI, test, and documentation work through isolated child PRs.

### Users

Guest/Public, Researcher, Research Instructor, Research Adviser, Research Panelist, Statistician, Research Coordinator, Librarian, Research Office Personnel, Academics, and Administrator.

### Immediate blockers

- The source checkout is dirty and not a reproducible implementation base.
- `000045` drops typed tables including retention/privacy without complete preservation; `000046` couples sequence setup to unsafe drops and incomplete streams; `000047` requires ledger/DDL/data-effect audit and equivalent recovery coverage.
- Consolidated physical IDs and typed lineage/API IDs are overloaded.
- Statistician, Librarian, and Research Office frontend paths disagree with Laravel.
- Institutional-domain and complete role/assignment negative tests are not release-proven.

### Scope

- Baseline provenance and owner-approved clean SHA
- Non-destructive MariaDB `000045`/`000046`/`000047` migration/recovery and explicit ID semantics
- Focused migration/contract/auth tests
- Ten explicit authenticated roles, Guest/Public, and four assignment designations
- Human-controlled workflow and immutable evidence
- Private uploads, queue jobs, OCR, metadata, and indexing
- Authorized OpenSearch BM25 retrieval with versioned FastText support
- Separate deterministic TF-IDF/cosine similarity
- Reviews, monitoring, defense, repository, notifications, reports, and all role UIs
- MariaDB/OpenSearch/queue/Python/SSR/browser/security/accessibility verification and docs

### Non-goals

- No legacy Express/PostgreSQL implementation or framework rewrite
- No typed-table deletion, vector database, public raw manuscript text, or external manuscript processing without approval
- No automated research approval/rejection or workflow transition from search/similarity/OCR
- No compatibility aliases that grant office authority and no fallback that masks auth/contract errors

### Architecture

MariaDB/private storage remain authoritative. Consolidated tables and OpenSearch are rebuildable projections. Laravel is the only identity/authorization boundary and reauthorizes search/download results. Queue workers perform bounded extraction/OCR/indexing. OpenSearch BM25 handles retrieval, FastText is versioned supporting/reranking evidence, and TF-IDF/cosine remains the separate official similarity calculation. Human workflow services enforce transitions and emit immutable events.

### Consequential decisions

- Preserve all typed review/activity tables and privacy/retention records; `000045`/`000046`/`000047` may not drop them.
- API `id` means typed domain ID; consolidated physical IDs are internal; lineage is always type/stream scoped.
- Canonical routes are `/api/statistician/methodology/*`, `/api/librarian/catalog`, and `/api/office/*`.
- Coordinator and Academics are explicit roles and never inherit Research Office authority.
- Guest/Public is virtual; document assignments are separate `adviser`, `instructor`, `panel`, and `statistician` designations.

### Workstreams

| Workstream                    | Owner                         | Status                             | Branch                                    | Child PR |
| ----------------------------- | ----------------------------- | ---------------------------------- | ----------------------------------------- | -------- |
| Baseline/provenance           | Git/Repository Steward        | Blocked on authorization           | `chore/researchnav-reproducible-baseline` | pending  |
| Database/preservation         | Database Builder              | Blocked on T01/backups             | `fix/researchnav-data-foundation`         | pending  |
| Laravel/API/domain            | Backend Builder               | Blocked on Phase 1 contracts       | `feat/researchnav-backend-core`           | pending  |
| OCR/search/similarity workers | Search Worker Builder         | Blocked on ingestion contracts     | `feat/researchnav-search-workers`         | pending  |
| OpenSearch runtime            | Search Infrastructure Builder | Blocked on infrastructure approval | `feat/researchnav-search-infra`           | pending  |
| Frontend                      | Frontend Builder              | Blocked on backend gates           | `feat/researchnav-complete-ui`            | pending  |
| E2E/CI                        | QA Automation Builder         | Blocked on integrated contracts    | `test/researchnav-e2e`                    | pending  |
| Documentation                 | Documentation Owner           | Blocked on final verification      | `docs/researchnav-release-contracts`      | pending  |

### Acceptance

- [ ] Clean implementation SHA and decision ledger approved
- [ ] `000045`/`000046`/`000047` are non-destructive; typed/privacy/retention preservation, recovery, and restore pass on MariaDB
- [ ] Typed/consolidated/lineage ID and canonical API contract tests pass
- [ ] Authentication and explicit role/designation/IDOR matrices pass
- [ ] Workflow, ingestion/OCR/jobs, authorized OpenSearch, and similarity gates pass
- [ ] Reviews, monitoring, defense, repository, notifications, and reports pass
- [ ] Eleven-persona UI, SSR, responsive, accessibility, and browser journeys pass
- [ ] Exact-SHA full suite, security/data review, documentation, and child-PR evidence are complete

### Verification

- [ ] Formatting, linting, type checks, builds
- [ ] MariaDB fresh/upgrade/`000047` already-applied recovery and verified restore
- [ ] Laravel focused/full suites and route inventory
- [ ] Python OCR/search/similarity tests and static checks
- [ ] OpenSearch ACL/ranking/rebuild/degraded-mode integration
- [ ] Frontend unit/SSR/hydration and end-to-end role journeys
- [ ] Secret/dependency/container/security review

### Risks and assumptions

The dirty source may contain the only copy of intended work; destructive migrations may already have run; institution-domain and infrastructure details require owner confirmation; parser/index lag can expose data if authorization is misplaced. Controls are read-only provenance, verified backups/additive recovery, Laravel pre/post authorization, bounded local workers, strict path ownership, and exact-SHA gates.

### Operational warning

Do not run `migrate:fresh`, `db:wipe`, destructive rollback/table drops, `git reset --hard`, `git clean`, force-push, shared-worktree staging, or OpenSearch volume deletion against any source/durable environment. This PR is a Draft plan only and does not authorize implementation, migration, deployment, merge, or release.

### Tracking

Use the persistent checklist in `v1/docs/plans/researchnav-completion-audit.md`. Check an item only with linked child PR, exact SHA, command/exit evidence, and required owner approval.

## Recommended execution handoff

After independent plan verification and explicit authorization, the Git/Repository Steward should perform T00 read-only provenance/environment inventory. Do not run `000045`/`000046`/`000047`, create implementation worktrees from the dirty checkout, or start feature work before T01 approves a clean implementation SHA and the Phase 1 data decisions.
