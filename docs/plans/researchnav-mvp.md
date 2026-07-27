# RESEARCHNAV MVP — Authoritative Implementation Plan

## 1. Document control

| Field                    | Value                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Repository               | `https://github.com/MilliXPlorer/researchnav`                                                              |
| Parent branch            | `plan/researchnav-mvp`                                                                                     |
| Parent base              | `main`                                                                                                     |
| Plan worktree            | `<worktree-root>/researchnav-plan`                                                                         |
| Canonical plan           | `docs/plans/researchnav-mvp.md`                                                                            |
| Parent PR state          | Draft until every selected release gate passes                                                             |
| Initial release boundary | Sprint 1 foundation and responsive public/authenticated shells only                                        |
| Full roadmap boundary    | All dependency-ordered workstreams in section 15; later work is planned, not claimed delivered by Sprint 1 |

This document is the implementation control plane. If a child PR, ticket, or informal decision conflicts with it, update and approve this plan before implementing the conflict. The PR Coordinator alone maintains the Draft parent PR body. This planning change must not be interpreted as configured Google credentials, deployed infrastructure, or completed product code.

## 2. Objective and release intent

Build RESEARCHNAV as a secure institutional research workflow and publication system. The system must let authorized institutional users manage research work, immutable document/title history, deterministic title-similarity checks, reviews, monitoring, and publication while exposing only approved repository records to the public.

The first implementation increment must be deliberately smaller and coherent:

1. Scaffold the Laravel modular monolith and test/tooling baseline.
2. Establish identity, institute/program/class, canonical institutional role, class/study assignment, permission, and append-only audit foundations.
3. Implement Google account linking behind a testable provider boundary, including a safe waiting flow for unapproved users.
4. Provide version-controlled institute/program reference data support while keeping class membership and study assignments separate.
5. Deliver a responsive public landing page, an empty published-repository search experience, and authenticated role-aware dashboard shells.
6. Prove the foundation with automated tests without claiming real Google OAuth is usable until credentials and redirect URIs are configured externally.

## 3. Users and needs

| User                          | Primary need                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System Administrator          | Manage system configuration, institutes, accounts, canonical roles, audit access, and the permitted assignment of Research Coordinators, Librarians, and Research Office Personnel. |
| Research Coordinator          | Coordinate institute research operations and assign Research Instructors to authorized classes.                                                                                     |
| Research Instructor           | Manage assigned classes; assign class Researchers/Student Researchers and study-specific Research Adviser, Panel Chairperson, Panel Member, Statistician, and Editor participants.  |
| Researcher/Student Researcher | Maintain research in an assigned class/study, submit immutable titles and soft-copy versions, respond to comments/revisions, and complete monitoring requirements.                  |
| Research Adviser              | Access only advised studies, review progress and versions, and provide attributable guidance/comments.                                                                              |
| Panel Chairperson             | Lead only assigned defense/review tasks, coordinate panel findings, and record the authorized chairperson outcome.                                                                  |
| Panel Member                  | Access only assigned defense/review material and submit attributable comments/review output.                                                                                        |
| Librarian                     | Perform only controlled librarian tasks, including authorized repository/official-copy checks and actions delegated by policy.                                                      |
| Research Office Personnel     | Perform authorized publication verification, publication/correction actions, reporting, and research-office tasks.                                                                  |
| Statistician                  | Access only assigned studies and submit statistical review comments/results within the assigned task.                                                                               |
| Editor                        | Access only assigned studies and submit editorial comments/results within the assigned task.                                                                                        |
| Guest/Public                  | Understand RESEARCHNAV and search/view only records explicitly published to the public repository.                                                                                  |

These names are canonical. A generic “program coordinator,” “reviewer,” “adviser,” or “institution administrator” must not replace them. One person may hold multiple institutional roles, but an active role never implies institute membership, class membership, or study assignment; all four concepts are separately granted, revoked, authorized, and audited.

## 4. Requirements

### 4.1 Functional requirements

- **R-01 Public separation:** `/` and `/repository*` are public surfaces with separate layouts, navigation, query services, and projections from `/app*`. Public code must never query draft research records as a fallback.
- **R-02 Identity:** Authenticate through Google Socialite, store the stable Google subject identifier, require a verified email, prevent unsafe automatic account merging, and expose a fake identity-provider callback boundary in tests.
- **R-03 Waiting flow:** A successfully authenticated but unapproved user can see a waiting page and sign out, but cannot enter protected application modules.
- **R-04 Institute/class/study scope:** Model institutes and programs as reference data, classes as instructional cohorts, institutional roles as permission bundles, institute memberships as affiliation, class memberships as roster placement, and study-specific assignments as separately normalized concepts. No one concept substitutes for another.
- **R-05 Authorization:** Every protected read uses a Policy/Gate or scope query; every mutation also uses a Form Request and a service/action. Controllers remain transport adapters.
- **R-06 Audit:** Security and consequential domain actions produce append-only, actor-aware audit records with correlation IDs and minimized metadata.
- **R-07 Research records:** Later work supports studies, class membership, study-specific assignments, exact title/research-progress status families, private immutable/versioned soft copies, comments, revisions, external results, official-copy selection, and lifecycle history.
- **R-08 Similarity and relevance:** Laravel creates an institutionally authorized comparison corpus and invokes stateless FastAPI using official scikit-learn TF-IDF/cosine with the submitted title included in the fitted matrix. Internal title similarity, related-study relevance, optional FastText context, and externally produced/manually recorded Turnitin result are four separate labeled records and UI outputs.
- **R-09 Review:** Later work supports Research Adviser, Panel Chairperson, Panel Member, Statistician, and Editor study assignments; review tasks; attributable comments; immutable submissions/revisions; and exact review-task/comment status families.
- **R-10 Monitoring:** Later work supports separately configurable **Before Proposal Defense** and **After Proposal Defense** monitoring templates, responses, verification, activation/defense controls, permissions, statuses, and append-only monitoring logs. The two template families are never collapsed into one generic checklist.
- **R-11 Publication:** Research Office Personnel controls publication under policy, with controlled Librarian official-copy tasks. Later work implements official-copy selection, explicit publication/correction workflow, immutable public projections, reports, audit, and backup/restore operations. Approval, official-copy selection, publication, correction, and public visibility are distinct.
- **R-12 Async behavior:** Long-running similarity, notification, and publication projection work uses idempotent jobs; user-facing notifications use Laravel notifications.
- **R-13 Storage:** Research documents are stored on a private Laravel disk and downloaded only through policy-protected controllers. File paths are never public URLs.
- **R-14 History:** Soft-copy/document versions, title versions, analysis/external-result records, review/comment/revision submissions, repository versions, study status-family events, audit logs, and monitoring logs are immutable; corrections append superseding records.
- **R-15 Search:** Sprint 1 returns a truthful, accessible empty repository state. Later publication work adds paginated search over published repository projections only.

### 4.2 Quality requirements

- Server-rendered Blade pages enhanced progressively with Alpine; core navigation and forms work without JavaScript where practical.
- Responsive behavior from 320 px width upward, keyboard operation, visible focus, semantic landmarks, skip link, correctly associated labels/errors, and WCAG 2.2 AA contrast.
- MySQL migrations are reversible where data safety permits and are tested against the supported MySQL version, not only SQLite.
- No OAuth token, document content, submitted title, corpus title, or sensitive form payload is written to application/NLP logs.
- Queue jobs are retry-safe and observable. External calls have bounded timeouts, retry budgets, circuit-breaking behavior, and correlation IDs.
- The full test suite is deterministic and does not call Google or download FastText models.

## 5. Scope by release

### 5.1 Sprint 1 — committed implementation scope

- Laravel application scaffold, Blade, Tailwind, Alpine, Vite, PHPUnit, Pint, static analysis, and CI-ready scripts.
- Modular folder/routing/migration conventions and baseline health endpoint.
- Identity/institute/program/class/RBAC/audit foundation, models, factories, canonical seed importer, and all canonical institutional role codes. Sprint 1 may use placeholder dashboards, but may not omit role seeds.
- Socialite Google adapter plus fake provider boundary; redirect, callback, link/collision handling, logout, pending-account waiting page, and active-account middleware.
- Public landing and repository search route with an empty published-projection result.
- Authenticated shell and deterministic role-aware dashboard router with placeholder dashboards clearly marked as foundation UI.
- Responsive/accessibility contract and automated feature/unit tests.

### 5.2 Post-Sprint roadmap — planned in this parent program

- Full public landing/repository search, filters, details, published official-copy access rules, and correction/withdrawal history.
- Study, class roster, study-specific participant, title/version, exact status, and private versioned soft-copy workspaces.
- Stateless FastAPI NLP plus separate internal-title-similarity, related-study-relevance, optional FastText-context, and manual external Turnitin result records/history.
- Research Adviser/Panel Chairperson/Panel Member/Statistician/Editor tasks, comments, reviews, revisions, and official-copy selection.
- Separate Before Proposal Defense and After Proposal Defense templates, activation, responses, verification, outcomes, permissions, and monitoring logs.
- Research Office Personnel publication/correction; Librarian controlled tasks; reports; audit views/exports; backups/restores; notifications; operational hardening; and release documentation.

### 5.3 Non-goals

- Password authentication, Microsoft/social providers, or automatic linking solely because emails resemble each other.
- A SPA, Livewire dependency, mobile app, GraphQL API, or public write API.
- Training a proprietary model, using an LLM, semantic embedding service, fuzzy-match engine, or model other than optional FastText.
- Letting the NLP service access MySQL, Laravel storage, authorization policy, or arbitrary external URLs.
- Mutable replacement of uploaded files, similarity history, reviews, publications, audit logs, or monitoring logs.
- Public exposure of draft titles, private documents, review content, monitoring content, identities, or unpublished projects.
- Real Google credential provisioning, DNS, paid infrastructure, production deployment, email/SMS provider procurement, data migration from an unspecified legacy system, or legal retention-policy approval.
- Claiming the later lifecycle modules are complete as part of Sprint 1.
- Treating Turnitin as an integrated API: the roadmap records an externally generated result manually with provenance and authorization unless a separate approved integration is added later.

## 6. Architecture

### 6.1 System boundaries

```text
Browser
  ├─ public Blade surface: / and /repository* ─────────────┐
  └─ session-authenticated Blade surface: /app*            │
                                                           v
Laravel modular monolith ── MySQL (system of record)
  ├─ Policies/Gates + scoped query services
  ├─ Form Requests -> actions/services -> domain records
  ├─ database queue/scheduler -> jobs + notifications
  ├─ private filesystem abstraction -> immutable files
  └─ HTTP client (service credential, timeout) ─────────────┐
                                                           v
Stateless Python FastAPI NLP service
  └─ scikit-learn TF-IDF + cosine; optional FastText extra
```

Laravel is the only business authority and the only component that accesses MySQL/storage. FastAPI accepts an already authorized, bounded corpus and returns deterministic scores without persistence. The public repository reads a publication projection rather than research aggregate tables.

### 6.2 Laravel modular-monolith convention

Use framework-native code organized by domain, not independently deployed PHP packages:

```text
app/Domain/{Identity,Institutes,Classes,Studies,Similarity,Reviews,Monitoring,Publication,Reports,Audit,Notifications}/
app/Http/{Controllers,Requests,Middleware}/<module>/
resources/views/<module>/
routes/modules/<module>.php
database/migrations/<module>/
tests/{Unit,Feature,Integration}/<module>/
```

The scaffold owns a deterministic route and migration loader so modules can add files without editing shared registries. Cross-module behavior goes through named actions/query services and domain events, not controller-to-controller calls. Models do not authorize themselves. Database writes involving an aggregate, its immutable event, and mandatory audit evidence share one transaction. Notifications are dispatched after commit.

### 6.3 Runtime baseline

- Pin the supported stable Laravel/PHP combination selected during `S1-01` in `composer.lock`; preferred baseline is PHP 8.3+ and Laravel 12.x unless the contract PR records a newer supported major.
- MySQL 8.0+ with `utf8mb4`; production and CI migration gates use MySQL.
- Blade + Tailwind CSS + Alpine.js through Vite. Avoid a component framework that introduces a fourth visual language.
- Laravel Socialite Google driver; database sessions, cache, and queue are safe greenfield defaults. A production queue/cache substitution is operational configuration, not a domain rewrite.
- FastAPI service lives under `services/nlp/` with a separately pinned Python environment. It has no shared runtime or database migrations with Laravel.
- Private storage uses Laravel's `private` disk. Local private storage is acceptable for development; production may configure private S3-compatible storage without changing application contracts.

## 7. Normalized data strategy

Use ULIDs for externally referenced aggregate IDs and numeric surrogate IDs for small static catalogs where appropriate. All timestamps are UTC; display conversion is a presentation concern. Foreign keys restrict destructive deletes; domain records are archived/disabled instead. Controlled states are PHP/Python enums represented as constrained strings so names remain legible. JSON is limited to snapshots/metadata whose keys are versioned and not relationally queried.

### 7.1 Sprint 1 tables

| Area                  | Tables and constraints                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity              | `users` (canonical email, display profile, account state); `oauth_accounts` (provider + stable subject unique, user FK, verified-email snapshot, linked/revoked timestamps; no access token by default).                                                                                                                                                                                              |
| Institutes/reference  | `institutes` (code/slug unique, active flag); `institute_email_domains`; `programs` (institute FK, code unique within institute, active flag); and `classes` (institute/program/term/reference code). Programs remain reference data; authorization is expressed through institute, class, and study semantics.                                                                                       |
| Membership/assignment | `institute_memberships` records affiliation; `class_memberships` records Research Instructor/Researcher/Student Researcher roster placement. Later, `study_groups`, `study_group_members`, and `study_role_assignments` normalize study-level Researcher/Student Researcher and specialist duties. These are independent records with separate lifecycle and must never be inferred from one another. |
| Authorization         | `roles`, `permissions`, `role_permissions`; strongly keyed `system_role_assignments` and `institute_role_assignments`. Institutional role assignment is separate from `institute_memberships`, `class_memberships`, and `study_role_assignments`. Unique constraints prevent duplicate grants. Sprint 1 seeds every canonical code in section 9.1 even when its dashboard is a labeled placeholder.   |
| Audit                 | `audit_logs` with event key, actor/impersonator nullable FKs, subject type/ULID snapshot, institute/class/study scope, request/correlation ID, outcome, minimized metadata JSON, IP/user-agent hashes, and immutable timestamp.                                                                                                                                                                       |
| Public foundation     | `repository_entries` exists as the public projection root but receives no fake published content in Sprint 1; public queries always require `visibility = published` and a non-null publication timestamp.                                                                                                                                                                                            |
| Framework             | Sessions, cache, queue jobs/batches, failed jobs, password reset tables only if required by framework internals, and database notifications when introduced. No password UI is exposed.                                                                                                                                                                                                               |

Seed data is idempotent and keyed by stable codes. Production reference catalog data lives in a reviewable file distinct from factories. Tests use factories and must not depend on a real institute. Exact institute/program names and codes require approved catalog input at the `S1-02` entry gate. Class and study records are operational data, not embedded program-role scopes.

### 7.2 Later tables

| Module                             | Normalized records                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Studies/documents                  | `studies`, `study_groups`, `study_group_members`, normalized `study_role_assignments`, immutable `study_title_versions`, append-only status-family events, logical private `soft_copy_documents`, immutable `soft_copy_versions` (disk/path/checksum/MIME/size/uploader), and explicit `official_copy_selections`.                                                                                                                               |
| Four result outputs                | (1) `internal_title_similarity_runs/results`; (2) `related_study_relevance_runs/results`; (3) optional `fasttext_context_results` with model checksum; and (4) `external_turnitin_results` manually recorded from the external report with percentage, report/reference metadata, recorder, recorded time, and private evidence file. They may share an execution-attempt base but are never one ambiguous `similarity_results` row or UI label. |
| Reviews/comments                   | `review_templates` and immutable versions/criteria, `review_rounds`, study-scoped `review_tasks`, immutable `review_submissions`/item responses, `review_decisions`, attributable `comments`, `comment_revisions`, revision requests/responses, and supersession links.                                                                                                                                                                          |
| Before Proposal Defense monitoring | Separate `before_proposal_templates`/versions/items, study activation, immutable responses, verification records, outcomes, and append-only monitoring events.                                                                                                                                                                                                                                                                                   |
| After Proposal Defense monitoring  | Separate `after_proposal_templates`/versions/items, defense activation, immutable responses, verification records, outcomes, and append-only monitoring events. Shared value objects are allowed, but template roots, activation, permission keys, responses, verification, and status reporting remain phase-specific.                                                                                                                          |
| Publication                        | `publication_requests`, Research Office Personnel verification/decisions/events, Librarian controlled-task records, `official_copy_selections`, `repository_entries`, immutable `repository_entry_versions`, correction/version/publication/withdrawal events, and searchable current public projection fields.                                                                                                                                  |
| Reports/operations                 | Saved report definitions/exports where required, scoped audit exports, backup-run/restore-verification metadata (never backup payloads in MySQL), Laravel notifications, domain-event outbox/delivery attempts, and failed-job records.                                                                                                                                                                                                          |

Indexes must follow actual access paths: scope + state + created date on protected lists; assignment + status; public visibility + publication date; unique sequence/version per aggregate; checksum where deduplication is advisory; and MySQL FULLTEXT only on public projection fields after representative query testing. Migration PRs include an `EXPLAIN` check for new list/search queries.

### 7.3 Study groups and normalized study-role assignments

- `study_groups` has exactly one owning `study_id`; a study has exactly one current group. `study_group_members` links a user through an active Researcher/Student Researcher `class_membership_id`, preserving the source class and member history.
- `study_role_assignments` stores `study_id`, `user_id`, `role_code`, optional `study_group_member_id`, lifecycle, grant/revoke actor and timestamps, reason, and optimistic-lock/version metadata. Allowed role codes are `researcher`, `research_adviser`, `panel_chairperson`, `panel_member`, `statistician`, and `editor`.
- Researcher/Student Researcher is a first-class study role in the same normalized table as specialist assignments. It is not inferred from class membership. Its `study_group_member_id` is mandatory and must identify the same user and study; specialist rows must leave that field null.
- Assignment lifecycle is exactly `pending`, `active`, or `removed`. Activation appends grant/activation evidence; revoke transitions to `removed` with actor, time, and reason. Rows are never deleted or recycled.
- A study has one or more active Researcher/Student Researcher assignments before research submission. Each active group member has exactly one active `researcher` assignment for that study, and a user has at most one non-removed `researcher` assignment per study.
- Specialist cardinality per study is zero-or-one non-removed Research Adviser, zero-or-one non-removed Panel Chairperson, zero-or-many Panel Members, zero-or-one Statistician, and zero-or-one Editor. Pending singleton assignments reserve their slot; removal releases it. Workflow gates may require configured specialists or a minimum panel count without weakening database maximums.
- A user cannot hold Researcher/Student Researcher and specialist assignments on the same study. Duplicate user/study/role assignments and conflicting singleton assignments are prevented transactionally with unique/generated active keys and locking appropriate to MySQL.
- Only the Research Instructor assigned to the study's owning class may grant, activate, manage, or revoke class Researcher/Student Researcher membership, group-member linkage, and `study_role_assignments`. Removal of a class member or group member transactionally removes the corresponding active researcher study role; history remains queryable.
- Authorization tests cover missing class membership; pending/removed institute, class, group-member, or study-role state; mismatched user/group/study linkage; duplicate or over-cardinality assignment; unauthorized instructor/class/institute; specialist conflict; grant/revoke audit; stale concurrent grant; removed assignment access; and role-only access without an active study assignment.

## 8. State distinctions and invariants

State changes occur through named actions, are validated against per-family transition maps, and append history. The exact families below are separate contract registries; implementers must preserve their labels/keys and must not replace them with one simplified project lifecycle. C-02 maps each approved specification label to a stable snake-case key, actor, transition, and terminal/non-terminal meaning before migrations are authored.

| Concern                               | Distinct states/invariants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication                        | Google authentication success is separate from account activation, membership activation, and role assignment. `pending`, `active`, `suspended`, and `rejected` account states do not modify OAuth link history.                                                                                                                                                                                                                                                                                          |
| Membership/assignment                 | Institute membership (`pending`, `active`, `disabled`), class membership (`pending`, `active`, `completed`, `removed`), institutional role assignment, and every `study_role_assignments` row (`pending`, `active`, `removed`) are separate. Only `active` study-role assignments authorize study access. Removed rows retain grant/revoke history; none of these concepts is inferred from another.                                                                                                      |
| **Title Status**                      | `Draft`, `Submitted`, `Under Evaluation`, `For Revision`, `Approved`, `Rejected`, `Superseded`. A title version is immutable; a revised title is a new version.                                                                                                                                                                                                                                                                                                                                           |
| **Research Progress Status**          | `Title Preparation`, `Title Evaluation`, `Before Proposal Defense`, `Proposal Defense`, `After Proposal Defense`, `Final Defense`, `Completed`, `Archived`. This is progress reporting only and does not collapse title, document, monitoring, review-task, or publication state.                                                                                                                                                                                                                         |
| **Publication Status**                | `Not Yet Eligible`, `Pending Official Copy`, `For Publication`, `Publication Verification`, `Published`, `Correction Pending`, `Corrected`, `Withdrawn`. Official-copy selection and public projection success are explicit prerequisites/events, not aliases for status.                                                                                                                                                                                                                                 |
| **Review Task Status**                | `Pending Assignment`, `Assigned`, `Accepted`, `Declined`, `In Progress`, `Submitted`, `Returned for Revision`, `Verified`, `Completed`, `Cancelled`. Research Adviser, Panel Chairperson, Panel Member, Statistician, and Editor tasks retain assignment type and actor.                                                                                                                                                                                                                                  |
| **Document Status**                   | `Draft`, `Submitted`, `Under Review`, `For Revision`, `Approved`, `Selected as Official Copy`, `Superseded`, `Withdrawn`. A logical private soft copy has append-only versions; “current” and “official” are explicit pointers/selections, never in-place file replacement.                                                                                                                                                                                                                               |
| **Comment Status**                    | `Open`, `Addressed`, `Resolved`, `Reopened`. Comment text/replies remain attributable and immutable; resolution changes append events.                                                                                                                                                                                                                                                                                                                                                                    |
| **Before Proposal Monitoring Status** | `Not Activated`, `Active`, `Response Submitted`, `For Revision`, `Verified`, `Completed`. Activation is a Research Instructor-authorized study action and uses the configured Before Proposal Defense template version.                                                                                                                                                                                                                                                                                   |
| **After Proposal Monitoring Status**  | `Not Activated`, `Defense Activated`, `Active`, `Response Submitted`, `For Revision`, `Verified`, `Completed`. Defense activation is explicit, permission-gated, audited, and uses the separately configured After Proposal Defense template version.                                                                                                                                                                                                                                                     |
| Result execution/interpretation       | Internal title-similarity and related-study-relevance runs use `queued`, `running`, `succeeded`, `failed`, `cancelled`; optional FastText context has its own availability/model state; external Turnitin is `not_recorded`, `recorded`, `superseded`, `voided`. Score bands default to **Low 0–39.99**, **Moderate 40–69.99**, and **High 70–100**, are configurable/versioned, and support display/triage only. Every approval, rejection, relevance, revision, and publication decision is human-only. |

Database constraints protect uniqueness/FKs/checkable state shape; services protect cross-record transitions; tests prove both. Immutable model update/delete attempts fail in application code, and production DB permissions should deny ad hoc writes to log/history tables outside the application migration role.

## 9. Authorization contract

### 9.1 Permission model

Seed stable permission keys rather than role-name conditionals. Initial keys include `dashboard.view`, `account.activate`, `account.suspend`, `institute.manage`, `institute_membership.grant`, `institute_membership.revoke`, `program.create`, `program.manage`, `program.deactivate`, `class.create`, `class.manage`, `class.close`, `institutional_role.grant`, `institutional_role.revoke`, `class_researcher.grant`, `class_researcher.revoke`, `study_role.grant`, `study_role.revoke`, `audit.view`, `study.create`, `study.view`, `study.manage`, `document.upload`, `document.download`, `official_copy.select`, `internal_similarity.run`, `related_relevance.run`, `external_turnitin.record`, `review_task.assign`, `review_task.revoke`, `review_task.reassign`, `review_task.accept`, `review_task.decline`, `review_task.submit`, `review_task.complete`, `comment.create`, `comment.resolve`, `before_proposal_template.manage`, `before_proposal.activate`, `before_proposal.respond`, `before_proposal.evidence.submit`, `before_proposal.verify`, `after_proposal_template.manage`, `after_proposal.defense_activate`, `after_proposal.respond`, `after_proposal.evidence.submit`, `after_proposal.verify`, `monitoring.oversight.view`, `monitoring.publication_item.view`, `monitoring.publication_item.verify`, `publication.verify`, `publication.publish`, `publication.correct`, `publication.withdraw`, `repository.manage`, `report.view`, and `backup.verify`.

Sprint 1 seeds these canonical role codes and exact display names even when their dashboards are placeholders: `system_administrator` (**System Administrator**), `research_coordinator` (**Research Coordinator**), `research_instructor` (**Research Instructor**), `researcher` (**Researcher/Student Researcher**), `research_adviser` (**Research Adviser**), `panel_chairperson` (**Panel Chairperson**), `panel_member` (**Panel Member**), `librarian` (**Librarian**), `research_office_personnel` (**Research Office Personnel**), `statistician` (**Statistician**), and `editor` (**Editor**). **Guest/Public** is the unauthenticated actor, not an assignable database role. Code checks permission plus applicable institute membership, class membership, and active `study_role_assignments` row—not a display name alone.

### 9.2 Assignment and management authority matrix

| Resource/action                                                                     | Actor allowed to grant, revoke, or manage                                                                                                                                                                          | Required boundary and audit                                                                                                                                                                 | Explicit deny rules                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account activation/suspension                                                       | System Administrator may manage account activation, suspension, and restoration                                                                                                                                    | Record actor, reason, previous/new state, session revocation, and correlation ID                                                                                                            | Every lower role is denied; no self-activation from pending; no self-suspension or suspension of the last active System Administrator; OAuth success never activates an account                                                             |
| Institute membership                                                                | System Administrator may grant, activate, manage, revoke/disable, or restore institute membership                                                                                                                  | Explicit target institute; account and membership state remain separate                                                                                                                     | Research Coordinator and all lower roles cannot grant/revoke institute membership or move a user between institutes                                                                                                                         |
| Programs                                                                            | System Administrator may create, activate, manage/update, deactivate, and archive institute program reference records                                                                                              | Explicit institute; prevent deactivation while prohibited active dependencies remain                                                                                                        | Research Coordinator may read but not mutate program reference data; all lower roles are denied program management                                                                                                                          |
| Classes                                                                             | Research Coordinator may create, activate, manage/update, close, and restore classes within the authorized institute/program                                                                                       | Active Research Coordinator institute membership; class code/term constraints; closure reason                                                                                               | Research Instructor cannot create/reopen/transfer a class; no cross-institute/program class management; lower roles are denied                                                                                                              |
| System Administrator institutional role                                             | A different active System Administrator may grant or revoke through the protected succession service                                                                                                               | Recent reauthentication, immutable reason, at least two-person confirmation when configured, and at least one other active System Administrator remains                                     | Every lower role is denied; no self-grant, self-revoke, or removal of the last active System Administrator                                                                                                                                  |
| Research Coordinator, Librarian, Research Office Personnel institutional roles      | System Administrator may grant, activate, revoke, and manage these institute-role assignments                                                                                                                      | Target has active institute membership; grantor cannot exceed own scope; append audit                                                                                                       | Research Coordinator and all lower roles cannot grant/revoke these roles or System Administrator; no self-grant                                                                                                                             |
| Research Instructor institutional role and class placement                          | Research Coordinator may grant/revoke the Research Instructor institute role and assign/remove the Research Instructor from classes                                                                                | Same institute and authorized class; preserve historical placement                                                                                                                          | System Administrator does not bypass the Coordinator-to-Instructor chain; Research Instructor and lower roles cannot grant/revoke Research Instructor or higher roles                                                                       |
| Researcher/Student Researcher class membership                                      | Research Instructor may grant pending/active class membership, manage roster state, and remove membership                                                                                                          | Only a class actively assigned to that Research Instructor; target has active institute membership                                                                                          | Research Coordinator does not directly place researchers; no self-enrollment, cross-class, cross-program, or cross-institute grant; lower roles cannot alter rosters                                                                        |
| Researcher/Student Researcher study group and role                                  | Research Instructor may create/manage group-member linkage and grant/activate/revoke `study_role_assignments.role_code = researcher`                                                                               | Study belongs to the assigned class; active matching class membership; cardinality and same-user/group/study constraints                                                                    | Class membership alone grants no study access; Researcher/Student Researcher cannot self-join, invite, activate, or revoke; no cross-study/group link                                                                                       |
| Research Adviser, Panel Chairperson, Panel Member, Statistician, Editor study roles | Research Instructor may grant pending/active and revoke the applicable `study_role_assignments` row                                                                                                                | Study belongs to the assigned class; target has active institute membership; specialist cardinality/conflict policy                                                                         | Research Coordinator does not assign study specialists; specialists cannot grant/revoke themselves or peers; no institutional role or class membership can substitute for active study assignment                                           |
| Review-task assign/revoke/reassign                                                  | Research Instructor may assign, revoke, or reassign a review task                                                                                                                                                  | Study belongs to the Research Instructor's assigned class; assignee has an active matching `study_role_assignments` row; preserve every assignment/revocation/reassignment event and reason | Research Coordinator and all review-task assignees cannot assign/revoke/reassign; no cross-study, cross-class, inactive-assignee, self-assignment, or role/task-type mismatch; submitted review content is never deleted on revoke/reassign |
| Review-task accept/decline/complete                                                 | The specifically assigned Research Adviser, Panel Chairperson, Panel Member, Statistician, or Editor may accept, decline, submit, and complete only their own review task                                          | Active account, institute membership, study-role assignment, and current task assignment; transition and completion requirements pass                                                       | Research Instructor cannot impersonate assignee acceptance, decline, submission, or completion; assignees cannot act on another task or after revoke/reassign/removal; generic reviewer or institutional role alone grants nothing          |
| Before/After Proposal template management                                           | Research Coordinator may create, version, publish, retire, and manage phase-specific templates within the authorized institute                                                                                     | Active Research Coordinator institute membership; immutable published versions; each action names exactly one phase                                                                         | Research Instructor and lower roles cannot manage templates; Before Proposal permissions never grant After Proposal management or vice versa; no cross-institute mutation                                                                   |
| Before Proposal form activation                                                     | Research Instructor may activate the configured Before Proposal Defense form for a study in the assigned class                                                                                                     | Eligible research-progress state, frozen template version, active researcher study roles, actor/reason audit                                                                                | Research Coordinator has read-only oversight and cannot activate; researchers/specialists cannot self-activate; no After Proposal form or cross-class activation                                                                            |
| After Proposal defense/form activation                                              | Research Instructor may record defense activation and activate the configured After Proposal Defense form for a study in the assigned class                                                                        | Authorized defense event, eligible progress, frozen template version, actor/reason audit                                                                                                    | No activation before the defense event; Research Coordinator remains read-only; researchers/specialists cannot activate; Before Proposal activation cannot satisfy this action                                                              |
| Monitoring response/evidence                                                        | Researcher/Student Researcher may submit phase-specific responses and immutable evidence for their own active study                                                                                                | Active class membership, group-member link, active researcher `study_role_assignments`, open phase/form, safe private evidence validation                                                   | No response for another group/study, closed or wrong phase, pending/removed assignment, or inactive account; evidence cannot overwrite a prior version                                                                                      |
| Monitoring verification                                                             | Research Instructor may verify assigned-class items; study-assigned Research Adviser, Panel Chairperson, Panel Member, Statistician, or Editor may verify only item types explicitly delegated to that active role | Current phase, active study/task assignment, template verification rule, separation-of-duty rule, and append-only outcome                                                                   | No generic institutional-role verification, self-verification where prohibited, cross-task/study/class/institute verification, wrong-phase verification, or action after assignment removal                                                 |
| Monitoring institute oversight                                                      | Research Coordinator may read institute-scoped Before/After Proposal dashboards, status, and reports through `monitoring.oversight.view`                                                                           | Authorized institute, scope-filtered query before pagination, redacted content where detail permission is absent                                                                            | Read-only: cannot activate forms, submit evidence, verify responses, alter statuses, or use oversight to gain private study access                                                                                                          |
| Monitoring publication items                                                        | Research Office Personnel may view and verify only monitoring items explicitly marked as publication prerequisites                                                                                                 | Active institute authority, eligible study, selected official copy, configured publication checklist, provenance/audit                                                                      | Cannot alter templates, activate phases, rewrite researcher evidence, perform academic verification outside delegated publication items, or bypass missing/failed prerequisites                                                             |
| Controlled Librarian task                                                           | Authorized workflow service may assign/revoke a bounded task to an active Librarian; Librarian manages only task progress                                                                                          | Task names study/repository action, scope, expiry, and allowed records                                                                                                                      | Librarian cannot self-assign, grant roles/memberships, select an unauthorized copy, publish, correct, or gain general study access                                                                                                          |
| Research Office publication action                                                  | Active Research Office Personnel may verify, publish, correct, or withdraw through `publication.verify`, `publication.publish`, `publication.correct`, and `publication.withdraw`                                  | Eligible study, selected official copy, institute authority, provenance, and configured separation of duties                                                                                | Cannot grant roles/memberships, rewrite source versions, bypass prerequisites, or publish/withdraw outside institute scope                                                                                                                  |

Global deny rule: a lower role can never grant, revoke, or manage a higher institutional role. System Administrator exclusively controls System Administrator succession and the institutional roles explicitly assigned to that actor above; Research Coordinator is limited to Research Instructor; Research Instructor is limited to assigned-class researcher membership and study roles. No actor may self-grant, widen their own scope, bypass an inactive account/institute membership, or convert a class/study assignment into an institutional grant. Denials are enforced in both Policy/Gate and transactional service layers and are audit-tested.

“Assigned-reviewer scope” means the current, non-revoked `review_tasks.assignee_user_id` plus a matching active study-role assignment and allowed task type. It is not a generic Reviewer role. Accept, decline, submit, and complete checks must re-evaluate that scope at action time; reassignment or revocation immediately denies further action while preserving prior submissions and history.

Monitoring permissions are phase-specific and configurable without cross-phase implication. By default, Research Coordinator manages/publishes institute-scoped Before Proposal Defense and After Proposal Defense template versions; Research Instructor activates Before Proposal monitoring for an assigned-class study and separately records/activates the After Proposal Defense phase after the authorized defense event; Researcher/Student Researcher submits responses for their study; and the explicitly permitted Research Instructor and/or study-assigned Research Adviser/Panel Chairperson verifies or returns responses according to the template policy. System Administrator may administer permission definitions but does not become a verifier by default. Every override is institute-scoped, least-privilege, and audited. Holding a Before Proposal permission grants no After Proposal permission, and defense activation is not inferred from research-progress text.

### 9.3 Mandatory rules

- Guest/Public can access only public landing, published repository routes, OAuth entry/callback, and operational liveness endpoints that expose no internals.
- Pending users can access only waiting/status, safe account-link resolution, and POST logout.
- Suspended/rejected users receive no protected content even if old assignments remain.
- List queries are scope-filtered before pagination. Policies additionally protect each record to prevent IDOR.
- Researcher/Student Researcher, Research Adviser, Panel Chairperson, Panel Member, Statistician, and Editor gain study access only through an active `study_role_assignments` row, never merely an institutional role, institute membership, or class membership.
- System Administrator, Librarian, and Research Office Personnel roles do not imply unrestricted study-content access. Controlled task/record policy and separately gated audit metadata still apply.
- Public repository queries use `repository_entries`/versions only. They never hydrate private study/soft-copy/review/comment relationships.
- `AuthorizedInstitutionalComparisonCorpus` follows the configured institutional comparison policy (for example, allowed institute/class/program/public scope) independently from candidate-display authorization. Laravel constructs it server-side and does not accept it from a browser. `CandidateVisibilityPolicy` separately decides whether each matched candidate's title, authors, study link, and metadata may be shown. A policy-eligible comparison candidate may therefore contribute a score while the UI shows only a restricted-match label; comparison eligibility must never become an information-disclosure shortcut.
- Every mutation uses CSRF/session protection, a Form Request, policy authorization, a transactional action/service, and required audit/monitoring events.
- Private files stream through a policy controller with safe headers; storage paths, signed provider URLs, and existence differences are not leaked to unauthorized users.

Authorization behavior is table-driven for Guest/Public, pending users, every canonical role, and every matrix edge. It must prove account activate/suspend allow/deny and session revocation; institute-membership grant/revoke; program and class management boundaries; every institutional-role grant/revoke tier; Research Instructor class-roster and researcher/specialist study-role grant/revoke; review-task assign/revoke/reassign plus assigned-reviewer accept/decline/submit/complete scope; phase-specific monitoring template/activation/response/evidence/verification; Research Coordinator read-only oversight; Research Office Personnel publication-item verification and withdrawal; cross-phase and unauthorized denies; lower-role prohibition on higher grants; self-grant denial; cross-institute/class/study denial; pending/removed membership or assignment denial; group/member-link integrity; cardinality/concurrency enforcement; controlled Librarian tasks; and System Administrator last-active-account protection.

## 10. Route and API contract

### 10.1 Browser routes

| Method/path                                                | Access                                                | Purpose/release                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /`                                                    | Public                                                | Landing page; Sprint 1.                                                                                                   |
| `GET /repository?q=&program=&year=&page=`                  | Public                                                | Published-projection search and accessible empty state; Sprint 1 foundation, full filters later.                          |
| `GET /repository/{entry:slug}`                             | Public                                                | Published record detail; later publication work. Unpublished/withdrawn returns indistinguishable 404.                     |
| `GET /auth/google/redirect`                                | Guest/Public or authenticated linking user; throttled | Start Google OAuth. Show controlled unavailable response if real configuration is absent.                                 |
| `GET /auth/google/callback`                                | OAuth state protected; throttled                      | Resolve provider identity through the boundary, link/create safely, regenerate session.                                   |
| `GET /auth/waiting`                                        | Authenticated pending                                 | Waiting/status page.                                                                                                      |
| `POST /logout`                                             | Authenticated + CSRF                                  | Invalidate session and regenerate token.                                                                                  |
| `GET /app`                                                 | Active authenticated                                  | Role-aware dashboard router; Sprint 1.                                                                                    |
| `GET /app/dashboard/{role}`                                | Active + scoped permission                            | Role shell only when actor holds that role/scope; Sprint 1.                                                               |
| `/app/studies*`                                            | Active + class/study policy                           | Study/title/progress/private soft-copy/version/official-copy lifecycle; later.                                            |
| `/app/studies/{study}/analysis/internal-title-similarity*` | Active + policy                                       | Queue/view the separately labeled internal title-similarity record; later.                                                |
| `/app/studies/{study}/analysis/related-study-relevance*`   | Active + policy                                       | Queue/view separately labeled related-study relevance; later.                                                             |
| `/app/studies/{study}/analysis/fasttext-context*`          | Active + policy/config                                | View optional FastText context separately; later.                                                                         |
| `/app/studies/{study}/external-results/turnitin*`          | Active + Form Request/policy                          | Manually record/supersede externally generated Turnitin result and private evidence; never presented as internal NLP.     |
| `/app/review-tasks*` and `/app/comments*`                  | Active + study assignment/policy                      | Research Adviser, Panel Chairperson, Panel Member, Statistician, and Editor task/comment/review/revision workflow; later. |
| `/app/monitoring/before-proposal*`                         | Active + phase-specific policy                        | Before Proposal Defense templates, activation, responses, verification; later.                                            |
| `/app/monitoring/after-proposal*`                          | Active + phase-specific policy                        | After Proposal Defense templates, defense activation, responses, verification; later.                                     |
| `/app/publication*`                                        | Research Office Personnel/Librarian controlled policy | Official-copy checks, verification, publication, correction, projection/withdrawal; later.                                |
| `/app/reports*` and `/app/operations/backups*`             | Explicit scoped permission                            | Authorized reports/audit exports and backup/restore verification; later.                                                  |
| `GET /health/live`                                         | Public, minimal                                       | Process liveness only. Readiness/detail is private or infrastructure-restricted.                                          |

State-changing browser routes use POST/PUT/PATCH only where semantically appropriate; immutable records generally use POST to append a new version/action. No destructive GET routes.

### 10.2 Internal Laravel/NLP boundary

Laravel calls the NLP service server-to-server. Browsers cannot reach it through a Laravel passthrough endpoint.

`POST /v1/similarity/score`

```json
{
  "request_id": "01J...",
  "algorithm": "tfidf_cosine_v1",
  "purpose": "internal_title_similarity",
  "submitted": { "id": "title-version-ulid", "title": "Submitted title" },
  "corpus": [
    { "id": "authorized-title-version-ulid", "title": "Authorized title" }
  ],
  "options": { "fasttext": false }
}
```

Successful response:

```json
{
  "request_id": "01J...",
  "algorithm": {
    "name": "tfidf_cosine_v1",
    "library": "scikit-learn",
    "library_version": "pinned",
    "preprocessing_version": "academic_title_v1",
    "stop_words_version": "academic_stop_words_v1",
    "config_hash": "sha256:..."
  },
  "corpus_count": 1,
  "results": [
    {
      "id": "authorized-title-version-ulid",
      "rank": 1,
      "tfidf_cosine": 0.4182,
      "fasttext_cosine": null
    }
  ],
  "warnings": []
}
```

Contract rules:

- UTF-8 JSON only; submitted title and each corpus title are 1–500 normalized characters; corpus IDs are unique; maximum corpus is 5,000 items and request bytes are bounded.
- Validation failures use RFC 9457 problem details with stable error codes and do not echo complete titles. Empty corpus succeeds with an empty result list.
- `purpose` is one of `internal_title_similarity` or `related_study_relevance`; Laravel persists and labels the two result families separately. The submitted title is always the first fit input, followed by the policy-authorized corpus in request order—it is not transformed against a corpus-only fit.
- `academic_title_v1` preprocessing is versioned and fixture-tested: decode/remove HTML safely; Unicode NFKC normalization and case folding; normalize typographic punctuation; define tested handling for punctuation, slashes, apostrophes, hyphens (preserve meaningful compound-token information while also exposing separated terms where validated), and repeated/Unicode spaces; tokenize with a pinned explicit token pattern; and apply the versioned custom `academic_stop_words_v1` list. The custom academic stop-word list removes only demonstrated non-discriminating research-title terms and is regression-tested to preserve meaningful technical terms, acronyms, numbers, domain names, and compounds. Stemming and lemmatization are initially disabled and may be enabled only in a new preprocessing/algorithm version after approved accuracy tests show benefit without harmful technical-term loss.
- Implement `tfidf_cosine_v1` with official `sklearn.feature_extraction.text.TfidfVectorizer` configured with the versioned preprocessor/tokenizer/custom stop-word list, `ngram_range=(1, 2)`, `norm="l2"`, `use_idf=True`, `smooth_idf=True`, and `sublinear_tf=False`, plus official `sklearn.metrics.pairwise.cosine_similarity`. Rank descending by unrounded score then stable ID; round only for serialization. Stop words must not remain permanently `None`.
- Default display bands are configurable/versioned: **Low = 0–39.99**, **Moderate = 40–69.99**, **High = 70–100** after converting cosine to percentage. Bands are labels for human review, never automatic approval, rejection, revision, relevance, or publication decisions.
- FastText is disabled by default, installed as an optional Python dependency/model mount, and produces a separately persisted and separately labeled **FastText context** output with model checksum when explicitly enabled. It never overwrites internal TF-IDF title similarity or related-study relevance. No network model download occurs at request time or in tests.
- External Turnitin percentage/report data never enters this endpoint as an internally computed result. Laravel manually records it as a separately labeled **External Turnitin Result**, with provenance, recorder, date, optional notes, private evidence, and supersession history.
- Institutional comparison eligibility and candidate visibility are separate Laravel policies. FastAPI returns opaque candidate IDs and scores; Laravel applies `CandidateVisibilityPolicy` before showing title/author/study metadata and can display a restricted candidate without leaking its identity.
- Service authentication is a rotated secret/mTLS deployment concern; Laravel sends correlation ID and version headers. Use connect/read timeouts, no unbounded retry, and no request-body logs.
- `GET /health/live` proves process health; `GET /health/ready` proves pinned model/config readiness without exposing secrets or data.
- Laravel persists the purpose, submitted snapshot, corpus policy/version/checksum/count, preprocessing/stop-word/algorithm/config versions, response scores, candidate-visibility decision, and attempt outcome. The NLP service persists nothing and cannot decide authorization or any workflow outcome.

## 11. UI and accessibility contract

### 11.1 Visual system

The three core colors are exact and exclusive:

```css
--color-forest: #002818;
--color-warm-ivory: #fff8ed;
--color-peach: #e9a77c;
```

- Forest is the primary text/navigation/action color, warm ivory the principal canvas, and restrained peach a sparing emphasis/focus/supporting accent.
- White (`#FFFFFF`) may appear only as a neutral surface (for example, a card or form field), never as a branded accent or dominant replacement for warm ivory.
- No fourth branded color is introduced. Tints/opacity must derive from the three tokens and remain contrast-tested. Status is never communicated by color alone; use text, icon, and shape. Native black/transparent and browser rendering are not promoted to brand tokens.
- Do not use peach for small text on white/ivory. Primary buttons use forest with warm-ivory text; focus treatment is obvious against every surface.

### 11.2 Shell behavior

- Public shell: skip link, landmark header/nav/main/footer, concise value proposition, repository-search entry, sign-in action, and truthful privacy/publication copy.
- Auth shell: responsive top bar and collapsible navigation, institute/program/class/study context as applicable, role/scope switcher only when multiple valid assignments exist, page title/breadcrumb, notification placeholder, and POST logout.
- Dashboard router: choose a deterministic valid shell from the canonical role codes in section 9.1, retain explicit valid user selection, and never use presentation switching to bypass institute membership, class membership, study assignment, or task authorization. Sprint 1 provides a clearly labeled placeholder shell for every seeded canonical role.
- Analysis UI never merges unlike evidence. It renders four explicit cards/sections named **Internal Title Similarity**, **Related-Study Relevance**, **FastText Context (Optional)**, and **External Turnitin Result (Manually Recorded)**. Each shows its source/version/date and human-only decision notice; candidate metadata is redacted when candidate visibility is not authorized.
- Monitoring UI has separate navigation, template editors, activation actions, response forms, verification queues, permissions, and status labels for **Before Proposal Defense** and **After Proposal Defense**; the latter exposes a distinct defense-activation action.
- Waiting page: explains that Google sign-in succeeded but access is pending; identifies no internal approver details unless configured; offers refresh/status and logout; does not loop through OAuth.
- Repository empty state differentiates “nothing has been published” from “no result matches this query” and keeps the search form usable.

### 11.3 Accessibility/responsiveness gates

- Support 320, 375, 768, 1024, and 1440 px viewports without horizontal page scrolling at 200% zoom.
- Keyboard order follows visual order; menus/dialogs follow WAI-ARIA patterns; Alpine state preserves appropriate `aria-expanded`, focus return, and Escape behavior.
- Every form has persistent labels, instructions, inline error association, summary focus on validation error, and preserved safe input.
- Meet WCAG 2.2 AA contrast, target size, focus appearance, motion preference, heading hierarchy, landmark, and accessible-name requirements.
- Automated axe checks cover landing, repository empty/no-results, waiting, and each dashboard shell; manual keyboard and 200% zoom checks remain mandatory because automation is insufficient.

## 12. Security, privacy, and operational controls

| Risk area            | Required control                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth/linking        | Socialite state validation; verified email requirement; stable provider subject unique; session regeneration; callback throttling; no tokens stored unless a later approved need exists. If a provider subject is new but its email belongs to another account, stop at a conflict workflow—never silently merge. Linking to an existing signed-in account requires recent authentication and explicit confirmation. |
| Unconfigured Google  | Validate configuration before redirect and show a controlled unavailable state. Tests bind `GoogleIdentityProvider` to a fake. Documentation uses placeholders only. Never claim real OAuth passed without external callback evidence.                                                                                                                                                                               |
| Session/web          | Secure/HttpOnly/SameSite cookies by environment, CSRF, POST logout, idle/absolute timeout policy, session invalidation on suspension, rate limits, trusted proxy/host configuration, CSP and standard security headers.                                                                                                                                                                                              |
| Authorization/IDOR   | Deny by default; Policy/Gate plus scoped query; ownership/assignment tests; opaque IDs; consistent 404 for hidden resources. Cache keys include user/scope and are invalidated after grants/revocations.                                                                                                                                                                                                             |
| Validation           | Form Requests normalize and bound input; services re-check invariants transactionally; database constraints are final defense. Escape Blade output; sanitize only explicitly supported rich text (plain text is default).                                                                                                                                                                                            |
| Files                | Allowlisted MIME/extensions with server-side detection, size limits, random private paths, checksum, malware-scan quarantine hook before availability, safe `Content-Disposition`, and no executable serving.                                                                                                                                                                                                        |
| NLP                  | Server-to-server authentication, egress restriction, bounded body/corpus, timeout, pinned dependencies/model checksum, no payload logging, and no DB/storage credentials. Fail closed to a recorded retry/manual state, not a fabricated score.                                                                                                                                                                      |
| Immutability         | Append/supersede actions only, model guards, FK restrictions, immutable-record tests, and separate migration/operator DB authority. No System Administrator “edit history” shortcut.                                                                                                                                                                                                                                 |
| Audit/privacy        | Same-transaction audit for consequential events; redact tokens/titles/documents; hash network identifiers where policy permits; separately authorize export; retention/legal hold remains configurable and must be approved before destructive purging.                                                                                                                                                              |
| Supply chain/secrets | Lockfiles, dependency audits, secret scan before commit, no `.env`/credentials/model binaries in Git, least-privilege service accounts, reviewed update PRs.                                                                                                                                                                                                                                                         |
| Jobs/notifications   | Idempotency keys, after-commit dispatch, bounded retries/backoff, failed-job alerting, recipient reauthorization at send time, and no sensitive data in email subjects/bodies by default.                                                                                                                                                                                                                            |
| Observability        | Structured logs with request/job/run correlation IDs, event names and latency but no payloads; health endpoints; counters for OAuth failures, authorization denials, queue failures, NLP latency/error, publication projection errors, and monitoring overdue calculation.                                                                                                                                           |

## 13. Dependency graph and release gates

```text
PLAN
 ├─ C-01 UI contract ─────────────┐
 └─ C-02 API/data contract ───────┴─> S1-01 scaffold
                                      ├─> S1-02 identity/reference/RBAC/audit data ─> S1-04 OAuth/waiting
                                      ├─> S1-03 responsive shells ───────────────────┐
                                      └─> S1-05 public projection foundation ────────┤
                         S1-02 + S1-03 + S1-05 ─> S1-06 public/dashboard application ┤
                         S1-04 + S1-06 ───────────────────────────────> S1-07 integration/security
                                                                        └─> S1-08 docs/Sprint 1 gate

S1-08 ─> L-00 administration/authority ─> L-01 studies/private soft copies ┬─> L-03 analysis/external results ─> L-04 review/comments ─┐
C-02 + S1-01 ─> L-02 FastAPI NLP ─────┘                                           ├─> L-06 publication
L-01 ─────────────────────────────────────────────> L-05 before/after monitoring ───────────────────┘
L-03 + L-04 + L-05 + L-06 ─> L-07 notifications/reports/audit/backups
                                  └─> L-08 full integration/security/performance
                                        └─> L-09 documentation/release gate
```

### Entry gates

- A task starts only after all listed dependencies are merged into the current parent plan branch.
- Its isolated worktree is clean, points to the declared child branch, and is based on the latest parent plan commit.
- Contracts, ownership paths, acceptance criteria, fixtures, and required external input are frozen.
- No other active task owns the same path. Shared-file changes require an explicit ownership transfer and serialization.
- Real integration tests requiring credentials may be skipped only with a documented reason and must not be represented as passed.

### Exit gates for every task

1. Owner self-checks changed scope while changes remain unstaged.
2. Independent Pre-Commit Tester inspects ownership/diff/secrets and runs focused checks; returns evidence-based PASS.
3. Git Steward stages explicit owned paths only, verifies staged diff, and commits after PASS.
4. PR Coordinator opens a child PR to `plan/researchnav-mvp`, links it in the Draft parent PR, and records acceptance/test evidence.
5. PR Tester tests the exact commit; Code Reviewer reviews every task; Security Reviewer reviews identity, authorization, files, NLP, publication, and final integration tasks.
6. Blocking findings use a Fix Agent in the same worktree and repeat the complete pre-commit gate. No force-push or amend of shared commits.
7. PR Coordinator merges only green approved child PRs and checks off the parent item.

Sprint 1 exits only after `S1-01` through `S1-08` pass on the combined plan branch. Later tasks stay unchecked and must not block labeling the Sprint 1 milestone complete, but the parent program PR remains Draft until the selected full-release scope is explicitly decided.

## 14. Branch, worktree, and file-ownership strategy

### 14.1 Rules

- Parent: `plan/researchnav-mvp` -> `main`. Every child branch targets the parent, never `main` directly.
- Worktree convention: `<worktree-root>/researchnav-<task>`.
- One task has one accountable owner. Test/review agents are gates, not co-owners.
- Ownership is an exclusive write lease for the task's active lifetime. Reading other paths is allowed; editing them is not.
- Shared root/registry/config changes are owned by `S1-01` initially and later only by serialized integration tasks `S1-07`/`L-08`. Module tasks must use module-owned route, migration, view, and test paths.
- Tests live in the owning module namespace. A test that crosses modules belongs to the serialized integration task.
- Never use `git add .`; never stage `.env`, credentials, model binaries, private files, logs, caches, dependencies, or unrelated changes.

### 14.2 Exact workstream map

| ID    | Single owner                     | Branch / worktree suffix                                           | Dependencies           | Exclusive write ownership                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | -------------------------------- | ------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C-01  | UI/UX Designer                   | `contract/researchnav-ui` / `c01-ui`                               | PLAN                   | `docs/contracts/researchnav-ui.md` only                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C-02  | API/Data Contract Agent          | `contract/researchnav-api-data` / `c02-api-data`                   | PLAN                   | `docs/contracts/researchnav-api-data.md` and `docs/contracts/fixtures/**` only                                                                                                                                                                                                                                                                                                                                                                                                                   |
| S1-01 | Backend Builder                  | `feat/researchnav-scaffold` / `s101-scaffold`                      | C-01, C-02             | Root Laravel scaffold and shared registries: `artisan`, `bootstrap/**`, `config/**`, `public/index.php`, `composer.json`, `composer.lock`, `package.json`, lockfile, `phpunit.xml`, `vite.config.*`, `tailwind.config.*`, `postcss.config.*`, baseline `app/Providers/**`, baseline `routes/console.php`, loader-only `routes/web.php`, baseline `resources/js/app.*`, `resources/css/app.css`, `.env.example`, CI config, and scaffold tests. Excludes `.gitignore` and all module paths below. |
| S1-02 | Database Builder                 | `feat/researchnav-identity-data` / `s102-identity-data`            | S1-01                  | `app/Domain/Identity/Models/**`, `app/Domain/Institutes/Models/**`, `app/Domain/Classes/Models/**`, `app/Domain/Authorization/**`, `app/Domain/Audit/Models/**`, `database/migrations/{identity,institutes,classes,authorization,audit}/**`, `database/factories/{Identity,Institutes,Classes,Authorization}/**`, `database/seeders/{Identity,Institutes,Classes,Authorization}/**`, `database/data/institutes.*`, `tests/{Unit,Feature}/Database/Foundation/**`                                 |
| S1-03 | Frontend Builder                 | `feat/researchnav-shells` / `s103-shells`                          | S1-01                  | `resources/views/{components,layouts,public,auth,dashboard}/**`, `resources/js/components/**`, `resources/css/components/**`, `tests/Browser/Shells/**`, visual/a11y fixtures. Shared token entry files are changed only here after an explicit handoff from S1-01.                                                                                                                                                                                                                              |
| S1-04 | Backend Builder                  | `feat/researchnav-google-auth` / `s104-google-auth`                | S1-02                  | `app/Domain/Identity/{Actions,Contracts,DTOs,Services,Support}/**`, `app/Http/Controllers/Auth/**`, `app/Http/Requests/Auth/**`, `app/Http/Middleware/EnsureActiveAccount.php`, `app/Providers/IdentityServiceProvider.php`, `routes/modules/auth.php`, `tests/{Unit,Feature}/Identity/**`                                                                                                                                                                                                       |
| S1-05 | Database Builder                 | `feat/researchnav-public-foundation` / `s105-public-data`          | S1-01                  | `app/Domain/Publication/Models/RepositoryEntry.php`, `app/Domain/Publication/Queries/**`, `database/migrations/publication/**`, `database/factories/Publication/**`, `tests/{Unit,Feature}/Database/PublicRepository/**`                                                                                                                                                                                                                                                                         |
| S1-06 | Backend Builder                  | `feat/researchnav-public-dashboard` / `s106-public-dashboard`      | S1-02, S1-03, S1-05    | `app/Domain/Dashboard/**`, `app/Http/Controllers/{PublicSite,Dashboard}/**`, `app/Http/Requests/PublicSite/**`, `routes/modules/{public,dashboard}.php`, `tests/Feature/{PublicSite,Dashboard}/**`                                                                                                                                                                                                                                                                                               |
| S1-07 | Integration Agent                | `integration/researchnav-sprint1` / `s107-integration`             | S1-04, S1-06           | Cross-module tests under `tests/Integration/Sprint1/**`; only this serialized task may repair shared scaffold/registry/config/token files and integration defects. It may not add later lifecycle features.                                                                                                                                                                                                                                                                                      |
| S1-08 | Documentation Agent              | `docs/researchnav-sprint1` / `s108-docs`                           | S1-07                  | `README.md`, `docs/{setup,architecture,operations,testing}/**`, `.env.*.example` documentation values only; excludes `docs/plans/**` and `docs/contracts/**`                                                                                                                                                                                                                                                                                                                                     |
| L-00  | Backend Builder                  | `feat/researchnav-administration-authority` / `l00-administration` | S1-08                  | `app/Domain/Identity/Administration/**`, `app/Domain/Institutes/{Actions,Policies,Queries,Services}/**`, `app/Domain/Classes/{Actions,Policies,Queries,Services}/**`, `app/Domain/Authorization/{Actions,Policies,Services}/**`, matching Administration controllers/requests, `routes/modules/administration.php`, `resources/views/administration/**`, `tests/**/Administration/**`; serialized ownership transfer from S1-02 where needed                                                     |
| L-01  | Backend Builder                  | `feat/researchnav-study-soft-copies` / `l01-studies`               | L-00                   | `app/Domain/Studies/**`, matching Study/SoftCopy controllers/requests/policies/jobs, `routes/modules/studies.php`, `resources/views/studies/**`, `database/migrations/studies/**`, `tests/**/Studies/**`                                                                                                                                                                                                                                                                                         |
| L-02  | Backend Builder (Python service) | `feat/researchnav-nlp-service` / `l02-nlp`                         | C-02, S1-01            | `services/nlp/**` only, including its lock/config/tests; no Laravel files                                                                                                                                                                                                                                                                                                                                                                                                                        |
| L-03  | Backend Builder                  | `feat/researchnav-analysis-results` / `l03-analysis`               | L-01, L-02             | `app/Domain/Similarity/**`, `app/Domain/ExternalResults/**`, matching Analysis/ExternalResult controllers/requests/policies/jobs, `routes/modules/{analysis,external-results}.php`, `resources/views/{analysis,external-results}/**`, `database/migrations/{similarity,external-results}/**`, `tests/**/{Similarity,ExternalResults}/**`                                                                                                                                                         |
| L-04  | Backend Builder                  | `feat/researchnav-reviews` / `l04-reviews`                         | L-01, L-03             | `app/Domain/{Reviews,Comments}/**`, matching Review/Comment controllers/requests/policies/jobs, `routes/modules/{reviews,comments}.php`, `resources/views/{reviews,comments}/**`, `database/migrations/{reviews,comments}/**`, `tests/**/{Reviews,Comments}/**`                                                                                                                                                                                                                                  |
| L-05  | Backend Builder                  | `feat/researchnav-monitoring` / `l05-monitoring`                   | L-01                   | `app/Domain/Monitoring/**`, matching Monitoring controllers/requests/policies/jobs, `routes/modules/monitoring.php`, `resources/views/monitoring/**`, `database/migrations/monitoring/**`, `tests/**/Monitoring/**`                                                                                                                                                                                                                                                                              |
| L-06  | Backend Builder                  | `feat/researchnav-publication` / `l06-publication`                 | L-04, L-05             | Remaining `app/Domain/Publication/**`, Publication controllers/requests/policies/jobs, `routes/modules/publication.php`, `resources/views/publication/**`, repository detail/search extensions explicitly listed in its child PR, remaining `database/migrations/publication/**`, `tests/**/Publication/**`. S1 public files require a serialized ownership transfer.                                                                                                                            |
| L-07  | Backend Builder                  | `feat/researchnav-reports-operations` / `l07-operations`           | L-03, L-04, L-05, L-06 | `app/Domain/{Notifications,Reports,Backups}/**`, remaining `app/Domain/Audit/{Actions,Queries,Policies,Services}/**`, `app/Notifications/**`, matching controllers/requests/views/routes, `database/migrations/{notifications,reports,backups}/**`, `tests/**/{Notifications,Reports,Backups,AuditOperations}/**`, and cross-module listeners explicitly delegated by prior owners                                                                                                               |
| L-08  | Integration Agent                | `integration/researchnav-full` / `l08-integration`                 | L-07                   | `tests/Integration/FullSystem/**`, `tests/Browser/FullSystem/**`, deployment/CI shared config, and serialized cross-module repairs. No new product capability.                                                                                                                                                                                                                                                                                                                                   |
| L-09  | Documentation Agent              | `docs/researchnav-release` / `l09-docs`                            | L-08                   | Release updates to `README.md`, `docs/{setup,architecture,operations,testing,user-guides}/**`, API runbook, backup/restore and incident procedures; excludes plan/contracts                                                                                                                                                                                                                                                                                                                      |

If generated scaffold files differ from these names, `S1-01` must publish the exact manifest in its child PR before dependent branches are created. Any ownership exception must name the file, previous owner, new owner, and start/end commit in the parent PR.

## 15. Executable workstreams

### C-01 — UI/accessibility contract

- **Entry:** Plan PR exists; palette and Sprint 1 surfaces are accepted.
- **Deliver:** Screen inventory, responsive layouts, component/state matrix, role-shell navigation, copy states, token usage, keyboard/focus behavior, and axe/manual checklist. No application code.
- **Accept:** Every Sprint 1 route has loading/empty/error/unauthorized/responsive states; only the three exact core colors plus neutral white surface are specified; WCAG requirements are testable.
- **Verify:** Markdown link/lint check; token grep; reviewer manually maps every section 11 rule to the contract.

### C-02 — API/data/security contract

- **Entry:** Plan PR exists; role/scope and immutability decisions are accepted.
- **Deliver:** ERD/data dictionary; the exact eight status-family registries in section 8; canonical actor and assignment-authority matrix; institute/class/study separation; `study_groups`, `study_group_members`, and `study_role_assignments` lifecycle/cardinality/linkage contract; route payload/validation/errors; OAuth provider interface; NLP preprocessing/stop-word/threshold/visibility contract; OpenAPI schema and deterministic JSON fixtures.
- **Accept:** Every FK/unique/index/immutable table and authority edge is explicit; Researcher/Student Researcher and specialist study roles use the same normalized assignment table with complete grant/revoke denies; no generic role replaces a canonical actor; Before/After Proposal contracts are separate; four analysis/external outputs are distinct; NLP fixtures reproduce section 10.2; no browser-supplied corpus path exists.
- **Verify:** Contract schema validation and fixture validation commands selected in the contract PR; architecture/security review PASS.

### S1-01 — Laravel scaffold and engineering baseline

- **Entry:** C-01/C-02 merged; target PHP/Node/MySQL versions available.
- **Deliver:** Clean Laravel scaffold with Blade/Tailwind/Alpine/Socialite and dev tooling pinned, modular loaders, MySQL test config example, liveness route, CI workflow, and no starter password-registration UI.
- **Accept:** Fresh install builds; route/migration loaders discover sorted module paths; default page and auth scaffolding do not conflict with RESEARCHNAV; `.env.example` contains placeholders only.
- **Focused checks:** `composer validate --strict`; `composer install --no-interaction`; `npm ci`; `vendor/bin/pint --test`; `vendor/bin/phpstan analyse`; `php artisan test`; `npm run lint`; `npm run build`; `composer audit`; `npm audit --audit-level=high`.

### S1-02 — Identity, reference, scoped authorization, and audit data

- **Entry:** S1-01 merged; canonical institute/program catalog and every role code in section 9.1 approved.
- **Deliver:** Normalized Sprint 1 migrations/models/factories/seeders; separate institute membership, class membership, and institutional-role foundations; canonical `study_role_assignments` role/lifecycle/authority contract for L-01; idempotent reference/role importer; immutable audit model; constraints/indexes; authority fixtures and database tests.
- **Accept:** Fresh seed is repeatable and contains every canonical role code/display name; duplicate provider subject/grant/code constraints fail; cross-institute program/class relationships are impossible; policies never infer role from membership or vice versa; the later `study_role_assignments` schema is contractually separate rather than encoded as an institutional role; audit updates/deletes are rejected; no production user or System Administrator account is seeded.
- **Focused checks:** `php artisan migrate:fresh --seed --env=testing`; repeat seeder; `php artisan test --testsuite=Feature --filter=Foundation`; MySQL migration up/down/up test and `SHOW INDEX` evidence.

### S1-03 — Responsive public/authenticated shells

- **Entry:** S1-01 merged and C-01 frozen.
- **Deliver:** Shared accessible components/layouts, public landing/repository empty and no-result views, waiting view, role dashboard shells, Alpine navigation, and exact design tokens.
- **Accept:** Shells satisfy section 11 at required widths; JavaScript-off core navigation/forms remain usable; white is only a neutral surface; every canonical institutional role has an exact-name placeholder shell; placeholders cannot be mistaken for completed lifecycle modules.
- **Focused checks:** `npm run lint`; `npm run build`; shell component tests; automated axe suite; documented keyboard/zoom viewport matrix.

### S1-04 — Google identity linking and waiting flow

- **Entry:** S1-02 merged; OAuth contract frozen. Real credentials are not required.
- **Deliver:** `GoogleIdentityProvider` interface, Socialite adapter, fake test adapter, redirect/callback/link actions, collision handling, session regeneration/logout, active-account middleware, waiting/status flow, audits, throttles, tests.
- **Accept:** Fake callback proves new verified identity -> pending user -> waiting; approved active user -> authorized app; unverified email, replay/state failure, suspended user, duplicate subject, and existing-email collision fail safely; absent real config gives controlled unavailable response; no token persists.
- **Focused checks:** `php artisan test --filter=Google`; `php artisan test --filter=Waiting`; route/middleware inspection; secret/log assertion; Security Reviewer PASS. A real callback test is explicitly `NOT RUN` until credentials exist.

### S1-05 — Public repository projection foundation

- **Entry:** S1-01 merged; public projection contract frozen.
- **Deliver:** Minimal repository projection schema/model/query with mandatory publication visibility scope and empty database factory behavior.
- **Accept:** Query cannot return unpublished/withdrawn records; no draft research relationship is used; indexes support visibility/date; Sprint 1 seed leaves repository empty.
- **Focused checks:** `php artisan test --filter=PublicRepository`; MySQL migration/index test; query-scope tests including adversarial unpublished rows.

### S1-06 — Public routes and role-aware dashboard application

- **Entry:** S1-02, S1-03, S1-05 merged.
- **Deliver:** Landing/search controllers and requests; `/app` router; role/scope validation; dashboard/public feature tests connected to approved views.
- **Accept:** Guest/Public sees landing/search empty states; query validation/pagination is bounded; pending user cannot enter `/app`; every seeded canonical role resolves only to its exact-name authorized shell; institute/class/study context is not inferred from role; invalid or cross-scope role selection is denied; multi-role default is deterministic.
- **Focused checks:** `php artisan test --filter=PublicSite`; `php artisan test --filter=Dashboard`; authorization matrix; route list review; axe smoke tests.

### S1-07 — Sprint 1 integration and security hardening

- **Entry:** S1-04 and S1-06 merged with all child checks green.
- **Deliver:** Combined flow tests and only necessary shared wiring/headers/config repairs.
- **Accept:** Fresh clone/config/migrate/seed/build works; fake OAuth-to-waiting and active dashboard flows pass; public/private boundaries and session controls pass; no later module is represented as complete.
- **Focused checks:** Execute the complete Sprint 1 gate in section 17 on MySQL, plus exact-commit code/security review and browser viewport/keyboard checks.

### S1-08 — Sprint 1 documentation and milestone gate

- **Entry:** S1-07 PASS.
- **Deliver:** Setup, test, architecture, fake OAuth testing, real Google configuration prerequisites, queue/storage, and troubleshooting docs.
- **Accept:** A new developer can run Sprint 1 from placeholders; docs clearly label real OAuth and all L-* modules incomplete; no secret or local path is committed.
- **Focused checks:** Follow docs from a clean checkout; link/lint check; secret scan; compare env variable references to examples.

### L-00 — Administration and assignment-authority enforcement

- **Entry:** Sprint 1 gate PASS; C-02 authority contract frozen.
- **Deliver:** Policy-protected actions and minimal administration UI for account activation/suspension, institute membership, program/class management, protected System Administrator succession, System Administrator-to-institutional-role grants, Research Coordinator-to-Research Instructor grants/class placement, and complete grant/revoke audits. Study-role actions remain in L-01 but consume the same authority contract.
- **Accept:** Every allow and explicit deny in section 9.2 passes; lower roles cannot grant/revoke higher roles; self-grant and last-active-System-Administrator removal fail; suspension invalidates sessions; institute/program/class boundaries and deactivation dependencies hold; list queries are scoped before pagination; all grants/revocations append actor/reason/history transactionally.
- **Focused checks:** Administration permission matrix, account/session tests, institute/program/class cross-scope tests, concurrent grant/revoke and last-active-System-Administrator tests, audit immutability, feature/accessibility tests, and Security Reviewer PASS.

### L-01 — Study workspace, statuses, and private versioned soft copies

- **Entry:** Sprint 1 gate PASS.
- **Deliver:** Studies, `study_groups`, `study_group_members`, and normalized `study_role_assignments` for Researcher/Student Researcher and every specialist; exact `pending`/`active`/`removed` lifecycle and cardinality; Research Instructor grant/revoke services; exact Title, Research Progress, and Document status families; immutable title versions; private versioned soft-copy upload/download; checksum/quarantine; revision lineage; official-copy-selection prerequisite model; lifecycle history.
- **Accept:** Institute/class/study authorization and section 7.3 assignment tests pass; only active assignments authorize; every active researcher assignment has a same-user/study group-member link; duplicate, conflicting, over-cardinality, self, stale, cross-class, and unauthorized grant/revoke attempts fail; institutional role or class membership alone cannot open a study; replacing/deleting title or soft-copy history is impossible; “current” and “official copy” are explicit and different; unauthorized file requests do not reveal existence; transition/audit events are transactional.
- **Focused checks:** Study/soft-copy unit and feature tests, MySQL migration gate, storage-fake tests, MIME/size/path attacks, policy matrix, Security Reviewer PASS.

### L-02 — Stateless FastAPI NLP service

- **Entry:** C-02 and S1-01 merged; Python version and pinned scikit-learn selected.
- **Deliver:** Versioned FastAPI endpoint/health; exact HTML/Unicode/punctuation/hyphen/space/tokenization pipeline; carefully tested versioned academic stop-word list; official TF-IDF/cosine with submitted title in fit; separate purpose support; optional FastText extra; validation/problem details; fixtures/property/accuracy-regression tests; service run docs.
- **Accept:** Contract fixtures are deterministic; meaningful technical terms survive preprocessing; stemming/lemmatization are disabled; stop words are not `None`; empty/duplicate/oversized/malformed inputs behave as specified; service has no DB/storage/network dependency; logs redact bodies; default tests need no FastText model.
- **Focused checks:** From `services/nlp`: `python -m ruff format --check .`; `python -m ruff check .`; `python -m mypy .`; `python -m pytest --cov --cov-report=term-missing`; `python -m pip_audit`; OpenAPI/fixture compatibility and latency smoke test.

### L-03 — Four distinct analysis/external-result outputs

- **Entry:** L-01/L-02 merged; endpoint contract exact.
- **Deliver:** Authorized institutional comparison policy/query, separate candidate-visibility policy, immutable Internal Title Similarity and Related-Study Relevance records, separately labeled optional FastText Context records, manually recorded External Turnitin Result/evidence history, idempotent jobs/client, configurable Low/Moderate/High defaults, and four clearly distinct UI outputs.
- **Accept:** Browser cannot submit corpus; every comparison title satisfies institutional comparison policy; candidate identity/details are shown only when separately authorized; submitted title is included in vectorizer fit fixtures; timeout/retry cannot duplicate a run; provenance/config snapshots persist; external Turnitin cannot masquerade as internal output; score bands are exactly Low 0–39.99, Moderate 40–69.99, High 70–100 by default; every decision is human-only.
- **Focused checks:** Similarity test suite, recorded contract fixture test, queue retry/idempotency test, policy matrix, no-payload-log assertion, Security Reviewer PASS.

### L-04 — Review workflow

- **Entry:** L-01/L-03 merged; approved transition into review requires recorded similarity interpretation/manual decision.
- **Deliver:** Research Adviser, Panel Chairperson, Panel Member, Statistician, and Editor study-specific tasks; exact Review Task and Comment statuses; explicit assign/revoke/reassign/accept/decline/submit/complete permissions; Research Instructor assignment actions; assigned-reviewer scope; versioned criteria/rounds; attributable comments; immutable submissions/revision requests/responses/decisions; conflict checks; scoped UI/actions/audits.
- **Accept:** Only the specifically assigned actor sees and accepts/declines/submits/completes their task; only the owning-class Research Instructor assigns/revokes/reassigns; revoked/reassigned actors immediately lose action scope without losing history; the Panel Chairperson and Panel Member remain distinct; comments and submitted reviews cannot be silently altered; every cross-task/class/study, inactive-assignment, self-assignment, generic-role, and impersonated-completion deny passes.
- **Focused checks:** Review state-machine/unit tests, assignment policy matrix, immutable revision tests, concurrent-submit test, feature/accessibility tests, Security Reviewer PASS.

### L-05 — Separate Before/After Proposal Defense monitoring

- **Entry:** L-01 merged; monitoring state contract frozen.
- **Deliver:** Independently configurable/versioned Before Proposal Defense and After Proposal Defense template roots/items; Research Coordinator template management/read-only oversight; Research Instructor form/defense activation; Researcher/Student Researcher response and immutable evidence; item-scoped Research Instructor/Research Adviser/Panel Chairperson/Panel Member/Statistician/Editor verification; Research Office Personnel publication-prerequisite items; exact phase statuses; overdue scheduler; append-only logs; separate dashboards/queues.
- **Accept:** One phase's template/permissions/status cannot satisfy or mutate the other; existing activations retain template snapshots; After Proposal responses cannot open before defense activation; Coordinator oversight cannot mutate; Research Office Personnel cannot alter academic responses; only own-study active researchers respond; only explicitly delegated active actors verify; every cross-phase/task/study/class/institute, inactive-assignment, self-verification, or unauthorized action is denied and audited; overdue calculation is timezone-safe/idempotent.
- **Focused checks:** Monitoring state/property tests, scheduler/idempotency tests with frozen time, scope matrix, immutable log tests, accessibility tests.

### L-06 — Publication workflow and complete public repository

- **Entry:** L-04/L-05 merged; publication prerequisites frozen.
- **Deliver:** Controlled Librarian tasks; official-copy selection/checks; Research Office Personnel verification/publication; exact Publication statuses; immutable publication/correction/repository versions; full public landing/search/detail/filter/pagination; published-copy access rule; transactional projection; correction/withdrawal; metadata and audits.
- **Accept:** Librarian cannot self-publish; only Research Office Personnel with policy may publish/correct; approved study and selected official copy remain distinct prerequisites; publication is not public visibility until projection succeeds; corrected records expose clear current/version history without leaking private versions; withdrawn records return public 404; search never falls back to study tables; replay is idempotent.
- **Focused checks:** Publication transition tests, projection failure/replay tests, public leakage corpus, MySQL FULLTEXT/`EXPLAIN` evidence, accessibility/performance tests, Security Reviewer PASS.

### L-07 — Notifications, reports, audit operations, and backups

- **Entry:** L-03 through L-06 merged.
- **Deliver:** In-app/database notifications; authorized status/monitoring/review/publication reports; audit query/export; backup schedule/run metadata and restore-verification workflow; failed-job/health metrics and operational hooks. Backup payloads remain outside Git/MySQL and encrypted by infrastructure.
- **Accept:** Notifications dispatch after commit once and re-check entitlement; every report/export is institute/class/study/task scoped; Research Office Personnel and other actors see only granted reports; audit export is separately gated; backup success is never claimed without restore verification; operations capability grants no implicit study access.
- **Focused checks:** Queue retry/deduplication and rollback/no-send tests; report/audit authorization matrix; CSV/formula-injection and large-export tests; structured-log redaction; encrypted backup/restore drill; failed-job drill.

### L-08 — Full-system integration, security, accessibility, and performance

- **Entry:** All feature workstreams merged.
- **Deliver:** Cross-module repairs only, full browser journeys, migration/backup rehearsal, security/accessibility/performance evidence.
- **Accept:** Full criteria in section 16 pass on exact parent revision; no blocking code/security findings; representative list/search/NLP/queue budgets are documented and met; rollback rehearsal succeeds.
- **Focused checks:** Complete gate in section 17, OWASP-focused manual review, dependency/secret scan, axe + manual keyboard/zoom, MySQL query plans, queue/NLP failure drills.

### L-09 — Release documentation and readiness

- **Entry:** L-08 PASS.
- **Deliver:** Current setup/architecture/data dictionary/user guides, env reference, Google/NLP/storage/queue operations, backup/restore, incident/rollback, retention caveats, release notes.
- **Accept:** Clean-run documentation test passes; parent checklist links all child PR/test evidence; remaining assumptions and unconfigured external services are explicit. Marking ready/merging still requires authorized Release Agent action.

## 16. Acceptance criteria

### 16.1 Sprint 1 acceptance

- [ ] A clean checkout installs PHP/Node dependencies, builds assets, and migrates/seeds an empty MySQL database using documented placeholders.
- [ ] Identity, OAuth account, institute, program, class, institutional role, institute membership, class membership, permission, audit, and repository-projection schemas enforce documented keys/FKs/uniqueness; the separately normalized L-01 `study_role_assignments` role/lifecycle/cardinality contract is frozen and never encoded as an institutional role.
- [ ] Approved institute/program reference input and every canonical institutional role code/display name import idempotently; tests use isolated factories; no production System Administrator or fake publication is seeded.
- [ ] `/` is responsive and accessible and uses the exact forest/ivory/peach palette contract.
- [ ] `/repository` accepts a bounded search query and displays accurate initial-empty and no-match states while querying published projections only.
- [ ] Fake Google callback tests cover pending, active, suspended, unverified, collision, replay/failure, and logout flows without network calls.
- [ ] Missing real Google configuration is handled safely and is documented as unconfigured; no claim of a successful real callback appears.
- [ ] Pending users can access waiting/logout only; every canonical institutional role routes to an exact-name placeholder shell; Guest/Public, cross-institute/class/study, missing-assignment, and invalid-role access is denied.
- [ ] Every Sprint 1 mutation uses Form Request + policy/action/service, and consequential identity/authorization events append audit evidence.
- [ ] Public/auth shells pass automated axe checks plus manual keyboard, 200% zoom, and required viewport checks.
- [ ] Sprint 1 full test/build/static/security gate passes on the exact combined branch.

### 16.2 Full-system acceptance

- [ ] Account activation/suspension, institute membership, programs, classes, institutional grants, and lower-role denial follow section 9.2; self-grant and removal of the last active System Administrator are impossible.
- [ ] Studies enforce institute membership, class membership, and study-specific assignment independently; exact status families and append-only title/private soft-copy/comment/revision history pass; official-copy selection is explicit.
- [ ] `study_role_assignments` stores Researcher/Student Researcher beside specialist roles with `pending`/`active`/`removed` lifecycle, group/member linkage, cardinality, Research Instructor grant/revoke authority, immutable history, and complete allow/deny tests.
- [ ] Institutional comparison-policy tests prove only eligible corpus titles are sent to NLP, while separate candidate-visibility tests prove restricted candidate identity/metadata is never disclosed.
- [ ] FastAPI includes the submitted title in the fitted matrix and deterministically applies versioned HTML/Unicode/punctuation/hyphen/space/tokenization plus tested academic stop words; meaningful technical terms survive and stemming/lemmatization remain disabled absent approved accuracy evidence.
- [ ] Internal Title Similarity, Related-Study Relevance, optional FastText Context, and manually recorded External Turnitin Result are four separately stored/labeled outputs with provenance and immutable history.
- [ ] Default Low 0–39.99, Moderate 40–69.99, and High 70–100 bands are configurable/versioned display aids; tests prove decisions remain human-only.
- [ ] Research Instructor-only review-task assign/revoke/reassign and assigned-reviewer-only accept/decline/submit/complete permissions pass scope, revocation, impersonation, conflict, history, and concurrency tests for Research Adviser, Panel Chairperson, Panel Member, Statistician, and Editor.
- [ ] Before Proposal Defense and After Proposal Defense template management, activation, researcher response/evidence, delegated verification, Coordinator read-only oversight, Research Office publication-item verification, statuses, overdue jobs, audit, and logs remain separate and pass cross-phase/unauthorized/immutable/idempotency tests.
- [ ] Controlled Librarian task, official-copy selection, Research Office Personnel publication/correction/`publication.withdraw`, projection/visibility/withdrawal, full public landing/repository, and correction-history states remain distinct; only immutable published projections appear publicly.
- [ ] Notifications are after-commit, idempotent, entitlement-aware, and privacy-minimized.
- [ ] Reports/audit exports are policy-scoped and injection-safe; encrypted backup operation includes successful restore verification evidence.
- [ ] Full authorization matrix, migration, build, unit, feature, integration, browser, accessibility, security, and failure-mode checks pass.
- [ ] Setup, operations, backup/restore, rollback, environment, and user documentation match the exact release revision.

## 17. Verification and test gates

Commands may be adjusted only to match lockfile-selected tools; any change is documented in C-02/S1-01 and parent PR evidence.

The plan-artifact pre-commit formatting gate is:

```powershell
npx --no-install prettier --check docs/plans/researchnav-mvp.md
```

### 17.1 Laravel gate

```powershell
composer validate --strict
composer install --no-interaction --prefer-dist
npm ci
vendor/bin/pint --test
vendor/bin/phpstan analyse
php artisan config:clear
php artisan route:list
php artisan migrate:fresh --seed --env=testing
php artisan test --parallel
npm run lint
npm run build
composer audit
npm audit --audit-level=high
```

Run migration up/down/up and integration suites against the documented MySQL service. SQLite may be used for fast unit tests but never as migration/search acceptance evidence.

### 17.2 NLP gate (when L-02 enters scope)

```powershell
cd services/nlp
python -m ruff format --check .
python -m ruff check .
python -m mypy .
python -m pytest --cov --cov-report=term-missing
python -m pip_audit
```

### 17.3 Browser/accessibility gate

```powershell
npm run test:e2e
npm run test:a11y
```

Evidence also records manual keyboard-only navigation, focus behavior, 200% zoom, reduced motion, and 320/375/768/1024/1440 px checks. If these scripts are not introduced by the approved scaffold, S1-01 is not complete.

### 17.4 Gate policy

| Gate               | Required evidence                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Builder self-check | Commands, exit codes, changed paths, focused acceptance mapping.                                                         |
| Pre-commit         | Unstaged diff/ownership/secret review plus formatter, static, focused test results. Nothing staged beforehand.           |
| Child PR           | Exact commit SHA, CI, full focused tests, code review; security review for sensitive tasks.                              |
| Sprint integration | Fresh MySQL migration/seed, all Laravel/build checks, fake OAuth journeys, public/auth browser and accessibility checks. |
| Full integration   | Laravel + NLP + browser suites, migrations, policy matrix, dependency/secret audits, backup/rollback and failure drills. |
| Release            | Parent checklist complete, all required checks green, docs current, no blockers, explicit merge authorization.           |

Skipped checks are failures unless the plan explicitly marks them external (for example, a real Google callback before credentials exist). Test reports include command, status, environment, skips, and concise output—not only “PASS.”

## 18. Risks, assumptions, and controls

| Item                       | Assumption/risk                                                                                              | Control or decision gate                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reference catalog          | Exact institute/program catalog is not encoded in this greenfield repository.                                | Require approved codes/names/relationships before S1-02; importer and tests may use fixtures, but placeholder production institutes do not satisfy acceptance.                                                  |
| Framework versions         | Greenfield has no lockfiles yet; future unsupported combinations could be selected.                          | S1-01 records versions, support dates, and lockfiles; changing major versions requires contract/CI revalidation.                                                                                                |
| Google credentials         | Client ID/secret and production redirect URI are external and currently unverified.                          | Fake boundary is Sprint 1 evidence. Controlled unavailable state and setup docs; real smoke test remains an explicit deployment gate.                                                                           |
| Email identity collision   | Automatic verified-email linking can cause account takeover or wrong institutional identity.                 | Stable subject linkage; explicit authenticated linking/manual resolution on collision; audit all attempts.                                                                                                      |
| Role/assignment ambiguity  | One person can hold multiple roles and participate in multiple institutes, classes, and studies.             | Separate institutional role, institute membership, class membership, group membership, and `study_role_assignments` tables; preserve the authority matrix; deny ambiguous operations until context is selected. |
| Confidential title leakage | Institutional comparison may legitimately score a title whose candidate metadata the actor may not view.     | Server-built comparison-policy corpus plus separate candidate-visibility policy, opaque service IDs, restricted-match UI, no payload logs, and leakage tests.                                                   |
| Preprocessing accuracy     | An overbroad academic stop-word list or stemming can erase meaningful technical language.                    | Versioned reviewed stop-word list, preserved-term regression corpus, stemming/lemmatization disabled initially, and accuracy gate for every new preprocessing version.                                          |
| Determinism/model drift    | Library/model upgrades can change scores.                                                                    | Pin dependencies; store algorithm/config/library/model checksum and input snapshot; new behavior gets a new algorithm version.                                                                                  |
| Corpus scale               | Per-request vectorization can become slow/memory-heavy.                                                      | 5,000-item bound, timeout/metrics/load test. Any caching/index redesign must preserve authorization and version contracts.                                                                                      |
| Immutable data growth      | Versions/logs increase storage and index cost.                                                               | Partition/archive only after measured need and approved retention policy; never silently purge legal/audit history.                                                                                             |
| Private file malware       | MIME/extension validation alone is insufficient.                                                             | Quarantine/scanner adapter before availability; deployment must configure scanner or explicitly accept a blocked-download posture.                                                                              |
| Public projection failure  | Approved content might be partially visible.                                                                 | Transactional outbox/idempotent projector; visibility only after complete projection; failure alert and replay.                                                                                                 |
| Queue delivery             | Database queue may not meet later throughput.                                                                | Start observable and idempotent; load-test before release; Redis adoption is reversible infrastructure work.                                                                                                    |
| Palette/contrast           | Peach can fail as text or over ivory.                                                                        | Restrict peach to tested accents; forest text/actions; automated and manual contrast checks.                                                                                                                    |
| Retention/privacy          | Legal retention, deletion, and consent requirements are not supplied.                                        | Preserve immutable records by default; obtain policy approval before production data/destructive purge features.                                                                                                |
| Public repository status   | Repository URL is public, but repository visibility/branch protection/CI state was not changed by this plan. | PR Coordinator/Repository Agent verifies remote state before publishing branches; no force or settings change without authorization.                                                                            |

## 19. Rollback and recovery

- **Application release:** Deploy immutable artifacts; retain the previous artifact/config; switch traffic back on health/acceptance failure. Do not roll back by rewriting Git history.
- **Database:** Back up and verify restore before destructive/high-risk migrations. Prefer expand/migrate/contract: add nullable/new structures, deploy compatible code, backfill idempotently, then constrain/remove in a later release. A `down()` is tested but is not used if it would discard accepted immutable history.
- **OAuth:** Disable Google sign-in through configuration while preserving sessions according to incident policy; show controlled status. Rotate exposed credentials externally and revoke sessions/links only through audited actions.
- **NLP:** Feature-disable similarity submissions or pin Laravel to the previous contract-compatible service. Existing runs remain immutable; failed runs move to retry/manual review, never receive fabricated scores.
- **Queues/notifications:** Pause workers, retain jobs/failed jobs, correct idempotently, then replay by correlation/idempotency key. Do not delete evidence to clear a dashboard.
- **Publication:** Disable projector/public detail feature flag before rollback. Withdraw visibility through an audited event; never delete repository versions or underlying research history.
- **Files:** Restore metadata and blobs together and verify checksums. A missing/quarantined blob is unavailable rather than served from an untrusted fallback.
- **Branch/PR:** Revert with a new reviewed commit/PR. No force-push, history rewrite, branch deletion, or destructive reset without explicit approval.

Recovery acceptance for L-08 includes database restore, previous artifact startup, queue replay, NLP outage, and publication projection failure drills with measured recovery notes.

## 20. Definition of done and reporting

A workstream is complete only when its acceptance is mapped to evidence, all required tests/reviews pass, its child PR is merged into the parent branch, and the parent checklist/link is updated. “Code written,” local-only success, or a green unit subset is not completion.

Sprint 1 may be reported as **foundation complete** only with section 16.1 checked. Reports must state that Google is fake-tested/unconfigured unless a real credentialed callback was separately evidenced, and that study/soft-copy lifecycle, analysis/external results, reviews/comments/revisions, separate monitoring phases, official-copy/publication/correction, reports, and backups remain planned.

The full system may be reported complete only with section 16.2, full integration/security/accessibility, operations docs, and release authorization satisfied.

---

## 21. Draft parent Plan PR body

**Title:** `plan: build RESEARCHNAV MVP`

```markdown
## Goal

Build RESEARCHNAV as a Laravel modular monolith with a separately deployed stateless FastAPI analysis service. Deliver Sprint 1 first: tested identity/institute/program/class/RBAC/audit foundations, all canonical role seeds, fake-testable Google linking and waiting flow, reference data support, public landing/empty repository search, and responsive role-aware authenticated shells. Later workstreams remain ordered and are not claimed complete.

Authoritative plan: `docs/plans/researchnav-mvp.md`

## Users

System Administrator; Research Coordinator; Research Instructor; Researcher/Student Researcher; Research Adviser; Panel Chairperson; Panel Member; Librarian; Research Office Personnel; Statistician; Editor; Guest/Public.

## Architecture

- Laravel + Blade/Tailwind/Alpine modular monolith; MySQL system of record.
- Socialite Google OAuth behind a fake-testable provider boundary.
- Policies/Gates, Form Requests, transactional services/actions, jobs, notifications, private storage.
- Separate stateless FastAPI NLP service using pinned official TF-IDF + cosine over a fit matrix that includes the submitted title and institutionally authorized comparison corpus; versioned academic preprocessing/stop words; optional FastText only.
- Public repository projection separated from authenticated research aggregates.
- Institutional role, institute membership, class membership, and study-specific assignment are separate normalized concepts with fixed assignment authority.
- Internal Title Similarity, Related-Study Relevance, optional FastText Context, and manual External Turnitin Result are separate outputs; candidate visibility is separately authorized.
- Append-only soft-copy/title/analysis/external-result/review/comment/revision/publication/audit/monitoring history.
- Brand core: forest `#002818`, warm ivory `#FFF8ED`, restrained peach `#E9A77C`; white only as neutral surface.

## Sprint 1 scope

- [ ] Laravel/tooling/modular scaffold
- [ ] Identity, institutes/programs/classes, separate membership/assignment concepts, scoped permissions, and audit schema
- [ ] All canonical institutional role codes and exact-name placeholder dashboards
- [ ] Approved reference catalog importer/seed
- [ ] Google adapter + fake callback, safe linking/collision handling, waiting/logout flow
- [ ] Public landing and truthful empty published-repository search
- [ ] Responsive authenticated shell and role-aware dashboard router
- [ ] MySQL, feature, authorization, browser/accessibility, build, and security gates
- [ ] Setup/architecture/testing/operations documentation

## Explicit non-claims

- Real Google credentials and callback are not configured or proven by this plan.
- Private versioned soft copies/statuses, four analysis/external-result outputs, review/comments/revisions, separate Before/After Proposal monitoring, official-copy/publication/correction, reports/audit operations/backups, and complete notifications are later workstreams until their child PRs and gates are complete.

## Workstreams

| ID    | Workstream                                      | Owner                   | Status  | Branch                                      | Child PR |
| ----- | ----------------------------------------------- | ----------------------- | ------- | ------------------------------------------- | -------- |
| C-01  | UI/accessibility contract                       | UI/UX Designer          | Pending | `contract/researchnav-ui`                   |          |
| C-02  | API/data/security contract                      | API/Data Contract Agent | Pending | `contract/researchnav-api-data`             |          |
| S1-01 | Laravel scaffold                                | Backend Builder         | Pending | `feat/researchnav-scaffold`                 |          |
| S1-02 | Identity/reference/RBAC/audit data              | Database Builder        | Pending | `feat/researchnav-identity-data`            |          |
| S1-03 | Responsive public/auth shells                   | Frontend Builder        | Pending | `feat/researchnav-shells`                   |          |
| S1-04 | Google identity/waiting flow                    | Backend Builder         | Pending | `feat/researchnav-google-auth`              |          |
| S1-05 | Public projection foundation                    | Database Builder        | Pending | `feat/researchnav-public-foundation`        |          |
| S1-06 | Public/dashboard application                    | Backend Builder         | Pending | `feat/researchnav-public-dashboard`         |          |
| S1-07 | Sprint 1 integration/security                   | Integration Agent       | Blocked | `integration/researchnav-sprint1`           |          |
| S1-08 | Sprint 1 documentation                          | Documentation Agent     | Blocked | `docs/researchnav-sprint1`                  |          |
| L-00  | Administration/assignment authority             | Backend Builder         | Later   | `feat/researchnav-administration-authority` |          |
| L-01  | Studies/private versioned soft copies           | Backend Builder         | Later   | `feat/researchnav-study-soft-copies`        |          |
| L-02  | FastAPI NLP service                             | Backend Builder         | Later   | `feat/researchnav-nlp-service`              |          |
| L-03  | Four analysis/external-result outputs           | Backend Builder         | Later   | `feat/researchnav-analysis-results`         |          |
| L-04  | Assigned review/comments/revisions              | Backend Builder         | Later   | `feat/researchnav-reviews`                  |          |
| L-05  | Separate Before/After monitoring                | Backend Builder         | Later   | `feat/researchnav-monitoring`               |          |
| L-06  | Official-copy/publication/correction/repository | Backend Builder         | Later   | `feat/researchnav-publication`              |          |
| L-07  | Notifications/reports/audit/backups             | Backend Builder         | Later   | `feat/researchnav-reports-operations`       |          |
| L-08  | Full integration/hardening                      | Integration Agent       | Later   | `integration/researchnav-full`              |          |
| L-09  | Release documentation                           | Documentation Agent     | Later   | `docs/researchnav-release`                  |          |

## Sprint 1 acceptance

- [ ] Clean MySQL install/migrate/idempotent seed/build succeeds.
- [ ] Public landing and repository empty/no-results states are responsive and WCAG 2.2 AA checked.
- [ ] Palette contract uses only the three exact core colors; white remains a neutral surface.
- [ ] Institute/program/class and separate role/membership/assignment/audit constraints pass; every canonical role code/display name is seeded.
- [ ] Fake Google callback covers pending/active/failure/collision/suspension without network or persisted token.
- [ ] Missing Google configuration is safe and documented; real callback is not falsely claimed.
- [ ] Pending users are limited to waiting/logout; every canonical role reaches only its exact-name authorized placeholder shell.
- [ ] Public queries cannot expose unpublished or private records.
- [ ] Sprint 1 full static, test, build, accessibility, dependency, secret, code-review, and security gates pass.

## Verification

- [ ] Composer validation/install/audit
- [ ] Pint and PHP static analysis
- [ ] MySQL migration up/down/up and seed idempotency
- [ ] PHPUnit unit/feature/integration suite
- [ ] Node lint and production build
- [ ] Browser journeys and automated axe checks
- [ ] Manual keyboard/200% zoom/responsive checks
- [ ] Authorization/IDOR matrix
- [ ] Secret and dependency scan
- [ ] Code review
- [ ] Security review
- [ ] Documentation clean-run test

## Decisions

- Laravel is the sole business/data authority; FastAPI is stateless and receives only Laravel-authorized corpus data.
- Public repository data is a publication projection, never a filtered fallback over draft aggregates.
- Immutable records are corrected through superseding versions/events.
- Institutional roles, institute membership, class membership, and study-specific assignments are separate; access and assignment authority require every applicable record.
- Similarity comparison eligibility does not grant candidate visibility; score bands never make decisions.
- Sprint 1 uses a fake identity-provider boundary for deterministic OAuth tests and makes no real-credential claim.

## Risks and assumptions

- Approved institute/program catalog is required before S1-02 acceptance.
- Google credentials/redirect URIs and production infrastructure are external gates.
- Retention/legal-hold policy requires approval before destructive purge behavior.
- Confidential-title leakage, OAuth collision, private files, projection failure, and algorithm drift have explicit controls in the plan.

## Child PR protocol

All children target `plan/researchnav-mvp`, use isolated worktrees and exclusive owned paths, pass independent pre-commit testing before explicit staging, and link test/review evidence here. No force-push or direct feature PR to `main`.
```

## 22. Parent PR workstream checklist

- [ ] Plan artifact independently verified, explicitly committed, and Draft parent PR opened.
- [ ] C-01 UI/accessibility contract merged.
- [ ] C-02 API/data/security contract merged.
- [ ] S1-01 Laravel scaffold merged and shared-file manifest frozen.
- [ ] S1-02 identity/reference/RBAC/audit data merged.
- [ ] S1-03 responsive shells merged.
- [ ] S1-04 Google identity/waiting flow merged with Security Reviewer PASS.
- [ ] S1-05 public projection foundation merged.
- [ ] S1-06 public/dashboard application merged.
- [ ] S1-07 combined Sprint 1 integration/security/accessibility gate PASS.
- [ ] S1-08 Sprint 1 docs merged and clean-run verified.
- [ ] Sprint 1 acceptance checklist complete with no real-Google or later-module overclaim.
- [ ] L-00 administration/assignment-authority matrix merged with grant/revoke denial evidence.
- [ ] L-01 study/private versioned soft-copy/status lifecycle merged.
- [ ] L-02 FastAPI NLP merged with deterministic contract evidence.
- [ ] L-03 four analysis/external-result outputs merged with comparison-policy/candidate-visibility review.
- [ ] L-04 assigned review/comment/revision workflow merged.
- [ ] L-05 separate Before/After Proposal monitoring/templates/activation/verification/logs merged.
- [ ] L-06 official-copy/publication/correction/public repository merged with leakage/projection review.
- [ ] L-07 notifications/reports/audit operations/backup-restore verification merged.
- [ ] L-08 full integration/security/accessibility/performance/rollback gate PASS.
- [ ] L-09 release documentation merged and clean-run verified.
- [ ] All child PRs/evidence linked; decisions/risks current; no blocking findings.
- [ ] Parent PR marked ready only for the explicitly selected release boundary.
- [ ] Merge/release performed only by authorized Release Agent after approval.
