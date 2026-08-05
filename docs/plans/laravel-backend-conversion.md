# ResearchNAV Laravel Backend Conversion Plan

## Plan metadata

| Item | Value |
|---|---|
| Repository | `https://github.com/MilliXPlorer/researchnav` |
| Parent branch | `plan/laravel-backend-conversion` |
| Parent base | `main` at approved planning base `882f52c` |
| Parent PR | Draft PR from `plan/laravel-backend-conversion` to `main`; URL to be added by the PR Coordinator |
| Plan worktree | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-plan` |
| Canonical plan and PR-body source | `docs/plans/laravel-backend-conversion.md` |
| Target runtime | Laravel `13.24`, PHP `8.5`, PostgreSQL |
| Preserved clients | Existing React UI and standalone Python CLI |

This document is the implementation control plane. The parent Plan PR must remain Draft until every exit gate in this document passes. The PR Coordinator may copy the Plan PR body draft below into GitHub and update status, evidence, and links there; implementation agents must not concurrently edit this plan.

The existing unrelated `plan/researchnav-mvp` branch is not a dependency, base, integration target, or source of compatibility requirements. Leave it and its worktrees untouched. Every child branch below starts from the latest approved commit on `plan/laravel-backend-conversion`, never from `plan/researchnav-mvp` and never directly from `main`.

## Objective

Replace the Express backend with a production-ready Laravel backend while preserving the current React experience, the six existing `/api` paths, the public user JSON shape, the existing `app_users` data, and the independent Python similarity CLI. Strengthen authentication, authorization, concurrency, auditability, notification durability, migration safety, testing, and cutover operations without adding persistence to prototype-only catalog or dashboard actions.

## Users and required outcomes

| User | Required outcome |
|---|---|
| Any verified Google user | May complete Google GIS sign-in; a first sign-in without an invitation creates a blocked Researcher and does not grant dashboard access. |
| Invited Coordinator or Instructor | Signing in with the invited, normalized email binds the verified Google subject and activates the account. |
| System Administrator | May list and provision Coordinators only. Administrator status must not bypass the Coordinator-only Instructor workflow. |
| Research Coordinator | May list and provision Instructors only. |
| Other active roles | Keep their current React role/dashboard behavior, but gain no new provisioning authority. |
| Operator | Can migrate, preflight, bootstrap an administrator, run database-backed workers, cut over, invalidate Express sessions, observe audit/outbox state, and roll the application back using documented commands. |
| Developer | Can run the PHP, React, and Python toolchains locally and run the comprehensive suite against real PostgreSQL. |

## Scope

- Install and configure Laravel 13.24 for PHP 8.5 in this repository, backed only by PostgreSQL.
- Remove the Express runtime and Node backend dependencies after Laravel parity is demonstrated.
- Preserve the six API paths and current methods, status semantics, and user fields; add bounded pagination metadata to list responses.
- Use same-origin, database-backed Laravel cookie sessions with CSRF protection, session rotation, secure production cookie settings, and eight-hour rolling expiry.
- Verify Google Identity Services ID tokens server-side with a maintained Google verification library and strict claim checks.
- Adopt the existing `app_users` table in place and add only versioned, reversible Laravel migrations.
- Implement blocked first sign-in, invited activation, exact provisioning authority, race-safe PostgreSQL advisory locking, and `auth_version` session revocation.
- Use thin controllers, Form Requests, policies, actions, API resources, explicit domain errors, and stable JSON exception rendering.
- Record security- and account-relevant audit events without credentials or raw GIS tokens.
- Transactionally write invitation notifications to a durable outbox, enqueue them on Laravel's database queue, and process them asynchronously.
- Add an idempotent administrator bootstrap command and explicit cutover/preflight/session-invalidation operations.
- Update only the React API/CSRF integration and Vite proxy/tooling needed for Laravel; retain the existing UI and interaction design.
- Add CI, dependency/security checks, PostgreSQL migration/feature/integration tests, and cutover/rollback documentation.

## Non-goals

- No React UI redesign, route redesign, role redesign, or new product workflow.
- No persistence for prototype catalog searches, records, dashboard counters, or other prototype-only actions.
- No Laravel-to-Python or React-to-Python integration; the Python CLI remains standalone.
- No changes to the similarity algorithm, its input/output behavior, or its dependencies except documentation corrections proven necessary.
- No new repository, service decomposition, alternate database, token-based API, Socialite redirect flow, or cross-origin SPA architecture.
- No compatibility layer for APIs or data that do not already exist. The only compatibility contract is the existing six paths, methods, user shape, and `app_users` data described here.
- No import, merge, or cleanup of the unrelated `plan/researchnav-mvp` branch.

## Fixed architecture decisions

### Runtime and boundaries

1. Laravel is the only HTTP backend after cutover. React remains the browser client and Vite remains its build tool. The Python CLI remains under `algorithm/` and is not called by Laravel.
2. Development uses Vite's `/api` proxy to Laravel. Production presents the built React assets and Laravel `/api` under one HTTPS origin at the edge; CORS is not used as a substitute for same-origin controls.
3. PostgreSQL is required in development tests, CI, staging, and production. SQLite is prohibited for acceptance evidence because advisory locks, constraints, queue behavior, and migration adoption are PostgreSQL-specific.
4. Controllers perform transport orchestration only. Form Requests own input normalization/validation; policies own authority; actions own transactions and domain behavior; resources own JSON representation; models do not absorb workflow logic.

### API compatibility contract

The following are the only HTTP API paths in scope. Do not add a seventh API path. `GET /api/health` also initializes the session/CSRF cookie pair for the SPA without changing its response body.

| Method and path | Success contract | Required protection and behavior |
|---|---|---|
| `GET /api/health` | `200 {"status":"ok"}` | Same-origin session middleware; emits/refreshes CSRF material usable by the SPA. No database write other than the configured session behavior. |
| `POST /api/auth/google` | `200 {"user": User}` | CSRF, same-origin, 20/minute limiter, GIS token verification, session ID rotation, blocked first sign-in, invited activation. |
| `GET /api/auth/session` | `200 {"user": User}` | Authenticated session and `auth_version` match. Blocked/invited users may retrieve their own session state. |
| `POST /api/auth/logout` | `204` with no body | CSRF and authenticated session; invalidate server session, expire Laravel cookies, and expire the legacy `researchnav.sid` cookie. |
| `GET /api/admin/coordinators` | `200 {"users": User[], "pagination": Pagination}` | Active Administrator only; deterministic newest-first order with a unique tie-breaker. |
| `POST /api/admin/coordinators` | `201 {"user": User}` | CSRF, 30/hour limiter, active Administrator only, transactional Coordinator provisioning and outbox/audit writes. |
| `GET /api/coordinator/instructors` | `200 {"users": User[], "pagination": Pagination}` | Active Coordinator only; no Administrator bypass; deterministic newest-first order with a unique tie-breaker. |
| `POST /api/coordinator/instructors` | `201 {"user": User}` | CSRF, 60/hour limiter, active Coordinator only, transactional Instructor provisioning and outbox/audit writes. |

`User` remains exactly:

```json
{
  "email": "normalized@example.edu",
  "role": "coordinator",
  "accessStatus": "active",
  "isAdmin": false
}
```

Do not expose database IDs, `google_sub`, `auth_version`, timestamps, audit data, or outbox data in this resource. List requests accept `page` and `per_page`; defaults are `1` and `25`, and `per_page` is capped at `100`. Pagination is additive around the unchanged `users` array:

```json
{
  "users": [],
  "pagination": {
    "page": 1,
    "perPage": 25,
    "total": 0,
    "lastPage": 1
  }
}
```

All API errors use `{"error":"STABLE_CODE"}` with optional non-sensitive `details` only for validation. Preserve existing codes where the Express behavior already defines them: `INVALID_REQUEST`, `GOOGLE_EMAIL_NOT_VERIFIED`, `AUTHENTICATION_REQUIRED`, `SESSION_USER_NOT_FOUND`, `ACCOUNT_ACCESS_PENDING`, `ROLE_NOT_AUTHORIZED`, `ORIGIN_NOT_ALLOWED`, `LOGOUT_FAILED`, and `INTERNAL_SERVER_ERROR`. Define and test deterministic codes for Laravel-specific or formerly unhandled cases, including `CSRF_TOKEN_MISMATCH`, `SESSION_REVOKED`, `GOOGLE_TOKEN_INVALID`, `GOOGLE_ACCOUNT_BINDING_CONFLICT`, `ACCOUNT_ROLE_CONFLICT`, and `RATE_LIMITED`. Never return an HTML exception page, stack trace, SQL text, GIS credential, or unbounded validation payload from `/api`.

### Identity, sessions, and authorization

1. Normalize email with trim plus lowercase before lock, lookup, or insert. Continue enforcing lowercase uniqueness in PostgreSQL.
2. Verify GIS tokens with Google's maintained PHP verification library. Require a valid signature, configured audience, allowed Google issuer, expiry/not-before validity, non-empty `sub` and email, and `email_verified=true`. Do not manually decode JWTs and do not store or log the credential.
3. Acquire transaction-scoped PostgreSQL advisory locks in deterministic order for the normalized email and Google subject before resolving/binding an identity. Provisioning locks by normalized email. Unique constraints remain the final collision defense. Lock keys use a namespaced, deterministic 64-bit derivation documented and covered by concurrent PostgreSQL tests.
4. No matching account creates an `app_users` row with UUID ID, role `researcher`, status `blocked`, `is_admin=false`, and the verified subject. It returns a valid session/user response but the React access gate continues to deny the dashboard.
5. An `invited` matching email activates on first verified sign-in and binds the subject. A subject/email mismatch or attempted relink is rejected and audited; it is never silently repaired.
6. Laravel stores only the minimum identity/session-version data needed to resolve the user. Rotate the session ID after Google authentication and invalidate it on logout.
7. Add `app_users.auth_version` with a non-null default. Capture it in the session at login and compare it to the current row on every authenticated API request. Any role, access, admin, or binding change increments it in the same transaction. A mismatch destroys the session and returns `SESSION_REVOKED`.
8. Use a dedicated Laravel session cookie name, `HttpOnly`, `SameSite=Lax`, secure in production, path `/`, rolling eight-hour lifetime. The readable XSRF cookie is not an authentication credential. Production startup/config validation must reject non-HTTPS app URLs, unsafe cookie settings, placeholder `APP_KEY`, and missing required database/Google/mail settings.
9. Exact authority is explicit policy behavior: active `role=admin` with `is_admin=true` may provision/list Coordinators; active `role=coordinator` with `is_admin=false` may provision/list Instructors. There is no generic Administrator bypass. Active targets, administrators, and incompatible role records cannot be reassigned through these workflows. Existing blocked/invited Researcher or same-target-role records follow the current safe promotion rules.

### Existing data and migrations

1. Map the Laravel authenticatable model to `app_users`; retain UUID IDs, existing column names, role values, statuses, and the `app_users_admin_consistency` constraint. Do not create a replacement `users` table and do not require passwords or remember tokens.
2. Use ordered Laravel migration files with complete `up()` and `down()` methods. Add `auth_version`, Laravel `sessions`, `jobs`, `job_batches`, `failed_jobs`, `audit_events`, and `notification_outbox` structures and their required constraints/indexes. Do not drop `app_users` or `user_sessions` in a normal migration.
3. A migration-adoption test keeps a canonical legacy-schema fixture under T2's owned database-test path. T2 PR evidence records a SHA-256/content comparison to the current `server/migrations/001_auth.sql` before T6 deletes Express; ongoing tests use the retained fixture without depending on `server/`. The test loads that fixture, inserts representative rows for every status and relevant role, runs Laravel migrations, verifies unchanged IDs/user fields and new defaults, rolls only the Laravel conversion migrations down, verifies legacy rows remain readable, and migrates up again.
4. Destructive tests may run only against a database whose environment is explicitly `testing` and whose database name passes a test-only guard. Production/staging migration commands are forward-only during normal deploy.
5. Express sessions are deliberately invalid at cutover. A confirmation-gated operation counts and deletes all rows in legacy `user_sessions`, records the operation, and verifies zero remaining rows before traffic switches. Migration rollback does not restore those sessions; users sign in again after either cutover or rollback.

### Audit, outbox, and queue

1. `audit_events` is append-only through application code and a PostgreSQL guard against update/delete. It records event ID/type, occurred time, actor user when known, target user when known, request/correlation identifier, and bounded JSON metadata. Metadata excludes tokens, cookies, mail credentials, secrets, and full exception traces.
2. At minimum audit: blocked account creation, invited activation, successful binding/login, rejected binding/relink, session revocation, Coordinator/Instructor provisioning or conflict, administrator bootstrap/change, notification terminal failure, and Express-session invalidation.
3. Account mutation, audit event, and `notification_outbox` insertion share one database transaction. A notification is never sent inline from an HTTP request.
4. The outbox dispatcher claims bounded batches with `FOR UPDATE SKIP LOCKED`, creates database-queue jobs and marks them dispatched in one PostgreSQL transaction. Jobs reference outbox IDs rather than copying secrets. Delivery records attempts and terminal failure; retries use bounded backoff.
5. SMTP is inherently at-least-once at the final network boundary. Use an outbox idempotency key and job uniqueness to prevent duplicate enqueue, document the small post-send/pre-ack duplicate risk, and make invitation wording safe if received twice.

### Deployment and rollback

The release is an expand/migrate/deploy/cutover sequence, not an in-place destructive replacement:

1. Back up PostgreSQL and record the exact application/database revisions.
2. Run conversion preflight against the current `app_users` shape and data; stop on drift, duplicate normalized emails, invalid role/status/admin combinations, orphaned inviter IDs, or missing extensions/permissions.
3. Apply forward Laravel migrations while Express remains available, then deploy Laravel web and database queue/scheduler processes without switching traffic.
4. Run health, migration, queue, GIS configuration, and representative read-only smoke checks.
5. Pause writes/traffic briefly, run the confirmation-gated Express session invalidation, verify zero legacy sessions, and switch `/api` traffic to Laravel under the same origin.
6. Run authentication, blocked/invited, authority, pagination, CSRF, outbox, queue, and React smoke checks. Monitor errors, queue depth, failed jobs, outbox age, and database saturation.
7. Rollback switches traffic to the prior Express artifact and rolls back only conversion migrations proven safe for the deployed database revision. Never restore invalidated session rows; all users reauthenticate. If Laravel has created data that an older schema cannot represent, keep expanded columns/tables and perform application-only rollback until a reviewed data-forward fix is available.

## Observable acceptance criteria

- [ ] PHP reports 8.5.x, Composer resolves locked Laravel 13.24, and Laravel boots with PostgreSQL.
- [ ] The Express process, `server/` source, server TypeScript config, and Express-only dependencies/scripts are absent from the final tree.
- [ ] The existing React pages and visual behavior pass their current tests; only API, CSRF, proxy, and required tooling integration changed.
- [ ] The standalone Python CLI and algorithm tests pass unchanged, and no Laravel/Python call path exists.
- [ ] All six `/api` paths, methods, success status codes, stable errors, and exact four-field `User` representation pass contract tests.
- [ ] List endpoints paginate with bounded parameters and deterministic ordering while retaining the `users` array.
- [ ] GIS verification rejects bad signature/audience/issuer/time/email-verification claims and never logs the credential.
- [ ] Concurrent first sign-ins and invitations are serialized safely; no duplicate users, subject bindings, outbox messages, or conflicting role mutations occur.
- [ ] A new verified user is blocked; a matching invited user activates; binding conflicts are rejected without changing either account.
- [ ] An active Administrator can only manage Coordinators, and an active Coordinator can only manage Instructors; every cross-role, inactive, or generic-admin-bypass attempt is denied.
- [ ] CSRF is required for every mutation; session fixation, stale `auth_version`, logout, and legacy Express-session tests pass.
- [ ] Existing `app_users` fixtures survive migration up/down/up with IDs and existing values unchanged; all conversion migrations are reversible in a dedicated PostgreSQL test database.
- [ ] Administrator bootstrap is validated, idempotent, concurrency-safe, audited, and increments `auth_version` when it changes authority.
- [ ] Provisioning commits account, audit, and outbox atomically; notification delivery occurs only through the database queue and survives worker/process restart.
- [ ] Audit records are bounded, non-secret, queryable by operators, and immutable through normal application/database operations.
- [ ] CI runs PHP formatting/static analysis/tests, frontend formatting/lint/tests/build, Python tests, migration adoption/reversal, dependency audits, and secret/security checks with required status checks.
- [ ] A clean developer can follow setup documentation; an operator can execute preflight, cutover, monitoring, and rollback without relying on undocumented steps.

## Dependency graph and merge order

```text
P0 parent plan approved
  |
  v
T1 Laravel platform and API contract foundation
  |
  v
T2 PostgreSQL adoption, models, migrations, persistence primitives
  |
  v
T3 GIS authentication, sessions, CSRF, user resource
  |
  v
T4 provisioning authority, pagination, bootstrap, audit/outbox producers
  |\
  | +----------------------+
  v                        v
T5 notification outbox/queue consumer   T6 React/Express cutover
  |                        |
  +------------+-----------+
               v
T7 CI, contract, architecture, and security hardening
               |
               v
T8 combined integration and cutover rehearsal
               |
               v
T9 setup, architecture, cutover, and rollback documentation
               |
               v
Final review/security/release gates on parent Plan PR
```

T5 and T6 are the only implementation tasks intended to run in parallel. All other arrows are hard dependencies. A child PR is merged into the parent plan branch before branches for its dependents are created. T7 and later start from the combined plan head containing all prerequisite child PRs.

## Branch, worktree, owner, and PR topology

The Repository Agent creates each worktree only when its entry gate is met and verifies a clean branch at the current parent-plan commit. Paths below are proposed isolated locations; verify they do not already exist before creation.

| Task | Single implementation owner | Head branch | Isolated worktree | Child PR base |
|---|---|---|---|---|
| T1 | Backend Builder (`app-backend-builder`) | `feat/laravel-platform` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws01-platform` | `plan/laravel-backend-conversion` |
| T2 | Database Builder (`app-database-builder`) | `feat/laravel-persistence` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws02-persistence` | `plan/laravel-backend-conversion` |
| T3 | Backend Builder (`app-backend-builder`) | `feat/laravel-auth` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws03-auth` | `plan/laravel-backend-conversion` |
| T4 | Backend Builder (`app-backend-builder`) | `feat/laravel-provisioning` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws04-provisioning` | `plan/laravel-backend-conversion` |
| T5 | Backend Builder (`app-backend-builder`) | `feat/laravel-notifications` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws05-notifications` | `plan/laravel-backend-conversion` |
| T6 | Frontend Builder (`app-frontend-builder`) | `feat/laravel-frontend-cutover` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws06-frontend` | `plan/laravel-backend-conversion` |
| T7 | Backend Builder (`app-backend-builder`) | `test/laravel-ci-security` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws07-quality` | `plan/laravel-backend-conversion` |
| T8 | Integration Agent (`app-integration-agent`) | `integration/laravel-backend-conversion` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws08-integration` | `plan/laravel-backend-conversion` |
| T9 | Documentation Agent (`app-documentation-agent`) | `docs/laravel-backend-conversion` | `C:\Users\MURALLONMILLICENTJOH\AppData\Local\Temp\opencode\researchnav-laravel-ws09-docs` | `plan/laravel-backend-conversion` |

Topology:

```text
main
  ^
  | Draft parent PR
plan/laravel-backend-conversion
  ^-- feat/laravel-platform
  ^-- feat/laravel-persistence
  ^-- feat/laravel-auth
  ^-- feat/laravel-provisioning
  ^-- feat/laravel-notifications ---------+ parallel after T4
  ^-- feat/laravel-frontend-cutover ------+
  ^-- test/laravel-ci-security
  ^-- integration/laravel-backend-conversion
  ^-- docs/laravel-backend-conversion

plan/researchnav-mvp   (unrelated; no edge to this graph)
```

Each child PR targets `plan/laravel-backend-conversion`, links the Draft parent PR, lists its task ID and acceptance criteria, and includes exact verification evidence. No child targets `main`. The PR Coordinator merges a child only after pre-commit testing, exact-commit PR testing, code review, required security review, and CI pass.

## Exclusive file ownership

Ownership is exclusive for the complete implementation. A task may create, modify, or delete only its listed paths. Globs assigned to different tasks do not overlap. Unlisted paths are read-only. If an unforeseen shared-file change is required, stop that task, have the Planning/PR Coordinator amend ownership before work resumes, and serialize the new owner; do not make opportunistic cross-workstream edits.

| Task | Exclusive writable paths |
|---|---|
| Plan only | `docs/plans/laravel-backend-conversion.md` |
| T1 | `.editorconfig`; `.gitignore`; `artisan`; `composer.json`; `composer.lock`; `phpunit.xml`; `bootstrap/**`; `config/**`; `public/index.php`; `storage/**/.gitignore`; `routes/api.php`; `routes/console.php`; `routes/web.php`; `app/Exceptions/**`; `app/Providers/**`; `app/Http/Controllers/Controller.php`; `app/Http/Middleware/Platform/**`; `tests/TestCase.php`; `tests/Feature/Platform/**`; `tests/Unit/Platform/**` |
| T2 | `database/**`; `app/Enums/**`; `app/Models/**`; `app/Support/Database/**`; `app/Support/Persistence/**`; `tests/Feature/Database/**`; `tests/Unit/Persistence/**` |
| T3 | `routes/api/auth.php`; `app/Actions/Auth/**`; `app/Contracts/Auth/**`; `app/Http/Controllers/Api/Auth/**`; `app/Http/Middleware/Auth/**`; `app/Http/Requests/Auth/**`; `app/Http/Resources/UserResource.php`; `app/Services/GoogleIdentity/**`; `tests/Feature/Auth/**`; `tests/Unit/Auth/**` |
| T4 | `routes/api/provisioning.php`; `routes/console/bootstrap.php`; `app/Actions/Provisioning/**`; `app/Console/Commands/BootstrapAdminCommand.php`; `app/Http/Controllers/Api/Provisioning/**`; `app/Http/Requests/Provisioning/**`; `app/Http/Resources/Provisioning/**`; `app/Policies/**`; `tests/Feature/Provisioning/**`; `tests/Unit/Provisioning/**` |
| T5 | `routes/console/notifications.php`; `app/Actions/Notifications/**`; `app/Console/Commands/Notifications/**`; `app/Jobs/**`; `app/Mail/**`; `app/Notifications/**`; `resources/views/mail/**`; `tests/Feature/Notifications/**`; `tests/Unit/Notifications/**` |
| T6 | `package.json`; `package-lock.json`; `vite.config.ts`; `src/api.ts`; `src/api.test.ts`; `server/**` (deletion); `tsconfig.server.json` (deletion) |
| T7 | `.github/workflows/**`; `phpstan.neon.dist`; `pint.json`; `tests/Architecture/**`; `tests/Contract/**`; `tests/Security/**`; `tests/Support/**` |
| T8 | `routes/console/operations.php`; `app/Console/Commands/Operations/**`; `tests/Integration/**`; `scripts/cutover/**` |
| T9 | `.env.example`; `README.md`; `docs/architecture/**`; `docs/operations/**` |

Protected paths that no implementation workstream may modify: `algorithm/**`, all React UI component/style files other than `src/api.ts` and the new `src/api.test.ts`, `researchnav-design.md`, and this plan. T6 must prove that deleting `server/**` is the only product-source deletion and that the current UI tests still pass.

## Ordered workstreams

### T1 — Laravel platform and API contract foundation

**Entry gate:** Parent Plan PR is approved for execution; branch is based on the current clean parent-plan head; PHP 8.5, Composer, Node, and a dedicated PostgreSQL test database are available; T1 owns only its listed paths.

**Tasks:**

1. Create the minimal Laravel 13.24 root application and lock production/development dependencies needed by the approved architecture, including formatting, static analysis, PostgreSQL, queue, and maintained GIS verification support. Do not create Laravel's default `users` migration/model.
2. Configure PostgreSQL-only database, database sessions/queue, mail, Google client ID, trusted proxy/HTTPS behavior, secure cookies, and fail-fast production configuration.
3. Configure root API and console route aggregators to load owned fragments in deterministic order. The root API file owns `/api/health`; later tasks add files beneath `routes/api/` without changing the root.
4. Implement centralized JSON exception conversion and named rate limiters for the frozen errors and endpoint limits. Enforce request-size and validation-detail bounds.
5. Add platform smoke/config/error tests. Add no domain behavior and no React changes.

**Acceptance:** Laravel reports exactly 13.24, boots on PHP 8.5/PostgreSQL, health has the exact body, production misconfiguration fails closed, API exceptions are JSON/stable, route aggregation permits later non-overlapping fragments, and no default users table exists.

**Task verification:**

```bash
composer validate --strict
composer install --no-interaction
php artisan --version
php artisan about
php vendor/bin/pint --test
php vendor/bin/phpstan analyse --memory-limit=1G
php artisan test --testsuite=Feature --filter=Platform
```

**Exit gate:** Builder self-check passes; Pre-Commit Tester independently reruns the checks and inspects only T1 paths; Git Steward secret-scans and stages explicit T1 paths; child PR passes CI/code review and Security Reviewer configuration review; PR Coordinator merges T1 and records evidence.

### T2 — Existing PostgreSQL adoption and persistence primitives

**Depends on:** T1 merged.

**Tasks:**

1. Model `app_users` as the Laravel authenticatable UUID model with explicit table/column casts and no password/remember-token assumptions.
2. Add reversible conversion migrations for `auth_version`, Laravel sessions, database queue tables, immutable audit events, and notification outbox. Preserve legacy `app_users` and `user_sessions` and all existing constraints/data.
3. Add database constraints/indexes for role/status consistency, lookup/pagination, outbox claim/idempotency, queue operation, and audit lookup without weakening `app_users_admin_consistency`.
4. Implement reusable transaction-scoped advisory lock, audit recorder, and outbox recorder primitives. Keep HTTP and mail concerns out of persistence support.
5. Add legacy-shape migration adoption/up-down-up tests, model mapping tests, immutable-audit tests, and true concurrent advisory-lock tests against PostgreSQL.

**Acceptance:** Representative legacy rows survive up/down/up byte-for-byte for preserved fields; rollback removes only conversion structures; concurrent lock tests serialize same identity and allow unrelated identities; audit mutation is rejected; outbox idempotency constraints work; test database safeguards prevent destructive commands against a non-test database.

**Task verification:**

```bash
php artisan migrate:fresh --env=testing
php artisan test --testsuite=Feature --filter=Database
php artisan test --filter=LegacyAppUsersMigrationTest
php artisan test --filter=MigrationReversibilityTest
php artisan test --filter=AdvisoryLockConcurrencyTest
php artisan migrate:status --env=testing
php vendor/bin/pint --test
php vendor/bin/phpstan analyse --memory-limit=1G
```

`migrate:fresh` and rollback commands are permitted only after the tester confirms `APP_ENV=testing` and a dedicated disposable database name. Do not run them against shared, staging, or production data.

**Exit gate:** Migration evidence includes legacy fixture counts/checksums before and after; Database Builder and independent tester pass; Database and Security Reviewers approve constraints, locking, reversibility, and secret handling; child PR merges before T3 starts.

### T3 — GIS authentication, session security, and user resource

**Depends on:** T2 merged.

**Tasks:**

1. Add auth route fragment and thin controllers/Form Requests/resources for Google sign-in, session retrieval, and logout.
2. Implement GIS verifier claim checks behind a mockable contract; never log/store credentials.
3. Implement advisory-locked identity resolution for blocked first sign-in, invited activation, exact binding, conflict rejection, transactional audit, last-login update, and `auth_version` changes.
4. Implement session rotation, minimal session payload, authenticated-user loading, active-account middleware where needed, rolling expiry, version comparison/revocation, CSRF behavior, strict same-origin `Origin`/fallback `Referer` validation for mutations, and legacy-cookie expiration.
5. Render the exact four-field `User` resource and frozen stable errors. Test all auth, claim, status, cookie, CSRF, fixation, version, and concurrency cases against PostgreSQL.

**Acceptance:** All auth path contracts pass; malformed/unverified/wrong-audience tokens fail; new users are blocked; invited users activate; conflict paths do not mutate users; simultaneous sign-ins create one user/binding; session ID rotates; stale versions and logout invalidate sessions; no credential appears in logs/audit/errors.

**Task verification:**

```bash
php artisan route:list --path=api/auth
php artisan test --testsuite=Feature --filter=Auth
php artisan test --filter=GoogleIdentityClaimsTest
php artisan test --filter=ConcurrentGoogleSignInTest
php artisan test --filter=SessionSecurityTest
php artisan test --filter=CsrfProtectionTest
php vendor/bin/pint --test
php vendor/bin/phpstan analyse --memory-limit=1G
```

**Exit gate:** Contract evidence maps every auth outcome/error; Pre-Commit Tester passes; Security Reviewer explicitly approves GIS verification, CSRF, cookies, fixation defense, version revocation, logging, and rate limiting; exact-commit PR tests pass; child PR merges before T4.

### T4 — Provisioning, exact authority, pagination, bootstrap, and producers

**Depends on:** T3 merged.

**Tasks:**

1. Add provisioning route fragment, thin controllers, normalized Form Requests, explicit policy methods, actions, resources, and bounded paginators.
2. Implement Administrator-to-Coordinator and Coordinator-to-Instructor authority exactly, with no generic admin override. Preserve current safe rules for blocked/invited Researcher or same-target-role records and reject active/admin/incompatible records.
3. Serialize provisioning by normalized-email advisory lock. In one transaction update/insert the user, increment `auth_version` when authority/status changes, append audit, and append one idempotent invitation outbox row.
4. Add an idempotent, concurrency-safe `researchnav:bootstrap-admin` command using validated normalized email/config. Audit actual changes, increment `auth_version`, and require an explicit production confirmation while remaining automation-friendly and non-interactive when confirmation is supplied.
5. Test every role/status/`is_admin` matrix case, deterministic pagination, duplicate submissions, races with sign-in, rollback on audit/outbox failure, and bootstrap repeat/concurrency behavior.

**Acceptance:** Exact authority matrix passes; Administrator cannot use Instructor endpoints; inactive users cannot provision; user shape is unchanged; pagination is bounded/stable; every successful mutation has exactly one audit and outbox event; failed transactions leave none; bootstrap is safe and idempotent.

**Task verification:**

```bash
php artisan route:list --path=api/admin
php artisan route:list --path=api/coordinator
php artisan test --testsuite=Feature --filter=Provisioning
php artisan test --filter=ProvisioningAuthorityMatrixTest
php artisan test --filter=ProvisioningConcurrencyTest
php artisan test --filter=ProvisioningAtomicityTest
php artisan test --filter=PaginationContractTest
php artisan test --filter=BootstrapAdminCommandTest
php vendor/bin/pint --test
php vendor/bin/phpstan analyse --memory-limit=1G
```

**Exit gate:** Database-backed authority matrix and race evidence pass; Security Reviewer approves policies, mass-assignment boundaries, authorization order, rate limits, and bootstrap safeguards; child PR merges, unblocking T5 and T6.

### T5 — Durable outbox, database queue, and invitation delivery

**Depends on:** T4 merged. May run in parallel with T6 because ownership does not overlap.

**Tasks:**

1. Implement bounded `SKIP LOCKED` outbox dispatch to Laravel's database queue, atomic enqueue/dispatched marking, idempotent job identity, retry/backoff, attempt state, terminal failure audit, and operational commands/schedule.
2. Implement invitation mail rendering for Coordinator and Instructor, including already-verified activation wording, using escaped templates and configured same-origin app URL.
3. Keep SMTP/network activity outside account transactions and HTTP requests. Validate production mail configuration without exposing credentials.
4. Test crash/retry boundaries, two concurrent dispatchers, worker restart, SMTP success/failure, duplicate enqueue prevention, and eventual terminal failure with faked mail plus PostgreSQL queue integration.

**Acceptance:** Provisioning succeeds durably when workers are stopped; queued mail is recoverable after restart; concurrent dispatchers enqueue once; HTTP latency does not include SMTP; retry state is observable; terminal failures audit safely; templates contain no unsafe user-controlled HTML.

**Task verification:**

```bash
php artisan list
php artisan test --testsuite=Feature --filter=Notifications
php artisan test --filter=OutboxDispatcherConcurrencyTest
php artisan test --filter=NotificationRetryTest
php artisan test --filter=InvitationMailTest
php artisan queue:failed
php vendor/bin/pint --test
php vendor/bin/phpstan analyse --memory-limit=1G
```

The evidence must identify the outbox/queue/notification commands in the `php artisan list` output.

**Exit gate:** Queue/outbox failure-injection evidence passes; Security Reviewer approves mail escaping/configuration and secret handling; PR Tester verifies exact commit with PostgreSQL; child PR merges.

### T6 — React CSRF/proxy update and Express removal

**Depends on:** T4 merged. May run in parallel with T5.

**Tasks:**

1. Update the API client to initialize CSRF through existing `GET /api/health`, read/decode the XSRF cookie, send the standard header on unsafe methods, retain `credentials: include`, and retry at most once after a CSRF-expiry response.
2. Point Vite's `/api` development proxy at Laravel's documented local port without changing browser-visible API paths or enabling broad CORS.
3. Remove Express runtime scripts/dependencies/types and `server/**`/`tsconfig.server.json`; retain frontend scripts and add Laravel-compatible combined-development commands only where portable.
4. Add focused API-client tests for CSRF bootstrap, mutation headers, single retry, stable error handling, logout, and unchanged user/list parsing. Run all existing React tests and build.

**Acceptance:** The current UI signs in, reloads sessions, logs out, and provisions through the same paths; unsafe calls contain CSRF; retries are bounded; Node no longer starts an API server or installs Express-only packages; rendered UI snapshots/behavior remain unchanged.

**Task verification:**

```bash
npm ci
npm run format:check
npm run lint
npm test
npm run build
npm ls --depth=0
```

The final `npm ls --depth=0` output must demonstrate that `express`, `express-session`, `connect-pg-simple`, `google-auth-library`, `nodemailer`, `pg`, `zod`, and their backend-only type packages are absent.

**Exit gate:** Frontend tests/build pass; diff confirms no UI/style/component or algorithm changes; Pre-Commit Tester and Code Reviewer approve; child PR merges after T5 or independently if T5 is still in review.

### T7 — CI, contract, architecture, and security hardening

**Depends on:** T5 and T6 merged.

**Tasks:**

1. Add GitHub Actions with PHP 8.5, Composer cache, Node, Python, and a real PostgreSQL service. Use least-privilege test credentials and no production secrets.
2. Add cross-cutting API contract tests for every method/path/status/user/error/pagination shape; architecture tests for thin controllers and forbidden Laravel-to-Python/React persistence dependencies; security tests for authorization, CSRF, headers, log redaction, mass assignment, request bounds, and session configuration.
3. Run Composer validation/audit, Pint, PHPStan, PHPUnit, npm formatting/lint/tests/build/audit, Python tests, migration adoption/reversal, and repository secret scanning. Pin action major/immutable versions according to repository policy and grant minimal workflow permissions.
4. Configure required jobs so no test silently falls back to SQLite or skips concurrency/queue tests.

**Acceptance:** A clean CI run proves every frozen contract against PostgreSQL; workflow permissions are read-only unless a documented job needs more; no credentials are printed; all tools are lockfile-driven; security/architecture regressions fail CI.

**Task verification:**

```bash
composer validate --strict
composer audit
php vendor/bin/pint --test
php vendor/bin/phpstan analyse --memory-limit=1G
php artisan test
npm ci
npm run format:check
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
python -m pip install -r algorithm/requirements.txt
python -m unittest discover -s algorithm -p "test_*.py"
```

**Exit gate:** Local equivalent and GitHub required jobs pass; PR Tester confirms exact SHA; Code and Security Reviewers have no blocking findings; child PR merges.

### T8 — Combined integration and cutover rehearsal

**Depends on:** T7 merged.

**Tasks:**

1. Add operator-only preflight and confirmation-gated Express-session invalidation commands plus non-secret cutover helper scripts. Commands are idempotent where possible and refuse unsafe environment/database targets.
2. Add combined PostgreSQL integration scenarios covering legacy migration, bootstrap, blocked sign-in, invitation, activation, session revocation, pagination, audit/outbox, database worker, logout, and rollback/app-forward recovery.
3. Rehearse the full expand/deploy/invalidate/switch/smoke/rollback sequence against disposable production-like infrastructure/data. Record row counts/checksums, session deletion count, queue/outbox state, timing, and exact commands in the PR evidence.
4. Do not repair cross-boundary product files in this branch. Route any defect to the task that owns the affected path through a new correction commit/PR and repeat all downstream gates.

**Acceptance:** Preflight catches every defined drift condition; invalidation requires confirmation and leaves zero Express sessions; end-to-end flow passes under same-origin cookies and PostgreSQL; application rollback succeeds with mandatory reauthentication; no prototype data or algorithm integration appears.

**Task verification:**

```bash
php artisan researchnav:cutover-preflight --env=testing
php artisan test tests/Integration
php artisan test --filter=CutoverRehearsalTest
php artisan test --filter=ExpressSessionInvalidationTest
php artisan test --filter=ApplicationRollbackTest
php artisan migrate:status --env=testing
php artisan queue:failed
composer audit
npm run build
python -m pip install -r algorithm/requirements.txt
python -m unittest discover -s algorithm -p "test_*.py"
```

Destructive rehearsal runs only on a disposable, backed-up test database after its guard is independently verified.

**Exit gate:** Integration Tester supplies commands, exit codes, environment, migration/session counts, and output summary; Code and Security Reviewers approve; all failures are repaired by the original path owner; integration child PR merges.

### T9 — Developer and operator documentation

**Depends on:** T8 merged and final implementation commands/contracts frozen.

**Tasks:**

1. Update README and `.env.example` for PHP 8.5, Composer, PostgreSQL, GIS, Laravel/Vite development, database queue/scheduler, mail, bootstrap, testing, and same-origin deployment. Use placeholders only.
2. Document architecture/data flow, exact authority, API contracts, migration ownership, audit/outbox semantics, monitoring, and the deliberate lack of Python integration/prototype persistence.
3. Write command-by-command preflight, backup, expand, deploy, session invalidation, traffic switch, smoke, monitoring, rollback, and failed-notification recovery runbooks. State clearly that rollback does not restore Express sessions.
4. Validate every documented command against a clean/disposable environment and scan examples for secrets or environment-specific personal values.

**Acceptance:** A new developer can boot/test the app; an operator can rehearse cutover and rollback; configuration requirements and failure stops are explicit; no secret, local tunnel, personal path, or stale Express command remains.

**Task verification:**

```bash
composer validate --strict
php artisan list
php artisan route:list --path=api
npm run format:check
npm run build
python -m pip install -r algorithm/requirements.txt
python -m unittest discover -s algorithm -p "test_*.py"
```

Also execute each runbook command in a disposable environment and attach evidence to the child PR; documentation-only syntax inspection is insufficient.

**Exit gate:** Documentation review and clean-environment walkthrough pass; child PR merges; PR Coordinator updates the parent body with final links/evidence.

## Mandatory task-level delivery loop

Every T1–T9 task follows this loop without exception:

1. Repository Agent verifies dependency merges, creates the isolated branch/worktree from the current parent-plan SHA, and records that SHA.
2. The single assigned owner changes only exclusive paths and runs the task commands while changes remain unstaged.
3. Pre-Commit Tester independently inspects `git status --short`, the unstaged diff, ownership, generated files, secrets, and task commands. Failure returns to a Fix Agent in the same worktree; nothing is staged.
4. After PASS only, Git Steward stages explicit owned paths (never `git add .`), reviews `git diff --cached`, secret-scans, and creates a logical commit.
5. PR Coordinator pushes and opens/updates the child PR to the parent plan branch with task mapping and evidence.
6. PR Tester tests the exact committed SHA. Code Reviewer reviews every child; Security Reviewer is mandatory for T1–T5, T7, T8, and any correction touching auth/data/config/CI.
7. Findings return through Fix Agent → Pre-Commit Tester → Git Steward as a new commit; do not amend pushed commits or force-push.
8. PR Coordinator merges only with green required checks and no blocking findings, then updates the parent checklist and launches newly unblocked work.

Retry budget is three cycles for the same pre-commit, PR, or integration root failure. Exhaustion pauses the affected workstream with exact evidence; it does not weaken a gate.

## Security gates

| Gate | Timing | Required evidence | Blocking conditions |
|---|---|---|---|
| S0 Contract/threat gate | Before T1 | Six-path inventory, trust boundaries, stable errors, authority matrix, data classification, same-origin decision | Any ambiguous auth/authority/data contract |
| S1 Supply-chain/config gate | T1 and every dependency change | Locked dependencies, Composer/npm audit, maintained GIS verifier, production fail-closed tests, secret scan | Unreviewed package, placeholder secret accepted in production, broad CORS/workflow permissions |
| S2 Identity/session gate | T3 | GIS negative-claim tests, token/log redaction, CSRF, cookie flags, session rotation, `auth_version`, rate limiting | Manual JWT trust, missing claim check, fixation, mutation without CSRF, stale session accepted |
| S3 Authorization/data gate | T2/T4 | Full authority/status matrix, policy-before-action tests, advisory-lock concurrency, constraints, migration checksums/reversal | Generic admin bypass, cross-role provisioning, unsafe reassignment, duplicate/racy identity, data loss |
| S4 Audit/notification gate | T4/T5 | Atomic rollback tests, audit immutability/redaction, outbox/queue crash tests, escaped mail | Inline SMTP, secret audit data, non-durable notification, uncontrolled retries |
| S5 CI/integration gate | T7/T8 | Real PostgreSQL, exact-SHA CI, dependency/secret scans, cutover and rollback rehearsal | SQLite substitution, skipped concurrency/migration tests, unresolved high vulnerability, unsafe cutover |
| S6 Final release gate | Parent PR | Final Code + Security reviews, all checks/checklists/evidence, backup/rollback readiness | Any open blocker, undocumented residual risk, failed required check |

## Migration, cutover, and operational risk controls

| Risk | Control and stop condition |
|---|---|
| Existing `app_users` schema/data drift | Preflight exact columns/constraints/roles/statuses/lowercase uniqueness and representative backup restore. Stop before migration on any mismatch; do not auto-coerce production data. |
| Migration data loss or irreversible down path | Expand-only conversion migrations, legacy fixture checksums, up/down/up test, database backup, and no normal migration that drops `app_users`/`user_sessions`. Stop if rollback changes preserved fields. |
| Concurrent GIS/provisioning race | Namespaced transaction advisory locks plus unique constraints and real multi-connection PostgreSQL tests. Stop on duplicate or nondeterministic outcomes. |
| Privilege escalation | Explicit endpoint policies and full authority matrix; no generic admin bypass. Stop on any unauthorized 2xx/role mutation. |
| Old Express sessions survive | Confirmation-gated deletion, row count before/after, cookie expiry, smoke reauthentication. Do not switch traffic until count is zero. Sessions are intentionally not restorable. |
| Laravel session/cookie outage | Same-origin/HTTPS preflight, trusted-proxy tests, rotation/version tests, and rollback artifact ready. Do not cut over if cookies fail through the production edge. |
| GIS configuration or provider outage | Audience/issuer/time preflight, bounded errors/rate limits, no local token fallback. Stop cutover if a real authorized-origin smoke test cannot complete. |
| Queue/outbox backlog or duplicate mail | Deploy worker/scheduler before traffic, monitor oldest pending/failed jobs, idempotent enqueue, bounded retries, documented SMTP duplicate boundary. Pause provisioning or roll back on growing unprocessed backlog. |
| Audit leakage/tampering | Metadata allowlists and bounds, token/log tests, append-only guard, restricted DB role. Block merge on secret exposure or mutable audit history. |
| PHP/Laravel deployment mismatch | Pin PHP 8.5 and Laravel 13.24 in Composer/CI/runtime checks. Stop if the deployment image cannot provide the exact supported runtime/extensions. |
| Frontend regression | T6 path restriction, current React suite/build, six-path contract tests, same-origin browser smoke. No cutover on UI/auth smoke failure. |
| Python regression | Protect `algorithm/**` and run its current tests in CI/final gate. Block changes or integration imports. |
| Rollback cannot consume new data | Prefer application-only rollback while retaining expanded schema; restore backup only under reviewed incident procedure. Never improvise destructive schema rollback. |
| Branch contamination | Record each child base SHA, use isolated worktrees, stage explicit owned paths, and leave `plan/researchnav-mvp` untouched. Stop on wrong base, shared worktree, or unrelated diff. |

## Global entry and exit gates

### Implementation entry gate

- [ ] Requirements, fixed decisions, API/user/error/authority contracts, and non-goals in this plan are approved.
- [ ] Draft parent Plan PR exists from `plan/laravel-backend-conversion` to `main` and links this file.
- [ ] Parent branch still has approved ancestry from `main` base `882f52c`; any later `main` drift is reviewed before execution.
- [ ] `plan/researchnav-mvp` is confirmed unrelated and excluded from all bases/worktrees.
- [ ] PHP 8.5, Composer, Node, Python, and dedicated PostgreSQL test resources are available without production credentials.
- [ ] Required child checks/review rules and worktree/ownership map are accepted.

### Final verification gate

- [ ] All T1–T9 child PRs are merged and linked, with no unmerged correction branch.
- [ ] Full locked-dependency build/test/audit suite passes on the exact combined parent-plan SHA against PostgreSQL.
- [ ] Migration adoption/up-down-up, concurrency, queue restart/failure, same-origin browser, cutover, and rollback evidence passes.
- [ ] Code Reviewer and Security Reviewer report no unresolved blocking finding.
- [ ] Setup/cutover/rollback documentation is validated in a clean disposable environment.
- [ ] Parent acceptance, workstream, verification, risk, and evidence checklists are complete.

### Release exit gate

- [ ] Production backup and rollback artifacts/revisions are identified.
- [ ] Laravel web, worker, scheduler, PostgreSQL migration, HTTPS/same-origin, GIS, mail, and monitoring preflights pass.
- [ ] Express session invalidation is explicitly authorized immediately before cutover.
- [ ] Parent Plan PR is marked ready only after all gates; merge to `main` occurs only with release authorization.
- [ ] After merge/cutover, `main` CI and production smoke/monitoring pass; otherwise execute documented rollback and report mandatory reauthentication.

## Workstream checklist

- [ ] P0 — Plan verified, committed by Git Steward, and Draft parent Plan PR opened (PR: ___)
- [ ] T1 — Laravel platform/API foundation merged (PR: ___; SHA: ___; evidence: ___)
- [ ] T2 — PostgreSQL adoption/migrations/persistence merged (PR: ___; SHA: ___; evidence: ___)
- [ ] T3 — GIS auth/session/user resource merged (PR: ___; SHA: ___; evidence: ___)
- [ ] T4 — Provisioning/pagination/bootstrap merged (PR: ___; SHA: ___; evidence: ___)
- [ ] T5 — Outbox/database queue/mail merged (PR: ___; SHA: ___; evidence: ___)
- [ ] T6 — React CSRF/proxy and Express removal merged (PR: ___; SHA: ___; evidence: ___)
- [ ] T7 — CI/contracts/security hardening merged (PR: ___; SHA: ___; evidence: ___)
- [ ] T8 — Integration/cutover rehearsal merged (PR: ___; SHA: ___; evidence: ___)
- [ ] T9 — Setup/architecture/cutover/rollback docs merged (PR: ___; SHA: ___; evidence: ___)
- [ ] Final combined test report linked: ___
- [ ] Final code review linked: ___
- [ ] Final security review linked: ___
- [ ] Cutover authorization/result linked: ___
- [ ] Parent PR ready/merged state recorded: ___

## Verification checklist

- [ ] `composer validate --strict`
- [ ] Laravel is exactly 13.24 on PHP 8.5
- [ ] `php vendor/bin/pint --test`
- [ ] `php vendor/bin/phpstan analyse --memory-limit=1G`
- [ ] `php artisan test` against PostgreSQL
- [ ] Legacy migration adoption/up-down-up test
- [ ] Multi-connection advisory-lock/race tests
- [ ] Queue/outbox restart and failure-injection tests
- [ ] `composer audit`
- [ ] `npm ci && npm run format:check && npm run lint && npm test && npm run build`
- [ ] `npm audit --omit=dev --audit-level=high`
- [ ] Python requirements install and current algorithm tests
- [ ] Repository secret scan and generated-artifact review
- [ ] Exact API/user/error/pagination contract suite
- [ ] Same-origin CSRF/cookie browser smoke
- [ ] Clean-database and adopted-legacy-database runs
- [ ] Disposable cutover/session invalidation/rollback rehearsal
- [ ] Final Code Reviewer PASS
- [ ] Final Security Reviewer PASS
- [ ] Required GitHub Actions checks green on exact parent SHA

## Plan PR body draft

**Title:** `plan: convert ResearchNAV backend to Laravel`

**Head:** `plan/laravel-backend-conversion`
**Base:** `main`
**State:** Draft

---

## Goal

Replace ResearchNAV's Express backend with Laravel 13.24 on PHP 8.5/PostgreSQL while preserving the React UI, standalone Python CLI, existing `app_users`, six `/api` paths, and exact public user shape. Add production-grade session/CSRF security, GIS verification, exact role authority, concurrency safety, audit/outbox/database-queue durability, pagination, stable errors, CI, tests, and cutover/rollback operations.

Canonical plan and complete task contracts: `docs/plans/laravel-backend-conversion.md`.

## Users

- Verified Google users: safe blocked first sign-in.
- Invited Coordinators/Instructors: activation on matching verified sign-in.
- Administrators: Coordinator management only.
- Coordinators: Instructor management only.
- Operators/developers: reproducible migration, bootstrap, queue, test, cutover, monitoring, and rollback procedures.

## Scope

- Laravel 13.24/PHP 8.5/PostgreSQL replacement for Express.
- Six existing API paths and exact four-field user resource preserved.
- Same-origin database cookie sessions, CSRF, GIS token verification, session rotation, `auth_version` revocation.
- Existing `app_users` adoption with reversible versioned migrations and deliberate Express-session invalidation at cutover.
- Thin controllers, Form Requests, policies, actions, resources, advisory locks, audit events, durable outbox/database queue mail, stable errors, pagination, and bootstrap/preflight commands.
- React CSRF/proxy/tooling update, comprehensive PostgreSQL CI/security tests, and setup/cutover/rollback docs.

## Non-goals

- No UI redesign.
- No persistence for prototype catalog/dashboard actions.
- No Laravel/Python integration and no algorithm change.
- No new API/data compatibility beyond the current six paths, user shape, and existing data.
- No dependency on or changes to unrelated `plan/researchnav-mvp`.

## Architecture

React calls Laravel under one origin. Laravel verifies GIS ID tokens, resolves `app_users`, and stores database-backed cookie sessions. PostgreSQL transactions and advisory locks protect identity/provisioning races; explicit policies enforce Administrator→Coordinator and Coordinator→Instructor with no admin bypass. Mutations append audit/outbox rows atomically; a database queue worker sends invitations. Expand-only migration, preflight, explicit Express-session deletion, same-origin traffic switch, monitoring, and application-first rollback control release risk.

## Acceptance Criteria

- [ ] Laravel 13.24 boots on PHP 8.5/PostgreSQL and Express is absent.
- [ ] React UI and standalone Python behavior remain unchanged.
- [ ] Six API paths, exact user shape, stable errors, and pagination pass contract tests.
- [ ] GIS, blocked/invited, exact authority, CSRF/session/`auth_version`, and race tests pass.
- [ ] Existing `app_users` survives reversible migration up/down/up; Express sessions are zero at cutover.
- [ ] Audit and outbox writes are atomic; database queue notification survives retries/restarts.
- [ ] Bootstrap/preflight/cutover/rollback commands and docs are validated.
- [ ] Full CI, security review, PostgreSQL integration, browser smoke, and algorithm regression gates pass.

## Workstreams

| Workstream | Owner | Status | Branch | Pull Request |
|---|---|---|---|---|
| T1 Platform/API foundation | Backend Builder | Pending | `feat/laravel-platform` | |
| T2 PostgreSQL adoption | Database Builder | Pending | `feat/laravel-persistence` | |
| T3 GIS auth/session | Backend Builder | Pending | `feat/laravel-auth` | |
| T4 Provisioning/bootstrap | Backend Builder | Pending | `feat/laravel-provisioning` | |
| T5 Outbox/queue/mail | Backend Builder | Pending | `feat/laravel-notifications` | |
| T6 React/Express cutover | Frontend Builder | Pending | `feat/laravel-frontend-cutover` | |
| T7 CI/security hardening | Backend Builder | Pending | `test/laravel-ci-security` | |
| T8 Integration/cutover | Integration Agent | Pending | `integration/laravel-backend-conversion` | |
| T9 Documentation | Documentation Agent | Pending | `docs/laravel-backend-conversion` | |

## Verification

- [ ] PHP formatting and static analysis
- [ ] Laravel feature/unit/contract/security tests on PostgreSQL
- [ ] Migration adoption, reversal, race, queue, and cutover tests
- [ ] React format/lint/tests/build and browser same-origin smoke
- [ ] Current Python algorithm tests
- [ ] Composer/npm audits and repository secret scan
- [ ] Code review and security review
- [ ] Full CI on exact combined SHA

## Decisions

- Adopt `app_users`; do not create a replacement users table.
- Preserve only the existing API/data compatibility surface; pagination metadata is additive.
- Use same-origin Laravel database sessions and CSRF, not bearer tokens or broad CORS.
- Use explicit policies with no generic Administrator bypass.
- Use PostgreSQL advisory locks plus constraints for races.
- Invalidate, do not translate, Express sessions at cutover.
- Use transactional audit/outbox and database queue; no inline SMTP.
- Keep React presentation and Python algorithm isolated and unchanged.

## Risks and Assumptions

- Production data drift, migration reversal, cookies/proxy configuration, GIS origin/config, queue readiness, and rollback schema compatibility are release blockers with preflight/rehearsal controls in the plan.
- SMTP delivery is at-least-once at its external boundary; duplicate-safe content and idempotent enqueue mitigate it.
- All child PRs target this plan branch and use isolated, non-overlapping ownership. The unrelated `plan/researchnav-mvp` branch remains untouched.
- Final production cutover and session invalidation require explicit release authorization.

## Tracking

- [ ] T1 merged: ___
- [ ] T2 merged: ___
- [ ] T3 merged: ___
- [ ] T4 merged: ___
- [ ] T5 merged: ___
- [ ] T6 merged: ___
- [ ] T7 merged: ___
- [ ] T8 merged: ___
- [ ] T9 merged: ___
- [ ] Final verification report: ___
- [ ] Final security review: ___
- [ ] Cutover/rollback evidence: ___

---

## Completion record template

The PR Coordinator fills this in the parent PR, not through concurrent edits to this file:

| Evidence | URL/SHA/result |
|---|---|
| Parent Plan PR | |
| Approved plan commit | |
| Child PRs | |
| Combined parent SHA | |
| CI run | |
| Integration report | |
| Code review | |
| Security review | |
| Migration/cutover rehearsal | |
| Production cutover or ready-for-approval state | |
| Residual risks | |
