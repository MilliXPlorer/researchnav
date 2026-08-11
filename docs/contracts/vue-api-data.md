# ResearchNAV Vue Frontend — API Data Contract

## 1. Purpose and status

This document freezes the API data contract that the Vue 3 frontend migration
must preserve. It is the browser-boundary contract between `v1/src/api.ts` and
the authoritative Laravel API. The legacy Express server is a rollback/reference
implementation for the auth and provisioning subset only.

- **Status:** frozen contract for the Vue 3 migration; no boundary change is
  authorized by this document.
- **Plan PR:** https://github.com/MilliXPlorer/researchnav/pull/5
- **Plan document:** `docs/plans/react-to-vue3.md`
- **Authoritative source:** read-only snapshot of the tracked `v1/**` subtree.
- **Boundary owner:** `v1/src/api.ts` (framework-neutral, kept as-is).
- **Normal API:** Laravel on `127.0.0.1:3001`, proxied at `/api`.
- **Legacy rollback:** `v1/server/**` (Express), reference implementation for
  the auth and provisioning subset only; it lacks repository and notification
  endpoints.

The contract is the source of truth for migration tasks F4 and F5 in the plan.
Any deviation requires explicit approval recorded in the parent Plan PR and
re-verification of every acceptance check in Section 14.

## 2. Authoritative sources

All paths are relative to the tracked `v1/**` subtree and are read-only inputs
to this contract, so a reviewer can verify that the Vue boundary matches the
server behavior exactly.

- `backend/routes/web.php` — Laravel routes (methods, paths, guards).
- `backend/config/session.php`, `backend/config/researchnav.php`,
  `backend/bootstrap/app.php` — session, cookie, and origin configuration.
- `backend/app/Http/Controllers/ApiController.php` — auth and provisioning
  controllers.
- `backend/app/Http/Controllers/PublicRepositoryController.php`,
  `backend/app/Services/PublicRepositoryService.php` — public repository.
- `backend/app/Http/Controllers/NotificationController.php`,
  `backend/app/Http/Resources/NotificationResource.php` — notifications.
- `backend/app/Http/Resources/PublicResearchDocumentResource.php`,
  `backend/app/Http/Resources/PublicResearchAuthorResource.php`,
  `backend/app/Http/Resources/CategoryResource.php` — public resources.
- `backend/app/Services/UserSessionMapper.php` — session response shape.
- `backend/bootstrap/app.php` (`withExceptions`),
  `backend/app/Exceptions/ApiValidationException.php` — error rendering.
- `backend/app/Providers/AppServiceProvider.php` — rate limits.
- `server/routes.ts`, `server/auth.ts`, `server/config.ts`,
  `server/index.ts` — legacy Express rollback.
- `src/api.ts`, `src/types.ts`, `src/access.ts`, `src/data.ts`,
  `src/api.test.ts` — frontend boundary, preserved as-is.

## 3. Transport contract

1. Every request is a **relative** URL beginning with `/api` (for example
   `/api/auth/session`, `/api/repository?per_page=50`). Absolute API URLs are
   never used by the frontend.
2. Every request sends `credentials: "include"` so the browser attaches the
   `researchnav.sid` cookie on same-origin requests.
3. Requests carry `Content-Type: application/json`. JSON bodies are produced
   with `JSON.stringify` and never include credentials.
4. The API never sends CORS headers (`Access-Control-Allow-Origin` is
   explicitly absent). All browser traffic must be same-origin: through the
   Vite dev proxy (`/api` → `http://localhost:3001`) in development, or the
   same deployed origin in production.
5. JSON request bodies are limited to 32 KiB, and the Vue boundary never sends
   larger JSON bodies (`413 PAYLOAD_TOO_LARGE` beyond that).
6. `204 No Content` responses return no body and are handled as `undefined`.
7. All other 2xx responses are parsed as JSON.

## 4. Frozen endpoint inventory

### 4.1 Public, sessionless endpoints

These endpoints never start or persist a browser session and never set the
session cookie.

- `GET /api/health` — success `200 {"status":"ok"}`; no errors.
- `GET /api/categories` — success `200 {"data":[CategoryResource]}`.
- `GET /api/repository` — query only: `q`, `author`, `keywords`,
  `category_id`, `category`, `publication_year`, `year`, `per_page` (1–50);
  success `200` paginated envelope of `PublicResearchDocumentResource`;
  errors `422 VALIDATION_FAILED`, `429 RATE_LIMIT_EXCEEDED`.
- `GET /api/repository/{id}` — success `200` single
  `PublicResearchDocumentResource`; error `404 NOT_FOUND`.

`GET /api/categories` and `GET /api/repository/{id}` exist in the frozen
surface but are not called by the current frontend; the Vue boundary must
continue to not call them and must not depend on their availability for page
rendering.

### 4.2 Authentication endpoints

- `POST /api/auth/google` — body `{"credential": string}` (1–16384 chars);
  success `200 {"user": UserSession}` and a session cookie; errors
  `400 INVALID_REQUEST`, `401 GOOGLE_EMAIL_NOT_VERIFIED`,
  `403 ORIGIN_NOT_ALLOWED`, `413 PAYLOAD_TOO_LARGE`,
  `429 RATE_LIMIT_EXCEEDED`.
- `GET /api/auth/session` — success `200 {"user": UserSession}`; errors
  `401 AUTHENTICATION_REQUIRED`, `401 SESSION_USER_NOT_FOUND`.
- `POST /api/auth/logout` — success `204` no content and the `researchnav.sid`
  cookie is cleared; errors `401 AUTHENTICATION_REQUIRED`,
  `403 ORIGIN_NOT_ALLOWED`.

### 4.3 Provisioning endpoints (role-guarded)

- `GET /api/admin/coordinators` — guards: authenticated, active, role `admin`;
  success `200 {"users": UserSession[]}`; errors `401`,
  `403 ACCOUNT_ACCESS_PENDING`, `403 ROLE_NOT_AUTHORIZED`.
- `POST /api/admin/coordinators` — guards: origin, throttle (30/hour),
  authenticated, active, role `admin`; body `{"email": string}`; success
  `201 {"user": UserSession}`; errors `400 INVALID_REQUEST`, `401`,
  `403 ACCOUNT_ACCESS_PENDING`, `403 ROLE_NOT_AUTHORIZED`,
  `403 ORIGIN_NOT_ALLOWED`, `413`, `429`.
- `GET /api/coordinator/instructors` — guards: authenticated, active, role
  `coordinator`; success `200 {"users": UserSession[]}`; errors `401`,
  `403 ACCOUNT_ACCESS_PENDING`, `403 ROLE_NOT_AUTHORIZED`.
- `POST /api/coordinator/instructors` — guards: origin, throttle (60/hour),
  authenticated, active, role `coordinator`; body `{"email": string}`;
  success `201 {"user": UserSession}`; errors same as the admin POST.

The user list endpoints order by creation time descending. Provisioning
normalizes the email to trimmed lowercase before persistence and returns the
session shape. `UserSession` is defined in Section 5.

### 4.4 Notification endpoints

- `GET /api/notifications` — guards: authenticated, active; success `200`
  paginated envelope of `NotificationResource`, newest first; errors `401`,
  `403 ACCOUNT_ACCESS_PENDING`.
- `PATCH /api/notifications/{uuid}/read` — guards: origin, authenticated,
  active; Laravel success `200 {"data": NotificationResource}`; errors `401`,
  `403 ACCOUNT_ACCESS_PENDING`,
  `403 ORIGIN_NOT_ALLOWED`, `404 NOT_FOUND`.

The `{uuid}` path segment is URL-encoded with `encodeURIComponent` before
insertion. The read endpoint only succeeds for notifications owned by the
current user. The authoritative React v1 `api.ts` currently and incorrectly
types this response as a bare `NotificationResource`, so it returns the
envelope at runtime. This known source defect is not a statement of approved
Vue behavior: the Vue migration must normalize the Laravel `data` envelope at
the frontend boundary and return the bare resource.

### 4.5 Server-owned surface (not consumed by the Vue boundary)

The following authenticated domain routes exist and are frozen, but the Vue
frontend does not call any of them and must not start doing so in this
migration: `research` CRUD and transitions, `research/{id}/authors`, files and
downloads, similarity, feedback, revisions, monitoring, validation, review
assignments, and category mutations. They remain unchanged server-side and
their contracts are outside the browser-boundary scope of this document.

## 5. Request and response shapes

### 5.1 UserSession

```ts
interface UserSession {
  email: string;
  role: Role;
  accessStatus: "active" | "invited" | "blocked";
  isAdmin: boolean;
}
```

`Role` is the exact union: `admin`, `researcher`, `adviser`, `instructor`,
`panel`, `statistician`, `coordinator`, `librarian`, `research-office`,
`academics`. The session mapper emits exactly these four fields; the Vue
boundary must not add or rename fields.

### 5.2 Public research resource

```ts
interface PublicResearchResource {
  id: string | number;
  title: string;
  abstract: string | null;
  keywords: string | null; // comma-separated string in practice
  publication_year: number | null;
  institution_name: string | null;
  institution_location: string | null;
  academic_unit: string | null;
  degree_program: string | null;
  manuscript_date_label: string | null;
  abstract_provenance: string | null;
  research_stage: string | null; // snake_case, e.g. "completed"
  authors: PublicResearchAuthor[];
  category: PublicCategory | null;
}

interface PublicResearchAuthor {
  author_name: string;
  author_order: number;
  is_corresponding_author: boolean;
}

interface PublicCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
}
```

Frontend mapping rules (frozen in `toResearchRecord`):

- `authors` are sorted by `author_order` ascending and joined as
  `"First, Second"` using `author_name` only.
- Year accepts `publication_year` first, then `year`, coerced to `Number`.
- For `category`, a string value is returned as-is, including an empty string.
  An object category uses its `name`; only a non-string category with no
  `name` reaches the helper's `"Uncategorized"` fallback.
- For `keywords`, an array is returned as supplied, without trimming or
  filtering its values. The legacy comma-separated-string branch splits the
  string into an array.
- `research_stage` is split on `_` and title-cased for display.
- Deprecated `institute`/`program` aliases on the display record are kept for
  existing workspace layouts and are derived from `academic_unit` and
  `degree_program`.
- A source filename is never derived or exposed (see Section 11).

### 5.3 NotificationResource (frontend boundary)

```ts
interface NotificationResource {
  id: string; // UUID
  type: string; // e.g. "App\\Notifications\\ResearchActivityNotification"
  event: string | null;
  title: string | null;
  message: string | null;
  action_url: string | null;
  research_document_id: number | null;
  read_at: string | null; // ISO-8601 or null
  created_at: string | null; // ISO-8601 or null
}
```

Laravel returns the read PATCH response in a `data` envelope. The authoritative
React v1 `api.ts` currently expects a bare `NotificationResource` and therefore
returns that envelope incorrectly; this is a known pre-migration defect, not
the approved Vue target. During migration, `src/api.ts` must make the
frontend-only normalization from `{"data": notification}` to the bare
notification object. It must otherwise pass that object through **unchanged**:
no field renaming, translation, null defaulting, or fabricated alerts when the
collection is empty. `src/api.test.ts` must mock `{"data": notification}` for
the read PATCH and assert the exact returned bare notification object. Its
absence before migration is expected and does not assert current behavior.

### 5.4 Pagination envelope (Laravel)

Both `GET /api/repository` and `GET /api/notifications` return a Laravel
paginator serialized by an API resource collection:

```json
{
  "data": [],
  "links": {
    "first": "...",
    "last": "...",
    "prev": null,
    "next": "..."
  },
  "meta": {
    "current_page": 1,
    "from": 1,
    "last_page": 1,
    "per_page": 15,
    "to": 1,
    "total": 1
  }
}
```

The frontend reads only `data` and `links.next` and ignores the `meta` block.
`links.next` is an absolute URL when more pages exist and `null` on the last
page.

## 6. Error contract

All error responses are JSON objects of the form `{"error": "<STABLE_CODE>"}`.
The frontend throws `new Error(code)` when a JSON body is present and
`new Error("REQUEST_FAILED_<status>")` otherwise. The stable codes are:

- `400 INVALID_REQUEST` — validation failure with `details`; Laravel renders
  `{"error":"INVALID_REQUEST","details":{"formErrors":[],"fieldErrors":{...}}}`.
- `401 AUTHENTICATION_REQUIRED` — no session or no `user_id` in session.
- `401 SESSION_USER_NOT_FOUND` — session references a deleted user; the
  session is invalidated.
- `401 GOOGLE_EMAIL_NOT_VERIFIED` — Google payload missing `sub`/`email` or
  `email_verified` is false.
- `403 ACCOUNT_ACCESS_PENDING` — authenticated but `accessStatus` is not
  `"active"`.
- `403 ROLE_NOT_AUTHORIZED` — authenticated but role is not permitted (admin
  bypasses role checks).
- `403 ORIGIN_NOT_ALLOWED` — `Origin` header missing or not in the allowlist
  on a guarded route.
- `404 NOT_FOUND` — missing model, route, or resource.
- `413 PAYLOAD_TOO_LARGE` — JSON body over 32 KiB.
- `422 VALIDATION_FAILED` — query or request validation in Laravel (`errors`
  payload).
- `429 RATE_LIMIT_EXCEEDED` — throttled; body presence depends on the
  middleware and the frontend must not depend on it.
- `500 INTERNAL_SERVER_ERROR` — unhandled server error; legacy Express may
  emit `LOGOUT_FAILED` for a logout store failure.

The frontend special-cases exactly one error: `getCurrentSession` maps a
thrown `AUTHENTICATION_REQUIRED` to a `null` session. Every other failure
propagates to the caller.

## 7. Session, cookie, and origin contract

### 7.1 Cookie

- Name: `researchnav.sid`.
- HttpOnly: `true` (never readable by script).
- SameSite: `Lax`.
- Secure: `true` in production only.
- Path: `/`.
- Lifetime: 8 hours (Laravel `SESSION_LIFETIME=480` minutes, idle-based;
  legacy Express `maxAge` 8h with `rolling: true`).
- Storage: Laravel database `sessions` table; legacy Express PostgreSQL
  `user_sessions` table.

Only authenticated sessions persist. Unauthenticated requests neither set nor
retain the cookie (`saveUninitialized=false` behavior is mirrored by
`StartResearchNavSession` and `DiscardUnauthenticatedSession` on the Laravel
side). The application explicitly stores the user ID under `user_id`; no
application-level role, email, or token is stored. Laravel guard keys and other
Laravel session internals may coexist in the session.

### 7.2 Origins

- The origin allowlist is derived from `APP_URL` plus comma-separated
  `APP_ORIGINS`, canonicalized to `scheme://host[:port]` with a lowercase host
  and default ports stripped.
- Every state-changing route (`POST`/`PATCH` mutations, Google login, logout,
  notification read) is guarded by an exact-origin check and returns
  `403 ORIGIN_NOT_ALLOWED` when the `Origin` header is absent or not in the
  allowlist.
- Read-only authenticated routes (`GET /api/auth/session`,
  `GET /api/notifications`) are not origin-guarded but still require the
  session.
- Production requires `APP_URL` and every `APP_ORIGINS` entry to be HTTPS,
  `SESSION_SECURE_COOKIE=true`, and a valid Google client ID; otherwise the
  application refuses to boot.
- CSRF: the API group disables Laravel CSRF token validation (`api/*` is in
  the `validateCsrfTokens` except-list and `PreventRequestForgery` is removed
  from the API group). The origin check is the CSRF control. The Vue boundary
  sends no CSRF token.

### 7.3 Legacy Express parity

The Express rollback/reference implements the auth and provisioning subset
only. It does **not** implement repository or notification endpoints; the Vue
boundary targets Laravel for those. This contract does not claim parity for
request parsing, rate-limit errors, error bodies, or body-limit behavior.

## 8. Pagination and query normalization

1. `listPublicResearch` starts at `/api/repository?per_page=50` and follows
   `links.next` until it is `null`, for at most 100 pages. It never
   manufactures fallback records.
2. `listNotifications` starts at `/api/notifications` and follows `links.next`
   until it is `null`, for at most 100 pages. It never fabricates alerts.
3. `normalizeNextPath` converts an absolute `links.next` URL into a
   same-origin relative path plus query by resolving against
   `window.location.origin` and returning `pathname + search`. Host, port, and
   scheme are stripped so every follow-up request stays relative.
4. Query strings must round-trip without manual string manipulation beyond
   `URLSearchParams`/`encodeURIComponent` where the code already does so.
5. An empty collection response (`{"data":[],"links":{"next":null}}`) must
   produce an empty result set, never placeholder entries.

## 9. Notification action URLs

- The server emits `action_url` as an internal path such as `/research/42`
  (never a full URL).
- The Vue boundary treats `action_url` as a client-side navigation path: it is
  passed to the manual History API `navigate()` callback. It is never opened
  as an external link, never prefixed with an origin, and never used as a
  fetch target.
- The drawer may display `action_url` as text only.
- Clicking a notification marks it read first (when `read_at` is `null`), then
  navigates.

## 10. Google Identity Services credential handling

1. The GIS script loads once from `https://accounts.google.com/gsi/client`
   with a cached promise and a `data-google-identity` marker; a failed load
   removes the script and permits a retry.
2. Initialization uses `client_id` from `VITE_GOOGLE_CLIENT_ID` with
   `auto_select: false`, `cancel_on_tap_outside: true`,
   `use_fedcm_for_prompt: true`, and the credential callback.
3. The rendered button is a 320px standard outline "Continue with Google"
   button.
4. The credential from the callback is sent exactly once, as JSON
   `{"credential": ...}` in `POST /api/auth/google`. The frontend never
   validates, logs, stores, or persists the credential (no localStorage, no
   sessionStorage, no state beyond the in-flight request).
5. Server-side verification is authoritative: the ID token must match the
   configured audience and `email_verified` must be true; unverified or
   missing identity returns `401 GOOGLE_EMAIL_NOT_VERIFIED`.
6. A missing `VITE_GOOGLE_CLIENT_ID` shows the configuration error state and
   never initializes GIS. Script blocking shows the privacy-settings error
   state with a retry path.
7. A new or unassigned Google account is created blocked (role `researcher`,
   `accessStatus: "blocked"`) and cannot enter the dashboard until
   provisioned.

## 11. Public data privacy

- The public repository scope is: `submission_status` in (`approved`,
  `archived`), `visibility` = `public`, and `archive_status` = `archived`.
- `PublicResearchDocumentResource` exposes only the fields in Section 5.2. It
  never exposes `import_source_filename`, `import_source_sha256`, submitter
  identity, internal status fields, file paths, or similarity results.
- The Vue boundary never derives or displays a source filename, and tests
  assert its absence (`expect(record).not.toHaveProperty("sourceFilename")`).
- The metadata dialog renders only public fields. Document download remains
  gated behind sign-in and is not performed by the public page.
- Catalog filtering and sorting are client-side over the fetched public
  dataset; the Vue boundary adds no extra server queries.

## 12. Framework-neutral modules

The following files are framework-neutral and are preserved as-is by the Vue
migration, except for the approved frontend-only notification read-envelope
normalization and its exact test; otherwise, only required type or lint
adjustments are permitted, with no behavior change:

- `src/api.ts` — the sole browser API boundary: relative fetch paths,
  `credentials: "include"`, JSON headers, error mapping, pagination caps,
  `normalizeNextPath`, resource mapping (`toResearchRecord`, `toAuthors`,
  `toKeywords`, `toCategory`, `toResearchStage`), `roleLabel`, and the required
  frontend-only notification read-envelope normalization.
- `src/types.ts` — `Role`, `Status`, `ResearchRecord`, `RoleConfig`,
  `UserSession`.
- `src/access.ts` — `canEnterDashboard` (active-only gate).
- `src/data.ts` — `roleConfigs`, `defaultUserSession`.
- `src/api.test.ts` — behavioral coverage: exact Laravel author fields,
  author sort, absolute `next` URL normalization, empty collection handling,
  exact notification pass-through, UUID read route and `PATCH` method, and the
  required exact unwrapping of `{"data": notification}` to the bare
  notification.

The migration must not move, rename, or framework-wrap these modules. The
notification read-envelope normalization and its exact test are the approved
frontend-only exception to otherwise preserving `api.ts` behavior.

## 13. Frozen behavior outside the boundary

The Vue migration makes no change to: routes, middleware, validation,
rate-limit tiers (auth 20/min, provisioning 30/h and 60/h, public search
60/min, domain mutations 30/min), session storage, origin allowlist, body
limit, notification channel payloads, provisioning policy, or the similarity
algorithm. The `src/research_studies/**` corpus, its derived catalog, and all
manuscript files remain excluded from Git and from the Vite filesystem.

## 14. Acceptance checks

The Vue migration passes only when every check below holds on the exact
frontend child head:

- [ ] Every request from the Vue boundary uses a relative `/api/...` path and
      `credentials: "include"`.
- [ ] `src/api.ts` error mapping is unchanged: non-2xx parses `{error}` and
      throws the stable code or `REQUEST_FAILED_<status>`; `204` yields
      `undefined`; only `AUTHENTICATION_REQUIRED` on session lookup maps to
      `null`.
- [ ] Endpoint methods and paths are unchanged: `GET /api/auth/session`,
      `POST /api/auth/google`, `POST /api/auth/logout`,
      `GET|POST /api/admin/coordinators`,
      `GET|POST /api/coordinator/instructors`, `GET /api/notifications`,
      `PATCH /api/notifications/{encodeURIComponent(uuid)}/read`, and
      `GET /api/repository?per_page=50`.
- [ ] `normalizeNextPath` and the 100-page caps are unchanged; empty
      collections return empty arrays with no manufactured records or alerts.
- [ ] `NotificationResource` passes through exactly, including all nullable
      fields. Laravel's read PATCH response is
      `{ "data": NotificationResource }`; Vue `api.ts` normalizes it to a
      bare `NotificationResource`, and an exact `src/api.test.ts` assertion
      mocks that envelope and covers the normalization. The missing
      normalization in the current React v1 source is the known defect this
      migration fixes at the frontend boundary only.
- [ ] `action_url` is treated as an internal navigation path and is never
      opened externally or prefixed with an origin.
- [ ] GIS lifecycle, initialization options, 320px button, retry cleanup, and
      single-use credential POST are preserved; no credential storage exists.
- [ ] No source filename, import metadata, or internal status appears in
      `types.ts`, `api.ts`, or rendered output.
- [ ] Session cookie name `researchnav.sid`, HttpOnly/SameSite/Secure flags,
      and the origin allowlist behavior are unchanged; no CSRF token is sent.
- [ ] `src/api.ts`, `src/types.ts`, `src/access.ts`, `src/data.ts`, and
      `src/api.test.ts` are preserved with only type/lint adjustments, except
      for the required frontend-only notification read-envelope normalization
      and its exact test.
- [ ] No backend, schema, migration, or `server/**` logic change exists in the
      migration diff.
- [ ] Committed docs contain no local absolute paths and no confidential
      filenames (corpus basenames, derived catalog names, or user data).

## 15. Non-goals

- No new endpoints, no endpoint removal, and no method or path changes.
- No change to session, cookie, origin, body-limit, rate-limit, or
  authorization behavior.
- No Laravel notification-envelope change, action URL semantic change, or GIS
  credential-flow change. The Vue frontend-only normalization of Laravel's
  existing read envelope is required.
- No expansion of the public resource fields and no exposure of import
  metadata or source filenames.
- No backend, database, schema, or migration work; no `server/**` logic
  changes; no algorithm changes.

## 16. Change control

Any change to this contract requires: a written justification in the parent
Plan PR, confirmation that Laravel can honor it and, for auth or provisioning
changes, that the legacy Express rollback can honor the applicable subset,
re-running the acceptance checks in Section 14, and updated `api.test.ts`
coverage. The contract is not versioned independently; the parent Plan PR and
its child PRs are the change record.
