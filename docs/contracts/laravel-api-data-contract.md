# ResearchNAV Laravel API and Data Contract (Frozen)

Version: 1.0.0 — frozen for implementation.
Status: Temporary artifact. The orchestrator relocates this file to the
`design/laravel-api-data-contract` worktree and keeps `main` clean. This document
is the single frozen, implementable contract for the Laravel backend conversion
described in `docs/plans/laravel-backend-conversion.md` (Plan PR #2). Where any
ambiguity exists, the plan is the parent authority and this document is the
executable freeze. No product code is produced by this artifact.

---

## 0. Document control and provenance

| Item                               | Value                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Repository                         | private `ResearchNAV` (`MilliXPlorer/researchnav`)                                                 |
| Plan PR                            | #2 (Draft) — `plan/laravel-backend-conversion` to `main`                                           |
| Plan source                        | `docs/plans/laravel-backend-conversion.md` at approved base `882f52c`                              |
| Legacy contract sources            | `D:\ResearchNav\server` (Express) and `D:\ResearchNav\src` (React)                                 |
| React↔Laravel interaction contract | `docs/design/frontend-laravel-cutover.md`                                                          |
| Target runtime                     | Laravel 13.24, PHP 8.5, PostgreSQL only                                                            |
| Frozen surface                     | The six `/api` paths, `User` shape, `app_users` data, stable errors, and additive pagination below |

Change control: every section marked **FROZEN** is an implementable assertion.
Contract changes require (1) a plan amendment on the parent Plan PR, (2) this
document updated in the same change, and (3) the `tests/Contract/**` suite (T7)
updated in lockstep. The parent Plan PR remains Draft until all gates pass.

---

## 1. Scope and preservation rules

1. Laravel is the only HTTP backend after cutover. React remains the browser
   client; the standalone Python CLI under `algorithm/` is unchanged and never
   called by Laravel.
2. The only HTTP API surface is the six paths in §3. **No seventh `/api` path**
   may be added. No bearer-token API, Socialite redirect, cross-origin SPA
   architecture, or broad CORS is introduced.
3. Persistence exists only for accounts (`app_users`), sessions, queue/cache
   infrastructure, audit, and the notification outbox. Prototype catalog
   searches, records, dashboard counters, and similar prototype-only actions
   gain **no** persistence.
4. `server/**` and `tsconfig.server.json` are deleted only by T6 after parity is
   demonstrated. T6's exact expanded frontend ownership is `package.json`,
   `package-lock.json`, `vite.config.ts`, `src/api.ts`, `src/api.test.ts`,
   `src/App.tsx`, `src/Dashboard.tsx`, `src/GoogleSignInDialog.tsx`,
   `src/RoleWorkspaces.tsx`, `src/types.ts`, `src/app.test.tsx`, and
   `src/components.test.tsx`, plus those two deletions. `algorithm/**`, every other React component,
   style, route, and responsive-behavior file, `researchnav-design.md`, and the
   plan file are read-only for implementation workstreams. This ownership
   permits only the cutover behavior in §17; it does not permit CSS, visual,
   route, or responsive changes.
5. `plan/researchnav-mvp` is unrelated: no base, dependency, or merge edge.

---

## 2. Fixed architecture invariants

1. Development: Vite proxies `/api` to Laravel at `http://localhost:8000`.
   Production: built React assets and Laravel `/api` under one HTTPS origin.
   Same-origin controls; CORS is not a substitute.
2. PostgreSQL is required in development tests, CI, staging, and production.
   SQLite is prohibited for acceptance evidence (advisory locks, constraints,
   queue behavior, and migration adoption are PostgreSQL-specific).
3. Controller = transport orchestration only; Form Request = input
   normalization/validation; Policy = authority; Action = transaction/domain
   behavior; Resource = JSON representation. Models do not absorb workflow logic.
4. No default Laravel `users` table is created. `app_users` is the authenticatable
   model with UUID IDs, no password, no remember token.
5. All `/api` responses are JSON (except the `204` logout body). Never return an
   HTML exception page, stack trace, SQL text, GIS credential, or unbounded
   validation payload from `/api`.

---

## 3. HTTP API surface (FROZEN)

### 3.0 Shared request/response rules

- Every response carries `Content-Type: application/json` (except `204`), and
  `Cache-Control: no-store`.
- Security headers (FROZEN minimum): `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`. A
  Content-Security-Policy is implementation-managed and must permit
  `https://accounts.google.com` GIS assets; it is not part of this contract.
- `GET /api/health` also initializes/refreshes the session and `XSRF-TOKEN`
  cookies for the SPA **without changing its response body**.
- All four mutations require CSRF (§8) and same-origin validation (§8). Only
  the three named mutations in §8.4 are rate-limited; logout is protected but
  deliberately not rate-limited.

### 3.1 `GET /api/health`

| Attribute   | Frozen value                                                                   |
| ----------- | ------------------------------------------------------------------------------ |
| Success     | `200` body exactly `{"status":"ok"}` (no extra keys)                           |
| Side effect | Emits/refreshes `laravel_session` and `XSRF-TOKEN` cookies usable by the SPA   |
| Protection  | Same-origin session middleware; no DB write beyond configured session behavior |
| Errors      | `500 {"error":"INTERNAL_SERVER_ERROR"}` on unexpected failure                  |

### 3.2 `POST /api/auth/google`

| Attribute  | Frozen value                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request    | `{"credential": "<GIS ID token string>"}`; `Content-Type: application/json`                                                                                                                                                     |
| Success    | `200 {"user": User}`                                                                                                                                                                                                            |
| Protection | CSRF, same-origin, rate limit 20/minute, GIS verification (§7), session ID rotation, `auth_version` capture, blocked/invited semantics (§9)                                                                                     |
| Errors     | `400 INVALID_REQUEST`, `401 GOOGLE_TOKEN_INVALID`, `401 GOOGLE_EMAIL_NOT_VERIFIED`, `403 ORIGIN_NOT_ALLOWED`, `409 GOOGLE_ACCOUNT_BINDING_CONFLICT`, `419 CSRF_TOKEN_MISMATCH`, `429 RATE_LIMITED`, `500 INTERNAL_SERVER_ERROR` |

Blocked and invited outcomes are **successful** `200` responses with the
four-field user; the React access gate (§17) decides whether the dashboard is
shown. Never log or store the credential.

### 3.3 `GET /api/auth/session`

| Attribute  | Frozen value                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success    | `200 {"user": User}` for any valid session — including `blocked`/`invited` accounts (they may read their own state)                                                                                              |
| Protection | Authenticated session + `auth_version` match (§12). No `active` requirement                                                                                                                                      |
| Errors     | `401 AUTHENTICATION_REQUIRED` (no session), `401 SESSION_USER_NOT_FOUND` (session user row missing; session destroyed), `401 SESSION_REVOKED` (version mismatch; session destroyed), `500 INTERNAL_SERVER_ERROR` |

### 3.4 `POST /api/auth/logout`

| Attribute    | Frozen value                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success      | `204` with **no body**                                                                                                                                                                                                                       |
| Protection   | CSRF, same-origin, authenticated session; deliberately not rate-limited                                                                                                                                                                      |
| Side effects | Destroy server session; expire `laravel_session`, `XSRF-TOKEN`, and the legacy `researchnav.sid` cookies (Set-Cookie with past expiry)                                                                                                       |
| Errors       | `403 ORIGIN_NOT_ALLOWED`, `419 CSRF_TOKEN_MISMATCH`, `401 AUTHENTICATION_REQUIRED`, `401 SESSION_USER_NOT_FOUND`, `401 SESSION_REVOKED`, `500 {"error":"LOGOUT_FAILED"}` if session destruction fails, `500 INTERNAL_SERVER_ERROR` otherwise |

### 3.5 `GET /api/admin/coordinators`

| Attribute  | Frozen value                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Query      | `page` (default `1`), `per_page` (default `25`, cap `100`) — §4                                                                                                                                                                                                                            |
| Success    | `200 {"users": User[], "pagination": Pagination}`                                                                                                                                                                                                                                          |
| Protection | Authenticated, `accessStatus=active`, exact `role=admin` with `is_admin=true` (equivalently `role=admin` + `active`, given the `app_users_admin_consistency` constraint). No generic admin bypass. The bounded list-query Form Request runs only after this authorization succeeds (§8.5). |
| Ordering   | `ORDER BY created_at DESC, id DESC` (deterministic newest-first with unique UUID tie-breaker)                                                                                                                                                                                              |
| Filter     | All `app_users` rows with `role='coordinator'`, any status                                                                                                                                                                                                                                 |
| Errors     | `400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`, `401 SESSION_USER_NOT_FOUND`, `401 SESSION_REVOKED`, `403 ACCOUNT_ACCESS_PENDING`, `403 ROLE_NOT_AUTHORIZED`, `500 INTERNAL_SERVER_ERROR`                                                                                            |

### 3.6 `POST /api/admin/coordinators`

| Attribute  | Frozen value                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request    | `{"email": "<normalized@example.edu>"}`                                                                                                                                                                                                                                                               |
| Success    | `201 {"user": User}`                                                                                                                                                                                                                                                                                  |
| Protection | CSRF, same-origin, rate limit 30/hour, authenticated + active + exact admin role; transactional user update/insert + audit + outbox (§16)                                                                                                                                                             |
| Errors     | `400 INVALID_REQUEST`, `403 ORIGIN_NOT_ALLOWED`, `419 CSRF_TOKEN_MISMATCH`, `401 AUTHENTICATION_REQUIRED`, `401 SESSION_USER_NOT_FOUND`, `401 SESSION_REVOKED`, `403 ACCOUNT_ACCESS_PENDING`, `403 ROLE_NOT_AUTHORIZED`, `409 ACCOUNT_ROLE_CONFLICT`, `429 RATE_LIMITED`, `500 INTERNAL_SERVER_ERROR` |

### 3.7 `GET /api/coordinator/instructors`

| Attribute  | Frozen value                                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query      | `page` (default `1`), `per_page` (default `25`, cap `100`) — §4                                                                                                                                                                                             |
| Success    | `200 {"users": User[], "pagination": Pagination}`                                                                                                                                                                                                           |
| Protection | Authenticated, `accessStatus=active`, exact `role=coordinator` with `is_admin=false`. An active Administrator **cannot** use this endpoint (`ROLE_NOT_AUTHORIZED`). The bounded list-query Form Request runs only after this authorization succeeds (§8.5). |
| Ordering   | `ORDER BY created_at DESC, id DESC`                                                                                                                                                                                                                         |
| Filter     | All `app_users` rows with `role='instructor'`, any status                                                                                                                                                                                                   |
| Errors     | `400 INVALID_REQUEST`, `401 AUTHENTICATION_REQUIRED`, `401 SESSION_USER_NOT_FOUND`, `401 SESSION_REVOKED`, `403 ACCOUNT_ACCESS_PENDING`, `403 ROLE_NOT_AUTHORIZED`, `500 INTERNAL_SERVER_ERROR`                                                             |

### 3.8 `POST /api/coordinator/instructors`

| Attribute  | Frozen value                                                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request    | `{"email": "<normalized@example.edu>"}`                                                                                                                                                                                                                                                               |
| Success    | `201 {"user": User}`                                                                                                                                                                                                                                                                                  |
| Protection | CSRF, same-origin, rate limit 60/hour, authenticated + active + exact coordinator role; transactional user update/insert + audit + outbox (§16)                                                                                                                                                       |
| Errors     | `400 INVALID_REQUEST`, `403 ORIGIN_NOT_ALLOWED`, `419 CSRF_TOKEN_MISMATCH`, `401 AUTHENTICATION_REQUIRED`, `401 SESSION_USER_NOT_FOUND`, `401 SESSION_REVOKED`, `403 ACCOUNT_ACCESS_PENDING`, `403 ROLE_NOT_AUTHORIZED`, `409 ACCOUNT_ROLE_CONFLICT`, `429 RATE_LIMITED`, `500 INTERNAL_SERVER_ERROR` |

---

## 4. Request validation and normalization (FROZEN)

| Input                  | Rules                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `credential` (google)  | Required JSON string, `min(1)`. Missing, non-string, or empty → `400 INVALID_REQUEST`. Request body limit 32 KB (parity with Express `express.json({limit:"32kb"})`)                 |
| `email` (provisioning) | Required string, valid email format, `max(254)` chars. Normalized to **trim + lowercase** before lock, lookup, or insert. Missing/invalid → `400 INVALID_REQUEST`                    |
| `page`                 | Optional integer `>= 1`. Default `1`. Non-integer or `< 1` → `400 INVALID_REQUEST`; `page > lastPage` returns an empty `users` array with unchanged `total`/`lastPage` (never `404`) |
| `per_page`             | Optional integer in `[1,100]`. Default `25`. Coerced: `<1 → 1`, `>100 → 100`. Non-integer → `400 INVALID_REQUEST`                                                                    |
| Validation `details`   | Only for `INVALID_REQUEST`; bounded — at most 10 fields, each message `<= 200` chars, total `details` payload `<= 8 KB`. Never echo tokens, credentials, cookies, or secrets         |

Normalization is applied before any lock acquisition, uniqueness lookup, or
write. PostgreSQL lowercase uniqueness (`CHECK (email = lower(email))` +
`UNIQUE`) remains the final defense; the server normalizes first so the two
cannot disagree.

---

## 5. Response envelopes and shapes (FROZEN)

### 5.1 `User` (exact four fields, no more)

```json
{
  "email": "normalized@example.edu",
  "role": "coordinator",
  "accessStatus": "active",
  "isAdmin": false
}
```

- `email`: normalized (trim + lowercase) text.
- `role`: one of the ten enum values in §9.1.
- `accessStatus`: one of `active | invited | blocked`.
- `isAdmin`: boolean. By the `app_users_admin_consistency` constraint,
  `isAdmin === (role === "admin")`.
- Do **not** expose database IDs, `google_sub`, `auth_version`, timestamps,
  audit data, or outbox data in this resource.

### 5.2 Pagination (additive)

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

- `page`: current 1-based page.
- `perPage`: page size actually applied (`1..100`).
- `total`: count of all rows matching the endpoint role filter (any status).
- `lastPage`: `max(1, ceil(total / perPage))`.
- `users` array and its four-field elements are byte-compatible with the legacy
  response; `pagination` is additive.

### 5.3 Error envelope

```json
{ "error": "STABLE_CODE" }
```

Optional `details` (bounded, §4) appears **only** for validation errors.
Stable codes and statuses are frozen in §6. React branches on `code` first,
then HTTP status (§17).

---

## 6. Stable error catalog (FROZEN)

| `error` code                      | HTTP status | Meaning / triggers                                                                             |
| --------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `INVALID_REQUEST`                 | 400         | Malformed body, invalid `email`, invalid `page`/`per_page`, body over 32 KB; bounded `details` |
| `GOOGLE_EMAIL_NOT_VERIFIED`       | 401         | Valid token but `sub` or `email` empty, or `email_verified !== true`                           |
| `GOOGLE_TOKEN_INVALID`            | 401         | Signature, audience, issuer, or time (exp/nbf) verification failure                            |
| `AUTHENTICATION_REQUIRED`         | 401         | No authenticated session                                                                       |
| `SESSION_USER_NOT_FOUND`          | 401         | Session references a user row that no longer exists; session destroyed                         |
| `SESSION_REVOKED`                 | 401         | `auth_version` mismatch (§12); session destroyed                                               |
| `GOOGLE_ACCOUNT_BINDING_CONFLICT` | 409         | Subject/email mismatch or attempted relink; no mutation, audited                               |
| `ACCOUNT_ROLE_CONFLICT`           | 409         | Provisioning target cannot be provisioned by the exact authority matrix (§9.4)                 |
| `ACCOUNT_ACCESS_PENDING`          | 403         | Non-`active` account on an active-only endpoint                                                |
| `ROLE_NOT_AUTHORIZED`             | 403         | Wrong role on a role-scoped endpoint; includes the removed admin bypass                        |
| `ORIGIN_NOT_ALLOWED`              | 403         | Same-origin `Origin`/`Referer` validation failed on a mutation                                 |
| `CSRF_TOKEN_MISMATCH`             | 419         | `X-XSRF-TOKEN` header missing or not matching the `XSRF-TOKEN` cookie                          |
| `RATE_LIMITED`                    | 429         | Named rate limit exceeded; include `Retry-After` header (seconds)                              |
| `LOGOUT_FAILED`                   | 500         | Session destruction failed during logout                                                       |
| `INTERNAL_SERVER_ERROR`           | 500         | Any unhandled failure; never leaks internals                                                   |

The first nine codes preserve Express-defined behavior where it already existed;
the remainder are the deterministic Laravel-era codes defined in the plan.
Every code is emitted as JSON `{"error":"CODE"}` only — never HTML.

---

## 7. Google Identity Services (GIS) verification (FROZEN)

1. Verify ID tokens with a **maintained Google PHP verification library**
   (e.g., `google/apiclient` `Google_Client::verifyIdToken` or an equivalent
   maintained verifier). Never hand-decode JWTs, never implement signature
   verification manually, and never store or log the credential.
2. Required claim checks after signature verification:
   - `aud` (audience) equals the configured `GOOGLE_CLIENT_ID` exactly;
   - `iss` is in `{ "accounts.google.com", "https://accounts.google.com" }`;
   - token is within its validity window (`exp` and `nbf`/`iat` honored);
   - `sub` is a non-empty string;
   - `email` is a non-empty string;
   - `email_verified === true`.
3. Failures map to stable codes: signature/audience/issuer/time → `401
GOOGLE_TOKEN_INVALID`; empty `sub`/`email` or `email_verified !== true` →
   `401 GOOGLE_EMAIL_NOT_VERIFIED`. Missing/non-string `credential` →
   `400 INVALID_REQUEST`.
4. The verified `sub` and normalized `email` are the only values consumed
   downstream. No raw token, JWT payload dump, or claim internals appear in
   logs, audit metadata, errors, or session payloads.
5. Verification is behind a mockable contract so negative-claim tests can be
   exhaustive without network calls.

---

## 8. Sessions, cookies, CSRF, origin, and rate limits (FROZEN)

### 8.1 Cookies and session

| Attribute           | Frozen value                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Session driver      | Database-backed (`sessions` table, §11.1)                                                                         |
| Session cookie name | New Laravel cookie: `laravel_session` (never reuse `researchnav.sid`)                                             |
| CSRF cookie name    | `XSRF-TOKEN` (readable, URL-encoded; not an authentication credential)                                            |
| Legacy cookie       | `researchnav.sid` is cleanup-only and must be expired on logout; it is never issued or refreshed                  |
| Cookie flags        | `HttpOnly` on `laravel_session`; `SameSite=Lax`; `Path=/`; `Secure` in production                                 |
| Lifetime            | Rolling eight-hour lifetime: each request within the window renews it; idle expiry at 8 h after the last activity |
| Session ID rotation | After successful Google authentication, rotate the session ID (invalidate the old ID)                             |
| Session payload     | Minimum identity data only: `user_id` (UUID) and `auth_version` (int). No credentials, no raw GIS token           |
| Auth loading        | Authenticated middleware resolves the user by `user_id` each request and compares `auth_version` (§12)            |

Production startup/config validation must **fail closed** on: non-HTTPS
`APP_URL`, unsafe cookie settings, placeholder/`local-development-only`
`APP_KEY`/secrets, and missing required database/Google/mail settings.

### 8.2 CSRF

- `GET /api/health` issues/refreshes the `XSRF-TOKEN` cookie.
- Every unsafe request (`POST`, `PUT`, `PATCH`, `DELETE`) under `/api` must
  send `X-XSRF-TOKEN` equal to the URL-decoded `XSRF-TOKEN` cookie value.
- Missing/mismatch → `419 CSRF_TOKEN_MISMATCH`. Safe reads need no header.
- The readable XSRF cookie is never treated as an identity credential; the
  session cookie is the only session mechanism.

### 8.3 Same-origin validation (mutations)

- If the `Origin` header is present, its origin (scheme://host[:port]) must be
  in the configured allowed-origin set (`APP_URL` + `APP_ORIGINS`, normalized
  to origins). Otherwise reject.
- If `Origin` is absent, parse the `Referer` as a URL and compare its complete
  origin (scheme, host, and effective port) against the allowed origins. A host
  match with a different scheme or port is not sufficient.
- Any mismatch or malformed value → `403 ORIGIN_NOT_ALLOWED`.

### 8.4 Named rate limits

| Endpoint                            | Limit       | Key                                                 |
| ----------------------------------- | ----------- | --------------------------------------------------- |
| `POST /api/auth/google`             | 20 / minute | remote IP (authenticated key unavailable pre-login) |
| `POST /api/admin/coordinators`      | 30 / hour   | authenticated user id                               |
| `POST /api/coordinator/instructors` | 60 / hour   | authenticated user id                               |

Exceeded → `429 {"error":"RATE_LIMITED"}` with `Retry-After`. Rate limiter keys
respect the configured trusted-proxy hops. These are the only rate-limited
mutations: logout is CSRF-, origin-, and session-protected but has no limiter.

### 8.5 Ordered middleware stacks and error precedence

`ApiJsonExceptionRenderer` is the outer wrapper for every stack and converts
only unexpected failures to `500 INTERNAL_SERVER_ERROR` (or `LOGOUT_FAILED` at
the logout action boundary). `ApiResponseHeaders` applies the JSON/cache and
security response headers after a response is produced. Middleware below is
listed in execution order; the first terminal result wins.

| Route                              | Ordered stack after the common wrapper                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`                  | `StartSession` → `IssueXsrfCookie` → health action                                                                                                                                                                                                                                             |
| `GET /api/auth/session`            | `StartSession` → `LoadSessionUserAndVerifyAuthVersion` → session action                                                                                                                                                                                                                        |
| `POST /api/auth/google`            | `EnforceApiBodyLimitAndJson` → `StartSession` → `ValidateSameOrigin` → `VerifyCsrfToken` → `ThrottleGoogleByTrustedRemoteIp` → Google Form Request → GIS verification/action                                                                                                                   |
| `POST /api/auth/logout`            | `StartSession` → `ValidateSameOrigin` → `VerifyCsrfToken` → `LoadSessionUserAndVerifyAuthVersion` → logout action                                                                                                                                                                              |
| Either provisioning `POST`         | `EnforceApiBodyLimitAndJson` → `StartSession` → `ValidateSameOrigin` → `VerifyCsrfToken` → `LoadSessionUserAndVerifyAuthVersion` → `RequireActiveAccount` → `RequireExactProvisioningRole` → `ThrottleProvisioningByAuthenticatedUserId` → provisioning Form Request → provisioning action     |
| `GET /api/admin/coordinators`      | `AssignRequestId` → `ApiResponseHeaders` (JSON, `no-store`, security headers) → `StartSession` → `LoadSessionUserAndVerifyAuthVersion` → `RequireActiveAccount` → `RequireExactAdminCoordinatorListPolicy` → bounded list-query Form Request (`page`/`per_page`) → coordinators controller     |
| `GET /api/coordinator/instructors` | `AssignRequestId` → `ApiResponseHeaders` (JSON, `no-store`, security headers) → `StartSession` → `LoadSessionUserAndVerifyAuthVersion` → `RequireActiveAccount` → `RequireExactCoordinatorInstructorListPolicy` → bounded list-query Form Request (`page`/`per_page`) → instructors controller |

Thus, for a request that reaches multiple failing checks, body/JSON failure
precedes all later checks; otherwise origin precedes CSRF, CSRF precedes session
authentication, authentication/version precedes active-role authorization, and
authorization precedes the provisioning limiter and Form Request. Google is
limited by trusted remote IP because no authenticated identity exists yet.
Provisioning reaches its limiter only after authenticated user loading, so its
key is always the authenticated user UUID, never an IP fallback. Session-user
loading returns, in order, `AUTHENTICATION_REQUIRED` for no session,
`SESSION_USER_NOT_FOUND` for a missing row, and `SESSION_REVOKED` for a version
mismatch. Logout intentionally has no throttle stage.

For each protected list `GET`, request ID and JSON/`no-store` response handling
are established before session processing. The session stage deterministically
returns the applicable `401` first (`AUTHENTICATION_REQUIRED`, then
`SESSION_USER_NOT_FOUND`, then `SESSION_REVOKED`); only a valid session reaches
authorization. `RequireActiveAccount` then returns `403 ACCOUNT_ACCESS_PENDING`
before the exact list policy can return `403 ROLE_NOT_AUTHORIZED`. Only an
authorized caller reaches the bounded list-query Form Request; invalid `page` or
`per_page` then returns `400 INVALID_REQUEST`. Thus unauthenticated, revoked, or
forbidden outcomes take precedence over pagination validation, `401` always
precedes either `403`, and active status always precedes role policy. As safe
reads, these two `GET` routes have no CSRF, origin-validation, or rate-limit
stage.

---

## 9. Role/status enums and identity state machine (FROZEN)

### 9.1 Enums

`role` (10 values, exact): `admin`, `researcher`, `adviser`, `instructor`,
`panel`, `statistician`, `coordinator`, `librarian`, `research-office`,
`academics`.

`access_status` (3 values, exact): `active`, `invited`, `blocked`.

`is_admin`: boolean; `app_users_admin_consistency` guarantees
`(role = 'admin') === is_admin`.

### 9.2 First verified sign-in without an invitation → blocked Researcher

No row matches the normalized email and no row matches the Google subject:
insert `app_users` row with UUID id, `role='researcher'`,
`access_status='blocked'`, `is_admin=false`, `google_sub=<verified sub>`,
`confirmed_at=NULL`, `last_login_at=NOW()`, `auth_version=0`. Returns `200`
with the four-field user; React keeps the user out of `/app`. Audit:
`account.blocked_created`.

### 9.3 Invited activation and binding

Lookup order is subject-first then email, both under advisory locks (§16) and
`FOR UPDATE` row locks.

| Situation                                                              | Frozen behavior                                                                                                                     |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Row matched by subject, `email` differs                                | **Reject** `409 GOOGLE_ACCOUNT_BINDING_CONFLICT`; no mutation; audit `auth.binding_rejected` (reason `subject_email_mismatch`)      |
| Row matched by email, `google_sub` non-null and `!= sub`               | **Reject** `409 GOOGLE_ACCOUNT_BINDING_CONFLICT`; no mutation; audit (reason `subject_already_bound`)                               |
| Row matched by email, `google_sub` NULL (`invited` or bootstrap admin) | Bind `google_sub=sub`; if status `invited` → `active`; audit `account.invited_activated` and/or `auth.login_succeeded`              |
| Row matched, status `invited`, subject matches                         | Set `access_status='active'`, `confirmed_at=COALESCE(confirmed_at,NOW())`, `last_login_at=NOW()`; audit `account.invited_activated` |
| Row matched, already `active`, subject matches                         | Update `last_login_at` only; audit `auth.login_succeeded`                                                                           |
| Existing `blocked` with matching subject                               | Stays `blocked`; update `last_login_at`; audit `auth.login_succeeded`                                                               |

`auth_version` increments in the same transaction iff role, access_status,
is_admin, or google_sub actually changed (§12). The React gate decides
dashboard access; the server never silently repairs a binding mismatch.

### 9.4 Exact provisioning authority and state transitions

Endpoint authority is exact policy, evaluated in order:
authenticated → `accessStatus=active` → exact role. There is no generic
Administrator bypass.

- `POST /api/admin/coordinators` requires `role='admin'` and `is_admin=true`
  (i.e., active admin). It may only provision/list **Coordinators**.
- `POST /api/coordinator/instructors` requires `role='coordinator'` and
  `is_admin=false`. It may only provision/list **Instructors**.

`canProvisionExistingRole(existingRole, accessStatus, provisionedRole, isAdmin)`
(Legacy policy, frozen verbatim semantics): deny when `isAdmin ||
accessStatus === "active"`; otherwise allow only
`provisionedRole === "coordinator" ? existingRole ∈ {researcher, coordinator}
: existingRole ∈ {researcher, instructor}`.

**Admin → Coordinator provisioning** (one transaction: §16):

| Existing row (role, status)                                                                        | Frozen result                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none                                                                                               | INSERT `role=coordinator`, `access_status='invited'`, `is_admin=false`, `invited_by=<admin id>`, `invitation_sent_at=NOW()`                                                            |
| researcher, blocked                                                                                | UPDATE `role=coordinator`; `access_status = google_sub IS NULL ? 'invited' : 'active'`; `invited_by`, `invitation_sent_at` set; `confirmed_at` coalesced when active; `auth_version+1` |
| researcher, invited                                                                                | Same as above                                                                                                                                                                          |
| coordinator, blocked                                                                               | Same as above (self-role promotion from blocked)                                                                                                                                       |
| coordinator, invited                                                                               | **No-op**: return the existing user; do not change any user or invitation timestamp, increment `auth_version`, append audit, insert outbox, or send/enqueue email                      |
| coordinator, active                                                                                | **Reject** `409 ACCOUNT_ROLE_CONFLICT`                                                                                                                                                 |
| researcher, active                                                                                 | **Reject** `409 ACCOUNT_ROLE_CONFLICT`                                                                                                                                                 |
| admin (any status)                                                                                 | **Reject**                                                                                                                                                                             |
| instructor / adviser / panel / statistician / librarian / research-office / academics (any status) | **Reject**                                                                                                                                                                             |

**Coordinator → Instructor provisioning:**

| Existing row (role, status)                        | Frozen result                                                                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| none                                               | INSERT `role=instructor`, `access_status='invited'`, `is_admin=false`, `invited_by=<coordinator id>`, `invitation_sent_at=NOW()`                                  |
| researcher, blocked / invited                      | UPDATE to `instructor`; `invited` or `active` per `google_sub`; `auth_version+1`                                                                                  |
| instructor, blocked                                | Same as above (re-invite from blocked)                                                                                                                            |
| instructor, invited                                | **No-op**: return the existing user; do not change any user or invitation timestamp, increment `auth_version`, append audit, insert outbox, or send/enqueue email |
| instructor, active                                 | **Reject** `409 ACCOUNT_ROLE_CONFLICT`                                                                                                                            |
| researcher, active                                 | **Reject**                                                                                                                                                        |
| coordinator, admin, or any other role (any status) | **Reject**                                                                                                                                                        |

Denials are `409 ACCOUNT_ROLE_CONFLICT`, audited (`provisioning.<role>_conflict`)
with bounded existing/target context, and mutate nothing.

The two same-target-role `invited` cases above are successful `201` idempotent
no-ops, not re-invitations. They produce no account write (including
`updated_at` or `invitation_sent_at`), audit event, outbox row, queue job, or
email. Every other successful table transition is state-changing and produces
the transactionally coupled audit/outbox effects in §16.

---

## 10. `app_users` adoption, preflight, and reversible migrations (FROZEN)

### 10.1 Legacy `app_users` schema (adopted as-is)

```sql
CREATE TABLE app_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  google_sub TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN (
    'admin','researcher','adviser','instructor','panel',
    'statistician','coordinator','librarian','research-office','academics')),
  access_status TEXT NOT NULL DEFAULT 'blocked'
    CHECK (access_status IN ('active','invited','blocked')),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  invited_by UUID REFERENCES app_users(id),
  invitation_sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_users_admin_consistency CHECK ((role = 'admin') = is_admin)
);
CREATE INDEX app_users_role_idx ON app_users (role);
CREATE INDEX app_users_access_status_idx ON app_users (access_status);
```

Legacy `user_sessions` (Express, deliberately invalidated at cutover — §18):

```sql
CREATE TABLE user_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
```

No normal migration drops `app_users` or `user_sessions`. No replacement
`users` table is created.

### 10.2 Legacy pre-migration safety preflight (`researchnav:cutover-preflight --phase=legacy`, T8)

Run `php artisan researchnav:cutover-preflight --phase=legacy` while Express
still owns traffic and **before** any Laravel conversion migration. In the
disposable T8 rehearsal, the corresponding plan command is `php artisan
researchnav:cutover-preflight --phase=legacy --env=testing`. Stop on any
table/column/constraint drift from §10.1; duplicate normalized emails; invalid
role/status/admin combinations (constraint violations or `is_admin` inconsistent
with `role`); orphaned `invited_by` IDs; missing PostgreSQL
extensions/permissions required by advisory locks and constraints; or an
unreachable database. This phase validates only legacy structures and data: it
must not require `auth_version`, `cache`, `cache_locks`, `sessions`, queue,
audit, or outbox structures. It never coerces production data.

### 10.3 Post-migration readiness (`researchnav:cutover-preflight --phase=readiness`, T8)

Run `php artisan researchnav:cutover-preflight --phase=readiness` after the
exact forward migration batch and before Laravel traffic is enabled. In the
disposable T8 rehearsal, the corresponding plan command is `php artisan
researchnav:cutover-preflight --phase=readiness --env=testing`. Stop on an
unapplied/unknown conversion migration; missing `auth_version`; missing or
drifted structures in §§11.1–11.5 (including the database-cache `cache` and
`cache_locks` tables); an unavailable database cache, database session, or
database queue configuration; missing Google/mail/HTTPS configuration; unsafe
cookie settings; placeholder/`local-development-only` secrets; or an
unreachable database. Readiness is observational and never coerces production
data.

### 10.4 Conversion migrations (ordered, fully reversible)

1. `add_auth_version_to_app_users` — `ALTER TABLE app_users ADD COLUMN
auth_version INTEGER NOT NULL DEFAULT 0`. `down()` drops the column.
2. `create_cache_table` — the Laravel database-cache migration generated by
   `php artisan make:cache-table`; creates `cache` + `cache_locks` (§11.2).
   `down()` drops both.
3. `create_sessions_table` — §11.1. `down()` drops `sessions`.
4. `create_jobs_tables` — `jobs`, `job_batches`, `failed_jobs` (§11.3).
   `down()` drops all three.
5. `create_audit_events_table` — §11.4. `down()` drops table, indexes, and the
   append-only trigger/function.
6. `create_notification_outbox_table` — §11.5. `down()` drops table and
   indexes.

Every migration has complete `up()`/`down()`; rollback removes only conversion
structures and never alters preserved `app_users` fields. Destructive commands
(`migrate:fresh`, rollback) run only with `APP_ENV=testing` and a
test-only-guard database name.

### 10.5 Adoption test requirement

A canonical legacy-schema fixture is retained under T2's owned database-test
path (SHA-256 compared to the current `server/migrations/001_auth.sql` before
T6 deletes Express). The test loads the fixture, inserts representative rows
for every status and relevant role, runs Laravel migrations, verifies unchanged
IDs/user fields and the new defaults, rolls the conversion migrations down,
verifies legacy rows remain readable, and migrates up again (up/down/up).

---

## 11. New PostgreSQL schemas (FROZEN)

### 11.1 `sessions` (Laravel database session driver)

```sql
CREATE TABLE sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  payload TEXT NOT NULL,
  last_activity INTEGER NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_last_activity_idx ON sessions (last_activity);
```

`user_id` is nullable and indexed (no FK, matching Laravel default semantics;
users are never deleted by the application).

### 11.2 `cache` and `cache_locks` (database cache driver)

```sql
CREATE TABLE cache (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  expiration INTEGER NOT NULL
);
CREATE TABLE cache_locks (
  key VARCHAR(255) PRIMARY KEY,
  owner VARCHAR(255) NOT NULL,
  expiration INTEGER NOT NULL
);
```

### 11.3 Queue tables (`jobs`, `job_batches`, `failed_jobs`)

```sql
CREATE TABLE jobs (
  id BIGSERIAL PRIMARY KEY,
  queue VARCHAR(255) NOT NULL,
  payload TEXT NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  reserved_at INTEGER NULL,
  available_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX jobs_queue_idx ON jobs (queue);

CREATE TABLE job_batches (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  total_jobs INTEGER NOT NULL,
  pending_jobs INTEGER NOT NULL,
  failed_jobs INTEGER NOT NULL,
  failed_job_ids TEXT NOT NULL,
  options TEXT NULL,
  cancelled_at INTEGER NULL,
  created_at INTEGER NOT NULL,
  finished_at INTEGER NULL
);

CREATE TABLE failed_jobs (
  id BIGSERIAL PRIMARY KEY,
  uuid VARCHAR(255) NOT NULL UNIQUE,
  connection TEXT NOT NULL,
  queue TEXT NOT NULL,
  payload TEXT NOT NULL,
  exception TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 11.4 `audit_events` (append-only)

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id UUID NULL REFERENCES app_users(id) ON DELETE SET NULL,
  target_user_id UUID NULL REFERENCES app_users(id) ON DELETE SET NULL,
  request_id VARCHAR(64) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_events_metadata_bounded
    CHECK (octet_length(metadata::text) <= 8192)
);
CREATE INDEX audit_events_occurred_at_idx ON audit_events (occurred_at DESC);
CREATE INDEX audit_events_type_time_idx ON audit_events (event_type, occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON audit_events (actor_user_id);
CREATE INDEX audit_events_target_idx ON audit_events (target_user_id);
```

Append-only guard: a `BEFORE UPDATE OR DELETE` trigger raises an exception, and
the application DB role is granted no `UPDATE`/`DELETE` privilege on the table.
Metadata is bounded and allowlisted (§13); it excludes tokens, cookies, mail
credentials, secrets, and full exception traces. `request_id` carries the
request/correlation identifier (max 64 chars).

### 11.5 `notification_outbox`

```sql
CREATE TABLE notification_outbox (
  id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  type VARCHAR(50) NOT NULL
    CHECK (type IN ('coordinator_invitation','instructor_invitation')),
  recipient_email TEXT NOT NULL CHECK (recipient_email = lower(recipient_email)),
  role_label VARCHAR(100) NOT NULL,
  already_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','dispatched','delivered','failed')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  dispatched_at TIMESTAMPTZ NULL,
  delivered_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_outbox_max_attempts CHECK (attempts BETWEEN 0 AND 5)
);
CREATE INDEX notification_outbox_claim_idx
  ON notification_outbox (status, created_at) WHERE status = 'pending';
CREATE INDEX notification_outbox_created_idx ON notification_outbox (created_at);
```

---

## 12. `auth_version` session revocation (FROZEN)

1. `app_users.auth_version INTEGER NOT NULL DEFAULT 0`.
2. Captured into the session at login; compared against the current row on
   **every** authenticated request.
3. Incremented in the same transaction as any change to `role`,
   `access_status`, `is_admin`, or `google_sub` (binding/activation,
   provisioning, bootstrap authority change). Purely informational updates
   (`last_login_at`) do not increment.
4. Mismatch on any authenticated request → destroy the session, expire the
   cookies, audit `session.revoked`, and return `401 {"error":"SESSION_REVOKED"}`.
5. Consequences are user-visible and deliberate: a provisioning or bootstrap
   change signs the affected user out once; they re-authenticate and receive
   the updated state.

---

## 13. Audit event catalog (FROZEN, minimum set)

| `event_type`                        | actor       | target   | metadata keys (allowlist)                                                                    |
| ----------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------------- |
| `account.blocked_created`           | —           | new user | `{ "role": "researcher" }`                                                                   |
| `account.invited_activated`         | user        | self     | `{ "previous_status": "invited" }`                                                           |
| `auth.login_succeeded`              | user        | self     | `{}`                                                                                         |
| `auth.binding_rejected`             | user        | target   | `{ "reason": "subject_email_mismatch" \| "subject_already_bound" }`                          |
| `session.revoked`                   | user        | self     | `{ "reason": "auth_version_mismatch" }`                                                      |
| `provisioning.coordinator_created`  | admin       | target   | `{ "previous_status": "none"\|…, "new_status": "invited"\|"active", "role": "coordinator" }` |
| `provisioning.instructor_created`   | coordinator | target   | same shape with `"role": "instructor"`                                                       |
| `provisioning.coordinator_conflict` | admin       | target   | `{ "existing_role": …, "existing_status": …, "attempted_role": "coordinator" }`              |
| `provisioning.instructor_conflict`  | coordinator | target   | same shape with `attempted_role: "instructor"`                                               |
| `admin.bootstrap`                   | —           | target   | `{ "changed": true\|false }`                                                                 |
| `notification.terminal_failure`     | —           | —        | `{ "outbox_id": <uuid>, "attempts": <n> }`                                                   |
| `session.express_invalidated`       | —           | —        | `{ "deleted_count": <n> }`                                                                   |

Metadata keys are allowlisted; anything outside the allowlist is rejected or
omitted. All values are bounded, non-secret, and queryable by operators.

---

## 14. Outbox and database-queue delivery contract (FROZEN)

### 14.1 States and transitions

`pending → dispatched → delivered`; `pending → dispatched → failed` (terminal).

- `pending`: created atomically with the account mutation (§16); idempotency
  key unique per row.
- `dispatched`: claimed by a dispatcher and a `jobs` row created in the same
  transaction.
- `delivered`: SMTP send acknowledged; `delivered_at` set.
- `failed`: terminal after bounded attempts (max **5**); `failed_at` set;
  `notification.terminal_failure` audited; `last_error` carries a bounded,
  non-secret message.

### 14.2 Dispatch

- Command/schedule runs the dispatcher (e.g., `researchnav:dispatch-notification-outbox`)
  at most every minute.
- Claims a bounded batch (default 50): `SELECT … FROM notification_outbox WHERE
status = 'pending' ORDER BY created_at LIMIT :batch FOR UPDATE SKIP LOCKED`.
- For each claimed row, in **one** PostgreSQL transaction: insert the database
  queue job `SendNotificationOutbox(<outbox UUID>)` (referencing only
  `notification_outbox.id`, never copying secrets) and `UPDATE … SET
status='dispatched', dispatched_at=NOW()`.
- `SendNotificationOutbox` implements Laravel `ShouldQueue` and
  `ShouldBeUnique`; its `uniqueId(): string` returns
  `'notification-outbox:' . $this->outboxId`, and `uniqueVia()` uses the
  configured `database` cache store (`cache_locks`, §11.2). Its uniqueness lock
  lasts at least one hour, exceeding the bounded retry/backoff window.
- The transaction-scoped `FOR UPDATE SKIP LOCKED` claim is the database atomic
  enqueue guard; the concrete job uniqueness key is a second guard keyed by the
  same outbox UUID. Two concurrent dispatchers never enqueue the same row.

### 14.3 Delivery, retry, backoff

- A worker job reads its outbox row and performs SMTP delivery **outside** any
  account transaction and outside HTTP request handling.
- Failure: increment `attempts`; reschedule with bounded exponential backoff
  (base 30 s × 2^(attempt-1), optional jitter) up to 5 attempts, then mark
  `failed` + audit.
- Invitation wording is safe if received twice (SMTP is at-least-once at the
  final network boundary; this residual post-send/pre-ack risk is documented,
  not eliminated).
- Provisioning succeeds durably when workers are stopped; queued mail is
  recoverable after worker/process restart.

### 14.4 Idempotency

- For a state-changing provision only, `idempotency_key` = `'provisioning:' ||
<target user id> || ':' || <target role> || ':' || <auth_version after the
change>`; the UNIQUE constraint prevents duplicate rows.
- Atomic `pending→dispatched` claim prevents duplicate enqueue; job identity
  is `notification-outbox:<outbox UUID>`.
- Reprovisioning an unchanged same-role invited account is a no-op: it creates
  neither an idempotency key nor an outbox row, audit event, queue job, or email.

---

## 15. Administrator bootstrap command (FROZEN)

Command: `php artisan researchnav:bootstrap-admin --email=<email> [--confirm]`.

1. Email required via option or `BOOTSTRAP_ADMIN_EMAIL`; validated format,
   normalized trim + lowercase; invalid → command fails without side effects.
2. Acquire the email advisory lock (§16); upsert (legacy `ON CONFLICT (email)
DO UPDATE` semantics): `role='admin'`, `access_status='active'`,
   `is_admin=TRUE`, `confirmed_at=COALESCE(app_users.confirmed_at, NOW())`,
   `updated_at=NOW()`; preserve `id`, `created_at`, `google_sub`,
   `auth_version` unless authority changes.
3. If the row already has a bound `google_sub`, it is preserved and immutable;
   only that subject can later sign in.
4. Audit `admin.bootstrap` with `changed: true|false`; when authority actually
   changed, increment `auth_version` in the same transaction.
5. Production requires an explicit confirmation flag; with confirmation
   supplied the command is non-interactive and automation-friendly. Idempotent
   and concurrency-safe (repeat runs are no-ops or safe re-upserts).

---

## 16. Transactions, advisory locks, and concurrency (FROZEN)

### 16.1 Lock keys and order

Deterministic 64-bit derivation from a namespaced string, e.g.
`('x' || substr(md5('<namespace>:<value>'), 1, 16))::bit(64)::bigint`, where
namespaces are `researchnav:identity:email`,
`researchnav:identity:subject`, `researchnav:provision:email`,
`researchnav:bootstrap:email`. Derivation is documented and covered by
concurrent PostgreSQL tests. Lock order is always fixed to avoid deadlock:

- Identity resolution (`POST /api/auth/google`): acquire email lock, then
  subject lock (transaction-scoped advisory locks).
- Provisioning: email lock only.
- Bootstrap: email lock only.

Unique constraints remain the final collision defense.

### 16.2 Transaction boundaries

| Operation                                                         | Transaction contents                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/google`                                           | Locks → subject/email lookup (`FOR UPDATE`) → insert blocked user OR bind/activate → `last_login_at` → audit row(s) → rotate session after commit |
| State-changing `POST /api/admin/coordinators` / `.../instructors` | Locks → policy check → user update/insert (with `auth_version+1` when authority/status changes) → audit row → one outbox row → COMMIT atomically  |
| Same-role invited provisioning `POST`                             | Locks → policy check → detect unchanged invited target → return existing user; no write, audit, outbox, queue job, or email                       |
| Bootstrap                                                         | Locks → upsert → audit → COMMIT                                                                                                                   |
| Outbox dispatch                                                   | Claim (`FOR UPDATE SKIP LOCKED`) + `jobs` insert + dispatched mark in one transaction                                                             |
| Notification delivery                                             | SMTP **outside** transactions; outbox `attempts`/status update in its own short transaction                                                       |

### 16.3 Guarantees

- A state-changing account mutation, audit event, and outbox insertion commit
  or roll back together; a failed audit/outbox write rolls back the user change.
- Concurrent first sign-ins for the same email/subject produce one user and one
  binding; concurrent state-changing provisioning produces one account row, one
  audit row, and one outbox row. Concurrent retries against an unchanged
  same-role invited account produce no writes or notification effects;
  concurrent dispatchers enqueue once.
- A notification is never sent inline from an HTTP request.
- The same-target-role `invited` `201` cases in §9.4 are the sole successful
  provisioning exception to a state-changing-success guarantee: they return the
  existing user but make no account/timestamp/auth-version/audit/outbox/queue or
  email change. Every other successful provisioning result is state-changing
  and has the coupled effects above.
- All concurrency claims are proven by real multi-connection PostgreSQL tests
  (`ConcurrentGoogleSignInTest`, `ProvisioningConcurrencyTest`,
  `AdvisoryLockConcurrencyTest`, `OutboxDispatcherConcurrencyTest`).

---

## 17. Frontend compatibility contract (FROZEN for T6)

Source of truth: `docs/design/frontend-laravel-cutover.md`. Frozen essentials:

1. Browser requests the same relative, same-origin paths with
   `credentials: "include"`. Vite proxies `/api` to Laravel at
   `http://localhost:8000`; production serves React + Laravel under one HTTPS
   origin.
2. Bootstrap sequence: `GET /api/health` (with cookies) then
   `GET /api/auth/session` (with cookies); `Loading ResearchNAV...` persists
   until resolved.
3. CSRF: URL-decode `XSRF-TOKEN` from `document.cookie`; send
   `X-XSRF-TOKEN` on `POST`/`PUT`/`PATCH`/`DELETE`; on `419`/
   `CSRF_TOKEN_MISMATCH`, reacquire via health and replay the unsafe request
   exactly **once** (never loop). Keep JSON content type; never put XSRF in
   URL, body, logs, toast, or error.
4. Errors: every non-2xx becomes an `ApiError` preserving HTTP `status`, code
   (`error`), bounded `details`, and safe retry context. React branches on code
   first, then status (see the design behavior matrix: session-invalid `401`
   clears local session; `419` retries once; `409` keeps dialog open with safe
   guidance; `429` has no auto-retry; and ≥500 is retryable unavailable, never
   an anonymous fallback). Logout uses the more specific behavior in item 6.
5. Authenticated pending/blocked (`invited`/`blocked`) users may be at `/app`.
   There, `Dashboard` renders the existing `AccessBlocker` and never renders a
   role workspace; it does not redirect them to a new public blocker route.
   Only a `201` provisioning response changes the visible list; pagination is
   progressive with previous/next controls hidden when `lastPage <= 1`.
6. Logout remains pending until a `204`; on success clear local state and
   navigate to `/`. A logout `401` with `AUTHENTICATION_REQUIRED`,
   `SESSION_USER_NOT_FOUND`, or `SESSION_REVOKED` means the server session is
   already invalid: clear local session state, return to the public fallback,
   and announce a re-login notice. This takes precedence over generic failure
   handling. For a network failure, ≥500, or `419` after its one CSRF
   refresh/replay, retain the dashboard and local session, restore the logout
   control, and show a retryable “We could not sign you out. Please try again.”
   message.
7. T6 may change only the exact expanded frontend paths listed in §1:
   `package.json`, `package-lock.json`, `vite.config.ts`, `src/api.ts`,
   `src/api.test.ts`, `src/App.tsx`, `src/Dashboard.tsx`,
   `src/GoogleSignInDialog.tsx`, `src/RoleWorkspaces.tsx`, `src/types.ts`,
   `src/app.test.tsx`, and `src/components.test.tsx`; it deletes only
   `server/**` and `tsconfig.server.json`.
   No CSS, visual, route, responsive, other UI-component, or `algorithm/**`
   change is authorized. The current React tests and build must pass with the
   preserved behavior.

---

## 18. Session cutover and rollback data guarantees (FROZEN)

1. Release sequence: backup → legacy pre-migration safety preflight (§10.2) →
   forward migrations while Express remains available → post-migration readiness
   (§10.3) → deploy Laravel web/worker/scheduler without switching traffic →
   health/migration/queue/GIS/read-only smoke checks.
2. Cutover: pause writes briefly → run the confirmation-gated Express-session
   invalidation (`researchnav:invalidate-express-sessions`): counts and deletes
   all `user_sessions` rows, records `session.express_invalidated` with the
   count, verifies **zero** rows remain, then switch `/api` traffic to Laravel
   under the same origin. Traffic does not switch until the count is zero.
3. Rollback: switch traffic to the prior Express artifact; roll back **only**
   conversion migrations proven safe for the deployed database revision; never
   restore invalidated Express session rows — all users re-authenticate after
   cutover **and** after rollback.
4. If Laravel has created data an older schema cannot represent (audit/outbox/
   queue rows, sessions), keep the expanded tables/columns and perform
   application-only rollback until a reviewed data-forward fix is available.
   Never improvise destructive schema rollback; restore from backup only under
   a reviewed incident procedure.
5. Data guarantees: existing `app_users` rows survive migration up/down/up with
   IDs and existing values byte-for-byte; rollback removes only conversion
   structures; audit history is never deleted by normal operations; the
   `notification_outbox`/`jobs` tables may retain journaled data after
   application rollback by design.

---

## 19. Contract test matrix (FROZEN; implemented under `tests/Contract/**` in T7)

| ID  | Area          | Scenario                                                                                        | Frozen expectation                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Health        | `GET /api/health`                                                                               | `200 {"status":"ok"}` exact; session + XSRF cookies emitted; no DB write beyond session behavior                                                                                                                                                                                                                                                                                                                                                                            |
| C02 | Surface       | Route inventory                                                                                 | Exactly the six paths in §3; no seventh `/api` path                                                                                                                                                                                                                                                                                                                                                                                                                         |
| C03 | Google        | Valid token, new email                                                                          | `200` user `{researcher, blocked, false}`; `account.blocked_created` audited; no duplicate on concurrent retry                                                                                                                                                                                                                                                                                                                                                              |
| C04 | Google        | Valid token, invited email                                                                      | `200` user `active`; subject bound; `account.invited_activated` audited; `auth_version` incremented                                                                                                                                                                                                                                                                                                                                                                         |
| C05 | Google        | Bad signature/audience/issuer/expiry                                                            | `401 GOOGLE_TOKEN_INVALID`; nothing logged/audited with the credential                                                                                                                                                                                                                                                                                                                                                                                                      |
| C06 | Google        | `email_verified` false / empty sub / empty email                                                | `401 GOOGLE_EMAIL_NOT_VERIFIED`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| C07 | Google        | Binding conflict (subject/email mismatch; subject already bound)                                | `409 GOOGLE_ACCOUNT_BINDING_CONFLICT`; no mutation of either account; audited                                                                                                                                                                                                                                                                                                                                                                                               |
| C08 | Google        | Rate limit 20/min                                                                               | `429 RATE_LIMITED` with `Retry-After`                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C09 | Session       | `/auth/session` with valid, blocked, and invited sessions                                       | `200` four-field user in all three                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C10 | Session       | No session / user row missing / stale `auth_version`                                            | `401 AUTHENTICATION_REQUIRED` / `SESSION_USER_NOT_FOUND` / `SESSION_REVOKED`; revoked destroys session                                                                                                                                                                                                                                                                                                                                                                      |
| C11 | Session       | Login rotates session ID; logout invalidates                                                    | New `laravel_session` ID after google; logout → `204` no body; session, XSRF, and legacy `researchnav.sid` cookies expired                                                                                                                                                                                                                                                                                                                                                  |
| C12 | CSRF          | Unsafe request without/with wrong header and ordered stack failures                             | `419 CSRF_TOKEN_MISMATCH`; correct header succeeds; health refreshes token; §8.5 precedence is deterministic                                                                                                                                                                                                                                                                                                                                                                |
| C13 | Origin        | Mutation with disallowed/missing `Origin` (and bad `Referer` fallback)                          | `403 ORIGIN_NOT_ALLOWED`; Referer must match allowed scheme, host, and port                                                                                                                                                                                                                                                                                                                                                                                                 |
| C14 | Authority     | Authority matrix (exact)                                                                        | Active admin manages coordinators only; active coordinator manages instructors only; admin on instructor endpoint → `403 ROLE_NOT_AUTHORIZED`; inactive accounts → `403 ACCOUNT_ACCESS_PENDING`; no bypass                                                                                                                                                                                                                                                                  |
| C15 | Provisioning  | Transition matrix (§9.4)                                                                        | Each existing-row case produces exactly the frozen result; same-role invited retries are `201` no-ops with no timestamp/auth-version/audit/outbox/job/email effect; conflicts → `409 ACCOUNT_ROLE_CONFLICT` with no mutation                                                                                                                                                                                                                                                |
| C16 | Provisioning  | Normalization + validation                                                                      | Trim+lowercase applied; invalid email → `400 INVALID_REQUEST` with bounded `details`; 32 KB body cap                                                                                                                                                                                                                                                                                                                                                                        |
| C17 | Provisioning  | Rate limits 30/h admin, 60/h coordinator; logout                                                | Provisioning `429 RATE_LIMITED` with `Retry-After` keyed by authenticated user; logout remains protected and is not rate-limited                                                                                                                                                                                                                                                                                                                                            |
| C18 | Pagination    | Defaults, bounds, validation, ordering, and authorization precedence                            | `page=1&per_page=25`; for an authorized caller, non-integer `page`/`per_page` or `<1` `page` → `400 INVALID_REQUEST`; `per_page` capped at 100; deterministic `created_at DESC, id DESC`; `total`/`lastPage` math; `page > lastPage` → empty `users`, stable totals; unauthenticated, revoked, or forbidden callers with invalid pagination receive the applicable `401`/`403` before pagination validation                                                                 |
| C19 | Atomicity     | Provisioning with forced audit/outbox failure                                                   | Full rollback: no user change, no audit, no outbox                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C20 | Migration     | Adoption fixture up/down/up                                                                     | Legacy rows byte-for-byte; new defaults (`auth_version=0`); conversion structures gone after down                                                                                                                                                                                                                                                                                                                                                                           |
| C21 | Migration     | Reversibility + test-db guard                                                                   | All conversion migrations roll back cleanly; destructive commands blocked outside `testing`                                                                                                                                                                                                                                                                                                                                                                                 |
| C22 | Locks         | Concurrent sign-ins / provisioning / bootstrap                                                  | One user/binding/audit/outbox row for state-changing provision; unchanged same-role invited retries have no writes/effects; deterministic outcome                                                                                                                                                                                                                                                                                                                           |
| C23 | Bootstrap     | Valid, repeat, concurrency, authority change                                                    | Idempotent; `admin.bootstrap` audited; `auth_version+1` only on real change; production confirmation enforced                                                                                                                                                                                                                                                                                                                                                               |
| C24 | Outbox        | Provisioning with workers stopped; two dispatchers; worker restart                              | Row persists `pending`; exactly one enqueue through the UUID-unique job plus atomic claim; delivery recovers after restart                                                                                                                                                                                                                                                                                                                                                  |
| C25 | Notifications | Retry/backoff, terminal failure, mail content                                                   | ≤5 attempts; bounded backoff; `notification.terminal_failure` audited with outbox id; escaped templates; duplicate-safe wording                                                                                                                                                                                                                                                                                                                                             |
| C26 | Queue         | DB queue + PostgreSQL integration                                                               | Jobs processed by worker; `queue:failed` visible; no inline SMTP in HTTP requests                                                                                                                                                                                                                                                                                                                                                                                           |
| C27 | Audit         | Immutability + boundedness + redaction                                                          | UPDATE/DELETE rejected; metadata ≤ 8 KB; no tokens/cookies/secrets/traces; allowlisted keys                                                                                                                                                                                                                                                                                                                                                                                 |
| C28 | Frontend      | CSRF bootstrap, header on unsafe, single retry, `ApiError`, logout, unchanged user/list parsing | Per `src/api.test.ts` and the design doc's required tests, including logout `401` invalid-session clear/public re-login notice and network/≥500/post-retry-`419` dashboard/session retention with retry feedback                                                                                                                                                                                                                                                            |
| C29 | Cutover       | Legacy preflight, readiness, invalidation, zero-session, rollback                               | Run `php artisan researchnav:cutover-preflight --phase=legacy --env=testing` before conversion structures exist, then after the exact forward batch run `php artisan researchnav:cutover-preflight --phase=readiness --env=testing`; legacy validates only legacy shape/data, readiness catches conversion/config drift; invalidation is confirmation-gated with count; zero rows before switch; rollback requires reauthentication; `session.express_invalidated` recorded |
| C30 | Errors        | Full error catalog and route precedence                                                         | Every code in §6 maps to the frozen status and `{"error":"CODE"}` body, JSON only; health/session/login/logout/provisioning and both protected list `GET`s obey §8.5's ordered terminal errors, including list `401` before `403`, active before exact role policy, authorization before the bounded list-query Form Request, and no CSRF/origin/rate-limit stage                                                                                                           |

The suite runs against real PostgreSQL in CI with required status checks; no
test may silently fall back to SQLite or skip concurrency/queue/migration cases.

---

## 20. Version and change control

- Version 1.0.0 frozen from: plan `docs/plans/laravel-backend-conversion.md`
  (Plan PR #2), Express sources `server/{index,auth,routes,db,policy,config,email,migrate,bootstrap-admin}.ts`,
  `server/migrations/001_auth.sql`, `server/policy.test.ts`, React sources
  `src/{api,types,access,App,GoogleSignInDialog,RoleWorkspaces}.ts(x)`,
  `src/app.test.tsx`, `.env.example`, and
  `docs/design/frontend-laravel-cutover.md`.
- The orchestrator relocates this file to the `design/laravel-api-data-contract`
  worktree; `main` is kept clean. After relocation the file's canonical home is
  `docs/contracts/laravel-api-data-contract.md` on that branch.
- Every FROZEN section is binding on T1–T9. Implementation deviations require a
  plan amendment on the parent Plan PR, a synchronized update to this document,
  and a synchronized update to `tests/Contract/**` before any merge.
- This contract documents no prototype domain expansion: the catalog/dashboard
  prototype remains non-persistent, React and the standalone Python CLI are
  preserved, and the only compatibility surface is the six paths, the four-field
  user, stable errors, additive pagination, and the existing `app_users` data.
