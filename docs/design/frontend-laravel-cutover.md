# React-to-Laravel interaction contract

## Purpose and preservation rule

This contract governs the React client when `/api` moves from Express to Laravel. It is an integration and interaction contract, **not a visual redesign**. Preserve the current Reading Room design system, component hierarchy, copy, routes, responsive breakpoints, motion, and keyboard behavior. The only visible additions permitted are feedback in existing loading, inline-message, toast/notification, and disabled-control patterns, plus necessary retry and previous/next pagination controls. Those controls must reuse existing button/link styles and patterns; they do not authorize a control, layout, or visual redesign.

### Non-goals

- No new screen, route, role, workflow, navigation item, dashboard, catalog persistence, or similarity behavior.
- No changes to `/`, `/catalog`, or `/app`, the `UserSession` shape, browser-visible API paths, or responsive rules.
- No bearer-token/local-storage authentication, cross-origin SPA, broad CORS, Socialite redirect, Python integration, or visual/layout/typography/color/icon/spacing redesign.

### T6 implementation ownership

The expanded T6 frontend ownership includes the required integration changes in `App`, `Dashboard`, Google GIS sign-in, `RoleWorkspaces`, shared frontend types, and their focused or affected tests, as well as the API/proxy/tooling work. It permits only the behavior needed to implement this contract. It does not authorize CSS changes or any design change.

## Browser/API boundary

The browser continues to request the same relative, same-origin paths with `credentials: "include"`. In development Vite proxies `/api` to Laravel at `http://localhost:8000`; production serves React and Laravel under one HTTPS origin.

| Request                                            | React response contract                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /api/health`                                  | `200 {"status":"ok"}`; also establishes/refreshes Laravel session and XSRF cookies. |
| `GET /api/auth/session`                            | `200 {"user": User}` for a valid session.                                           |
| `POST /api/auth/google`                            | `200 {"user": User}`.                                                               |
| `POST /api/auth/logout`                            | `204` and no body.                                                                  |
| `GET /api/admin/coordinators?page=&per_page=`      | `200 {"users": User[], "pagination": Pagination}`.                                  |
| `POST /api/admin/coordinators`                     | `201 {"user": User}`.                                                               |
| `GET /api/coordinator/instructors?page=&per_page=` | `200 {"users": User[], "pagination": Pagination}`.                                  |
| `POST /api/coordinator/instructors`                | `201 {"user": User}`.                                                               |

`User` remains exactly `{ email, role, accessStatus, isAdmin }`; do not consume database IDs, timestamps, token data, or added fields. List parsing retains the current `users` array and treats pagination as additive:

```ts
type Pagination = {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
};
```

## Stable API errors

Every non-2xx response becomes an `ApiError`, never a generic `Error`. It preserves HTTP `status`, server `code` (`error`), optional bounded validation `details`, and enough request context for a safe retry decision. Malformed JSON and network failures use client codes such as `RESPONSE_INVALID` and `NETWORK_ERROR`; they are never treated as anonymous access.

Laravel returns `{"error":"STABLE_CODE"}` with optional non-sensitive validation details, never HTML. React branches on code first, then status.

| Condition                                                                       | Interaction behavior                                                                                                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401` `AUTHENTICATION_REQUIRED`, `SESSION_USER_NOT_FOUND`, or `SESSION_REVOKED` | Clear local session and enter anonymous state. Preserve form input where possible and ask the user to sign in again. Logout applies the precedence defined in [Logout](#logout). |
| `419` or `CSRF_TOKEN_MISMATCH`                                                  | Reacquire CSRF material and retry that unsafe request once only. Then show a retryable failure; never loop.                                                                      |
| `400` `INVALID_REQUEST`                                                         | Keep form values; associate field details to inputs or use the existing inline/notification error pattern. Field-error handling applies only to this `400` outcome.              |
| `403` `ACCOUNT_ACCESS_PENDING` or `ROLE_NOT_AUTHORIZED`                         | Do not reveal dashboard/provisioning controls. State that access is pending or unavailable without exposing authorization detail.                                                |
| `409` `GOOGLE_ACCOUNT_BINDING_CONFLICT` or `ACCOUNT_ROLE_CONFLICT`              | Do not retry or mutate optimistic state. Keep dialog/form open with safe support/administrator guidance.                                                                         |
| `429` or `RATE_LIMITED`                                                         | Do not auto-retry. Preserve input and state that the user must wait; state a supplied safe retry time if available.                                                              |
| `>=500`, `INTERNAL_SERVER_ERROR`, malformed response, or network failure        | Keep route/data where possible and use retryable unavailable feedback, never anonymous fallback.                                                                                 |

## Session bootstrap and access states

On startup and full reload, show the existing `Loading ResearchNAV...` surface (`aria-busy="true"`) and resolve this sequence before rendering authenticated content: `GET /api/health` with cookies, then `GET /api/auth/session` with cookies.

| Resolved state                                  | Route and interaction result                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active authenticated (`accessStatus: "active"`) | Preserve `/app` role dashboard behavior. `/` and `/catalog` retain current public behavior.                                                                                                                 |
| Anonymous                                       | Only expected unauthenticated session results reach this state. `/app` preserves its present public/landing fallback and Sign in entry point.                                                               |
| Pending/blocked (`invited` or `blocked`)        | Authentication may navigate to `/app`, but `Dashboard` renders the existing `AccessBlocker`, not a role workspace. Do not redirect to a new public blocker route or screen; public routes remain available. |
| Bootstrap unavailable                           | An explicit retryable error, not anonymous. Do not render interactive dashboard content; `Retry` repeats health then session.                                                                               |

When a later request finds a revoked session, clear only local session state, return to the public fallback, announce that the session ended, and move focus to the existing Sign in trigger or page heading.

## Laravel CSRF behavior

`GET /api/health` is the acquisition mechanism. React must request it with cookies at bootstrap and before an unsafe request when `XSRF-TOKEN` is unavailable; URL-decode `XSRF-TOKEN` from `document.cookie`; and send it as `X-XSRF-TOKEN` on `POST`, `PUT`, `PATCH`, and `DELETE`.

Keep JSON content type for JSON bodies. Never put the XSRF value in a URL, body, log, toast, or error. Safe reads need no header. On a CSRF mismatch, reacquire via health and replay the original unsafe request once with its original body/headers. Cookies remain the session mechanism; the readable XSRF cookie is not an identity credential.

## Google GIS sign-in

The current modal remains the single Google entry point and preserves its focus trap, Escape/backdrop/close behavior, script retry, GIS button configuration, and `Verifying account...` state.

1. Load/initialize GIS with `VITE_GOOGLE_CLIENT_ID`.
2. On credential callback, mark the button region busy and prevent duplicate submits.
3. Obtain CSRF if needed, then post `{ credential }` to `/api/auth/google` with `X-XSRF-TOKEN`.
4. Active users close the dialog and navigate to `/app` exactly as today.
5. Blocked/invited users may complete the existing navigation to `/app`, where `Dashboard` renders the existing `AccessBlocker` instead of a role workspace; do not redirect them to a new public blocker.
6. Invalid token/email verification, binding conflict, rate limit, CSRF failure after one retry, network, and server failures keep the dialog open, restore controls, and show a specific safe alert. Never reveal a credential, raw provider response, or account-binding detail.

Closing after failure returns focus to the opener. Errors use `role="alert"`; routine verification progress is announced without repeated interruption.

## Logout

Logout enters pending immediately: disable its initiating control, prevent repeated requests, retain the dashboard, and expose `Signing out…` through the existing control pattern. Do not clear local state or navigate until a `204` response, except for the logout-specific already-invalid session outcome below.

On `204`, clear local user state, navigate to `/`, restore an enabled Sign in trigger, and place focus on the landing heading or Sign in control. If logout returns `401` with `AUTHENTICATION_REQUIRED`, `SESSION_USER_NOT_FOUND`, or `SESSION_REVOKED`, the server session is already invalid: clear local session state, navigate to the public fallback, and announce a re-login notice. This outcome takes precedence over generic logout failure handling. For a network failure, `>=500`, or `419` after its single CSRF refresh/replay, retain the dashboard and local session, restore the logout control, and announce: “We could not sign you out. Please try again.” Do not imply success after an ambiguous failure.

## Provisioning lists and pagination

Administrator Coordinator and Coordinator Instructor lists preserve their current cards, labels, order, and invite forms. First load sends the exact query names `page=1&per_page=25` (or relies on the equivalent server defaults); `per_page` is never renamed to `perPage` in the request. Parse the unchanged `users` array and the additive `pagination` envelope with exact `page`, `perPage`, `total`, and `lastPage` fields. Do not introduce a table, pager design, or new initial count display.

Pagination is progressive within the current list pattern. Use existing button/link styling for any necessary previous/next control; hide controls when `lastPage <= 1`; preserve focus after a page load; and keep current content visible while a later page loads.

| State                              | Required behavior                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Initial loading                    | Keep the panel; mark only list region busy. Never flash empty state.                                 |
| Empty success                      | Use current empty-message style: no accounts provisioned yet. Keep authorized invite form available. |
| List unavailable                   | Preserve rendered data; otherwise show retryable unavailable feedback, not empty state.              |
| Later-page pending/error           | Keep current page; disable only requested page control; restore/announce on failure.                 |
| Invite success                     | Preserve current prepend/upsert and active/invited wording.                                          |
| Client duplicate                   | Keep email normalization/current duplicate notice; do not submit; preserve focus.                    |
| Validation                         | Keep and focus email; connect error via `aria-describedby`; do not clear value.                      |
| Conflict/rate limit/server/network | Do not alter list; preserve email; restore submit; explain safe conflict, wait, or retry outcome.    |

Only a `201` response changes the visible list. Never expose audit, queue, or delivery internals.

## Accessibility, responsive, and motion invariants

- Preserve semantics, labels, text alternatives, visible `2px moss` focus outline/offset, and non-color error/success meaning.
- Preserve tab order, native form submit, dialog trap, Escape close, and focus restoration. Loading/errors do not steal focus except after the removed control on a route/session change.
- Mark the smallest changing region `aria-busy`; use assertive alerts only for actionable failures; avoid duplicate toast and inline announcements.
- Preserve the existing `<768px` bottom tab bar and stacked dashboard-card table behavior. State UI must not add a breakpoint or horizontal overflow.
- Preserve reduced-motion behavior; CSRF/session/list states add no motion.

## Required frontend tests

Add focused API-client tests and retain current UI tests. Verify:

1. health precedes session; loading persists; expected unauthenticated response becomes anonymous; health/session outages produce explicit retryable state;
2. health has the exact `{"status":"ok"}` success contract, establishes CSRF material, credentials are included, unsafe requests decode/send `X-XSRF-TOKEN`, and safe reads do not;
3. CSRF refresh/replay happens exactly once with the original unsafe body/headers, while `419` after that retry is an `ApiError` failure rather than a loop;
4. `ApiError` preserves status, stable `error` code, bounded validation details, and request context; it safely distinguishes auth, validation, conflict, rate limit, malformed response, network, and server outcomes;
5. GIS only routes active accounts to `/app`; pending/blocked and all failure classes preserve dialog/focus/accessible feedback;
6. logout pending, `204` success-only clear/navigation, logout-specific `401` invalid-session clear/navigation with re-login notice, and network/`>=500`/post-retry-`419` failure restoration/announcement;
7. exact list query names (`page`, `per_page`), unchanged `users`, additive `pagination` envelope (`page`, `perPage`, `total`, `lastPage`), loading/empty/unavailable distinction, page-control retention, and invite upsert behavior;
8. duplicate, validation, conflict, rate-limit, and failure paths preserve form/list state; and
9. existing modal, validation, logout, retry, pagination focus/keyboard behavior plus existing responsive snapshots/tests.

After implementation run `npm run format:check`, `npm run lint`, `npm test`, and `npm run build`. Cutover fails if any existing screen, route, focus, or responsive behavior changes outside the states specified here.

Verification note: the contract gate formats owned artifacts only; T7 handles repository-wide formatting, without waiving final global format checks.
