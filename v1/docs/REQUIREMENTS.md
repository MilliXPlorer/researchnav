# ResearchNAV Requirements

Generated: 2026-08-18 (Week 3, August 17–21). This single document consolidates the
system scope, the research lifecycle, visibility and privacy rules, functional
requirements with implementation status, non-functional requirements, and known
limitations. It is the companion to `docs/GANTT_GAP_ANALYSIS.md`.

Statuses: **Implemented and verified** / **Implemented** / **Partial** /
**Frontend only** / **Backend only** / **Missing** / **Not yet tested**.

## System scope

ResearchNAV is an institutional research management and plagiarism-adjacent
duplicate-detection system for a college:

- Researchers submit research projects (title, metadata, authors, manuscript
  files) and track them through review, revision, approval, and archiving.
- Instructors organize researchers into class sections, track submissions,
  review assigned documents, and see similarity flags.
- Advisers monitor their advisees and pending reviews; panelists schedule and
  evaluate defenses; statisticians validate methodology; the research office
  manages compliance and accounts; librarians curate repository metadata and
  retention.
- The public repository exposes only archived public research with a
  sessionless title-similarity query for duplicate checking.
- Authentication is Google ID-token SSO only. AI-generated content, AI advice,
  and AI-driven approval, feedback, or title decisions are excluded.

Out of scope (non-goals): the legacy Express/PostgreSQL backend in `server/`
(the Laravel backend is the only active system), vector databases, automatic
approval or rejection (similarity flags never decide workflow), and public
downloads of restricted manuscripts (see limitations).

## Research lifecycle

```text
draft -> submitted -> under_review -> approved -> archived
                         |
                         v
                 revision_required -> under_review
```

- Only the document owner can create, edit (`draft` or `revision_required`),
  submit, and resubmit their document.
- Reviewers (assignment-scoped adviser/instructor) or research office personnel
  move `submitted` -> `under_review` and `under_review` -> `approved`.
- Revision requests are created only while `under_review`; each request
  increments a per-document revision number.
- Only research office personnel or administrators archive approved research;
  archiving also sets `archive_status = archived` and applies visibility.
- Similarity results, title validations, methodology sign-offs, compliance
  decisions, metadata reviews, and defense schedules are separate human
  decisions that do not change workflow state by themselves.

## Visibility and privacy rules

- Visibility enum: `private` (default), `registered_only`, `public`.
- Public repository query: `submission_status IN ('approved','archived')` AND
  `archive_status = 'archived'` AND `visibility = 'public'` AND `deleted_at IS
  NULL`.
- Private draft metadata is never returned by public endpoints; public API
  resources hide internal author ids (`user_id`).
- Manuscript files live on the private local disk (`storage/app/private`) and
  are served only through authenticated download routes. Never expose stored
  paths, import checksums, or source filenames in public responses.
- Imported corpus studies are made `archived`/`public` only by explicit
  repository-operator command; their `submitted_at`/`approved_at` remain null.
- Audit logs, monitoring logs, retention logs, and privacy logs are
  append-only.

## Functional requirements

### Authentication and accounts (W3)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| AUTH-1 | Google ID-token SSO verifies audience, expiry, and `email_verified` | Implemented and verified | `backend/app/Services/GoogleClientVerifier.php`, `tests/Unit/GoogleClientVerifierTest.php` |
| AUTH-2 | New accounts start `blocked`/`pending` until provisioned | Implemented and verified | `User` model default, `tests/Feature/ApiContractTest.php` |
| AUTH-3 | Account states: active, pending (invited/blocked), suspended, inactive | Implemented and verified | `access_status` + `account_status`, `EnsureActiveAccount` |
| AUTH-4 | Administrator bootstrap is idempotent | Implemented and verified | `BootstrapAdminCommandTest` |
| AUTH-5 | Sessions: cookie session, regenerate on login, server logout, expiry, discard middleware | Implemented and verified | `StartResearchNavSession`, `ApiController@logout`, sign-out middleware (SSR 302 + client-side clearing) |
| AUTH-6 | Institution domain allowlist (`hd` claim) enforced | Missing | —; any verified Google account currently becomes a blocked researcher |
| AUTH-7 | Audit logging of mutations with request context | Implemented | `AuditService`; coverage test for admin index pending |

### Roles and authorization (W3)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| RBAC-1 | Eight canonical roles seeded idempotently | Implemented and verified | `UserRoleSeeder`, 8 roles |
| RBAC-2 | Legacy role strings map to canonical slugs; `role`/`role_id` stay synchronized | Implemented and verified | `User::canonicalSlugForLegacyRole`, `CanonicalResearchSchemaTest` |
| RBAC-3 | Route middleware enforces role, active account, active admin | Implemented and verified | `bootstrap/app.php`, `routes/web.php`, `RoleWorkspaceApiTest` |
| RBAC-4 | Assignment-scoped review: only active assigned advisers/instructors (or office/admin) review | Implemented and verified | `DomainAuthorization::canReview`, `ReviewAuthorizationTest` |
| RBAC-5 | Compatibility roles (panel, statistician, coordinator, librarian, academics) never inherit office authority | Implemented and verified | `DomainAuthorization::isOffice`, `ReviewAuthorizationTest` |
| RBAC-5a | Assigned panelists and statisticians can read their notified record only; they never receive reviewer mutation authority | Implemented and verified | `isAssignedRecordReader`, reviewer deep-link tests |
| RBAC-6 | Comprehensive automated role-access matrix covering guests, inactive accounts, cross-role access, IDOR, admin scope | Partial | `ReviewAuthorizationTest`, `RoleWorkspaceApiTest`, `ApiContractTest`; dedicated matrix test pending |
| RBAC-7 | Model policy classes for every mutable entity | Partial | 5 policies exist; ClassSection, DefenseSchedule, Evaluation, Compliance/MetadataReview, SavedLibraryItem policies pending |

### Database (W3, deadline 2026-08-22)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| DB-1 | All 44 migrations apply on an empty MariaDB | Implemented and verified | 29 schema tables; `submission_reference` is required and unique |
| DB-2 | `migrate:status` clean; no pending migrations | Implemented and verified | 44 total migrations after applying `2026_09_01_000040` |
| DB-3 | Non-destructive corrective migrations | Implemented and verified | `2026_08_14_000017` pattern |
| DB-4 | Default connection is MariaDB; SQLite is tests-only | Implemented and verified (2026-08-18) | `config/database.php` default `mariadb`; stale sqlite artifact removed |
| DB-5 | Duplicate prevention via unique keys per entity | Partial | Authors, file versions, section members, assignments, evaluations, methodology, library, compliance, metadata; uniques missing for similarity re-checks, pending title validations, section names, defense schedules |
| DB-6 | Schema and setup documentation matches implementation | Implemented | `backend/DATABASE_SCHEMA.md`, `backend/DATABASE_SETUP.md` (29 tables / 44 migrations) |
| DB-7 | Schema tests cover all tables, key columns, unique keys | Implemented (2026-08-18) | `CanonicalResearchSchemaTest` (24 tables, 7 unique keys) |

### Similarity algorithm (W3)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| SIM-1 | TF-IDF + cosine over titles is the official scoring basis | Implemented and verified | `similarity/` worker, `SimilarityService` |
| SIM-2 | 10-step pipeline: normalize, tokenize, lowercase, punctuation, stopwords, TF-IDF, cosine, percentage, rank, flag | Implemented and verified | `docs/SIMILARITY_ALGORITHM.md` |
| SIM-3 | Source title is never compared with itself | Implemented and verified | CLI, service, model, DB CHECK |
| SIM-4 | Candidates are archived, public, and non-deleted only | Implemented and verified (2026-08-18) | `whereNull('deleted_at')` on internal path + regression test |
| SIM-5 | Internal scores persisted atomically; public queries sessionless and rate-limited | Implemented and verified | `SimilarityCheckTest`, `PublicRepositorySimilarityTest` |
| SIM-6 | Scores bounded 0..1, six decimals; NaN/infinity rejected | Implemented and verified | engine, runner, DB CHECKs |
| SIM-7 | Deterministic ranking (score desc, id tiebreak) | Implemented and verified | engine tests |
| SIM-8 | Threshold `0.700000` in one authoritative constant; instructor buckets derive from it | Implemented and verified (2026-08-18) | `SimilarityResult::FLAG_THRESHOLD` |
| SIM-9 | FastText is optional supporting-only; absence degrades, never changes rank | Implemented | Both paths null supporting context while TF-IDF scoring continues |
| SIM-10 | Edge cases: empty corpus, punctuation-only, stop-word-only, non-ASCII, duplicates, oversize input | Implemented and verified (2026-08-18) | `test_engine.py` (23 tests) |

### Repository module (W3)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| REP-1 | Browse archived public research | Implemented and verified | `PublicRepositoryController@index`, `CatalogPage` |
| REP-2 | Detail modal with full metadata | Implemented and verified | `MetadataDialog` |
| REP-3 | Title-similarity public query with rate limits | Implemented and verified | `POST /api/repository/similarity` |
| REP-4 | Keyword/author/category literal search | Partial | Catalog search uses similarity scoring; literal keyword search path not verified |
| REP-5 | Year/category/institute filters, sorting, pagination | Partial | UI filters exist; server-side filter query strings not verified |
| REP-6 | Access-controlled document downloads | Implemented | Active authenticated users download only current archived final manuscripts through the audited catalog route |
| REP-7 | Private/draft/deleted research never public | Implemented and verified | Repository query + deleted-at fix |

### Researcher submission workflow (W4)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| SUB-1 | Dashboard "New Submission" opens the working flow | Implemented and verified (2026-08-18) | Dashboard selects the live sidebar form; frontend regression test |
| SUB-2 | Full submission form with document upload, draft save, edit, cancel guard, submit | Implemented and verified (2026-08-18) | Reusable form in `RoleSidebarPages.tsx`; create/upload/submit/edit tests |
| SUB-3 | Backend submit validates draft completeness | Implemented and verified (2026-08-18) | `ResearchService::ensureCompleteForSubmission`, `ResearchSubmissionTest` |
| SUB-4 | Author add/edit/order/remove from the draft UI | Implemented and verified (2026-08-18) | Create/edit form + transactional ordered author replacement |

### Class sections, defense, evaluation, methodology, compliance, metadata (W4–W6)

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| CS-1 | Instructor class sections with members and documents (modal-driven UI) | Implemented and verified | `InstructorController`, `Modal.tsx`, section tests |
| DS-1 | Defense scheduling with status lifecycle | Implemented and verified | `DefenseScheduleService`, coordinator/instructor routes |
| EV-1 | Panel evaluations (1–5 scores, unique per document+panelist) | Implemented | `EvaluationService` |
| MET-1 | Statistician methodology checklist, sign-off, clarification return | Implemented | `MethodologyReviewService` |
| COMP-1 | Research office compliance endorsement/return | Implemented | `ComplianceService` |
| META-1 | Librarian metadata completeness review | Implemented | `LibrarianController@saveMetadataReview` |
| REV-1 | Review assignments drive reviewer authorization | Implemented and verified | `ReviewAssignmentService` |
| FB-1 | Feedback comments with status lifecycle | Implemented | `FeedbackService` |
| RV-1 | Revisions with per-document incremented numbers and resubmission | Implemented and verified | `RevisionService` |
| VAL-1 | Human title validation decisions referencing similarity results | Implemented | `TitleValidationService` |
| SUB-5 | Stable required unique researcher submission reference, contacts, progress history, and deep-linked records | Implemented | `submission_reference`, migration `000040`, researcher record workspace, monitoring API |
| FB-2 | Researcher acknowledgement/address action separate from reviewer resolution | Implemented | feedback acknowledgement fields and owner-only endpoint |

## Non-functional requirements

- **Security**: origin allowlist on mutating routes; security headers; bounded
  worker input; validation on every boundary; append-only audit/monitoring
  logs; sessions never initialized for public repository visitors.
- **Reliability**: atomic persistence of similarity checks; no partial writes on
  worker failure (503/502 with zero writes); idempotent seeders and bootstrap
  commands.
- **Determinism**: identical title inputs produce identical outputs across
  deployments (fixed stopword list, id tiebreak).
- **Performance**: candidate caps (`MAX_CANDIDATES = 250`), query throttles,
  database indexes on all filter columns.
- **Portability**: SQLite used only by the test suite; MariaDB is the runtime
  database; Python worker runs via Windows/macOS/Linux Python with pinned
  requirements.

## Known limitations (accepted for this phase)

- Cron/retention automation is manual (librarian records retention logs).
- No institution-domain allowlist on Google sign-in (AUTH-6).
- Downloading archived manuscripts by repository visitors is not implemented.
- `server/` (Express/PostgreSQL) remains as legacy reference only.
