# Frontend Completion Data Contract

Parent plan: [PR #8](https://github.com/MilliXPlorer/researchnav/pull/8)

## Scope

This is a frontend-only contract. Existing same-origin APIs remain primary.
Google SSO, sessions, profiles, backend authorization, database schemas, and
backend code are unchanged.

## API Invariants

- Live operations use relative `/api/...` paths with existing credentials.
- Laravel remains authoritative for identity, roles, ownership, assignments,
  validation, throttling, writes, previews, and downloads.
- Successful empty responses are authoritative empty states.
- Runtime consumers guard required arrays, objects, pagination metadata, and
  nested values before rendering.
- Malformed successful responses show a contract error and do not trigger mock
  fallback.
- No frontend route or role check grants authorization.

## Verified Endpoint Corrections

Only corrections supported by inspected Laravel route/controller evidence are
authorized.

### Statistician

| Operation      | Method and path                                            |
| -------------- | ---------------------------------------------------------- |
| Save checklist | `PUT /api/statistician/methodology/{documentId}`           |
| Sign off       | `POST /api/statistician/methodology/{documentId}/sign-off` |
| Return         | `POST /api/statistician/methodology/{documentId}/return`   |

Remove obsolete `/api/statistician/queue/{id}/...` mutation paths. Writes never
fall back to mock data.

### Librarian

Use `GET /api/librarian/catalog`, not
`/api/librarian/repository-catalog`. Normalize the nested Laravel paginator into
the existing frontend paginated response type and preserve a successful empty
page as live data.

### Research Office

Use `/api/office/*`, not `/api/research-office/*`, for compliance, users,
reports, and privacy logs. Normalize the nested users paginator. This path
correction does not grant Office access to Coordinators or Academics.

Research Office fallback remains disabled until the deployed route family has
passed integration tests proving that strict Office middleware is registered,
the controller is available, the exact Research Office role can read permitted
endpoints, and Coordinator and Academics receive `403` from every `/api/office/*`
endpoint. A route or middleware configuration failure must remain visible and
must not be concealed by demo data.

### Unsupported Or Unverified

- Do not infer a replacement for `GET /api/instructor/submissions` without
  matching route evidence.
- Do not call unsupported `/api/admin/settings` or `/api/admin/backups` routes.
- Do not invent Research Office exports or Librarian archive mutations.
- A `404` or `405` remains a visible integration error and does not use mocks.

## Error Classification

Preserve the existing `ApiError` status, code, and field-error behavior.

| Outcome                 | UI treatment                     | Mock eligible |
| ----------------------- | -------------------------------- | ------------- |
| Network/unreachable GET | Error or exact reviewed fallback | Yes           |
| GET `500..599`          | Error or exact reviewed fallback | Yes           |
| Aborted request         | Ignore as cancellation           | No            |
| `401`                   | Existing session handling        | No            |
| `403`                   | Access denied                    | No            |
| `404` or `405`          | Integration/not-found error      | No            |
| `429`                   | Retry guidance                   | No            |
| Other `4xx`             | Domain/validation error          | No            |
| Valid empty `2xx`       | Live empty state                 | No            |
| Malformed `2xx`         | Contract error                   | No            |
| Any write failure       | Mutation error                   | No            |

## Read-Only Fallback

Fallback may be used only when all conditions hold:

1. The real request is attempted first.
2. The method is `GET`.
3. The exact role/read model is allowlisted and has a typed fixture.
4. Failure is a network error or HTTP `5xx`.
5. The request was not aborted and the response was not malformed success.

Fallback provenance is explicit and outside backend resource payloads:

```ts
type ReadResult<T> = Readonly<{
  data: T;
  source: "live" | "mock";
}>;
```

Mock-backed views display "Demo data — read only" and Retry. They never merge
live and mock records. Retrying calls the live API again.

Fallback is forbidden for authentication/session/profile, notifications,
writes, uploads, previews, downloads, similarity POST requests, successful
empty responses, malformed success responses, aborts, and all `4xx` responses.

## Mock Organization

Use typed deterministic fixture sections in the plan-owned
`frontend/src/mockData.ts` module, organized by role:

- researcher
- research instructor
- research adviser
- statistician
- research panelist
- research coordinator
- research office
- librarian
- administrator
- public repository, only if the existing public UI explicitly uses fallback

Fixtures use synthetic Tangub City Global College examples. Emails use `.invalid`.
String IDs begin `mock:` and numeric IDs are negative. Mock records contain no
tokens, real personal data, private manuscript bodies, storage paths, action
URLs, preview URLs, or download URLs.

Every fixture export starts with `mock`. Displayed research titles, names, and
records clearly contain `Demo` or `Sample`.

Controls are gated by explicit `source === "mock"`, not merely by ID format. No
mock ID may reach an API request. Safe local filtering, sorting, expansion, and
Retry are allowed.

Fixture selection uses the exact session role, not a shared canonical role slug.
Only the explicit Research Office session role may select Research Office
fixtures. Coordinator and Academics must never select Office fixtures or issue
Office requests.

## Fallback Allowlist

Only reviewed read models used by these existing endpoint families may consult
the matching role fixture:

- Researcher: own research lists/details, feedback, revisions, monitoring,
  validation, categories, and persisted similarity GET results.
- Research Instructor: sections, title proposals, similarity overview, class
  reports, students, documents, and member reads.
- Research Adviser: advisees, pending reviews, similarity alerts, and feedback
  history.
- Statistician: queue and issued sign-offs.
- Research Panelist: schedule, assignments, and history.
- Research Coordinator: schedules, duplicate flags, adviser load, reports, and
  instructor-account reads.
- Research Office: compliance, users, reports, and privacy-log GETs under
  `/api/office/*`, but only after the live authorization prerequisite above has
  passed.
- Librarian: archiving queue, `/api/librarian/catalog`, metadata standards, and
  retention-log reads.
- Administrator: dashboard, coordinators, users, audit logs, system status, and
  access-request reads.
- Guest/Public: existing repository browse/search/detail/category GETs only when
  the approved page explicitly enables fallback; public fixtures have no
  downloadable manuscript.

`GET /api/instructor/submissions` remains excluded until matching route evidence
is available. A family not listed above, or a listed read model without an exact
fixture, remains an error and must not borrow another role's data.

## Required Tests

- Exact corrected Statistician methods and paths; obsolete paths are not called.
- Exact Librarian catalog path and nested paginator normalization.
- Exact `/api/office/*` paths and nested users paginator normalization.
- Empty successful arrays/pages remain live empty.
- Network and `5xx` failures use only an exact allowlisted fixture.
- `401`, `403`, `404`, `405`, `429`, aborts, malformed `2xx`, and writes never
  consult fixtures.
- Similarity POST requests remain live-only.
- Mock mode displays its notice and issues zero write/download/preview requests.
- Mock identifiers are rejected before dispatch.
- Role/account changes clear stale live and mock state.
- Coordinator and Academics never select Office fixtures, never call Office
  paths, and receive authoritative `403` responses in backend integration tests.
- Every fixture passes schema assertions for synthetic `Demo`/`Sample` names,
  `.invalid` emails, mock/negative IDs, and the absence of tokens, credentials,
  real personal data, private manuscript text, storage paths, action URLs,
  preview URLs, and download URLs.
- Fixture source and built frontend assets pass secret scanning.
- Existing GSSO/session/profile tests pass unchanged.
