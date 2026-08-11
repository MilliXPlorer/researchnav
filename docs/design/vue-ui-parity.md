# Vue UI Parity Contract

## Status

Provisional UI contract for the React-to-Vue 3 migration tracked by the parent
Plan PR. It becomes frozen only after F1 records the allowlisted source manifest
and aggregate digest and a post-F1 C0 re-attestation confirms this contract
against that F1-frozen snapshot. The existing frontend is the behavioral and
visual source of truth, except for the approved baseline accessibility
remediations stated in this contract.

## Objective

Replace the React implementation with a client-rendered Vue 3 application
without changing product behavior, visible content, visual design, responsive
layout, security boundaries, or Laravel API usage. The approved accessibility
remediations in [Keyboard And Accessibility](#keyboard-and-accessibility) are
target improvements, not claims of exact baseline parity.

## Scope

- Port the landing page, public catalog, authentication dialog, account-access
  states, dashboard shell, notifications, account dialog, mobile navigation,
  and all existing role workspaces.
- Preserve the existing URL model for `/`, `/catalog`, and `/app`, including
  catalog query parameters and browser history behavior.
- Preserve all loading, empty, error, invited, blocked, active, and signed-out
  states exposed by the current frontend.
- Preserve the global stylesheet, Fontsource imports, Lucide icon choices, and
  current DOM class names wherever practical.

## Non-Goals

- No redesign, new product workflow, content rewrite, or visual refresh.
- No Vue Router, Pinia, SSR, hydration, or server-rendered Vue.
- No backend, database, API, authentication, or authorization changes.
- No implementation of aspirational workflows described only in design notes.
- No direct display, import, download, or download link for private document
  corpus files.

## Application Shell

`App.vue` owns session bootstrap, public repository bootstrap, the current
pathname, sign-in dialog visibility, and top-level navigation. It initializes
its pathname from `window.location.pathname` and its single `popstate` listener
updates that pathname only; it does not make `window.location.search` reactive.

Route selection remains exact:

- `/catalog` renders the public catalog.
- `/app` with an authenticated session renders the dashboard or the current
  access-status blocker.
- `/app` without an authenticated session renders the landing experience.
- `/` and unsupported paths render the landing experience.

The application must retain the current session-loading treatment before route
content is selected. Top-level navigation uses `history.pushState`, updates the
pathname, and scrolls to the top with the existing smooth behavior.

`CatalogPage` initializes its query state once from the current URL. Control
changes update that local state and use `history.replaceState` for
`/catalog?...`; they do not push history entries. Direct loading of a
query-bearing catalog URL is supported. Because `App.vue` observes pathname
only, back/forward changes that alter only catalog query text do not rerender or
reinitialize the catalog; query-only back/forward reactivity is not supported
beyond this current behavior. Unsupported notification action paths retain the
current fallback behavior rather than introducing new pages.

## Public Landing Page

The Vue page must preserve:

- Header branding, navigation, public catalog entry, and sign-in action.
- Hero hierarchy, editorial typography, descriptive copy, and primary actions.
- Repository search with its accessible label and submit behavior.
- Recent research records and their current metadata presentation.
- Year, category, and institute filtering behavior.
- Repository loading, empty, and unavailable states without fabricated data.
- Footer content, links, landmarks, and responsive stacking.

Public records continue to come only from the Laravel repository response.
Private file names, paths, hashes, and download actions must not appear.

## Public Catalog

The Vue catalog must preserve:

- Search, year, category, institute, and sort controls.
- Query keys `q`, `year`, `category`, `institute`, and `sort`.
- Omission of filter values equal to `all` from the URL.
- Direct loading of query-bearing URLs; query-only back/forward behavior is
  limited as specified in the Application Shell.
- Existing result counts, cards or rows, and metadata.
- Loading, empty, and API-unavailable states.
- Metadata-dialog opening and closing behavior.
- Every rendered catalog result always shows the exact `Sign in to download`
  action, regardless of session state. That action, including the corresponding
  metadata-dialog action, only opens the sign-in dialog. There is no
  authenticated download UI, download request, private-file link, or direct
  private download behavior in this contract.

Changing a control must retain the current query synchronization semantics and
must not reset unrelated filters.

### CatalogPage search, filter, and sort algorithm

The authoritative v1 algorithm is exact:

1. Compute `needle` exactly as
   `(searchParams.get("q") ?? "").replaceAll('"', "").trim().toLowerCase()`:
   all double-quote characters are removed before trimming and lowercasing.
2. A record matches `needle` when `needle` is empty, or when the lowercased
   space-joined string of `title`, `authors`, `abstract`, and every `keywords`
   entry includes `needle`. This is one case-insensitive substring search; it
   does not tokenize, score, or give quotation marks phrase-search semantics.
3. Retain that record only when each selected `year`, `category`, and
   `institute` is `all` or exactly equals the corresponding record value
   (`String(record.year)`, `record.category`, and `record.institute`,
   respectively).
4. For `sort=newest`, return a copy of the retained records sorted by descending
   numeric `year`; for `sort=oldest`, sort ascending. For `sort=relevance` (or
   an absent or unrecognized sort value), retain the filtered API/source order:
   relevance has no additional ranking algorithm.

Changing `q` uses the same parameter update path as the other controls, so it
preserves unrelated `year`, `category`, `institute`, and `sort` values. Tests
must cover title, authors, abstract, and keyword matches; mixed-case and quoted
queries (including quote removal); retained unrelated filters; and relevance,
newest, and oldest ordering.

## Authentication Dialog

The Google sign-in dialog preserves its title, explanatory copy, close control,
Google button container, missing-configuration state, loading/submitting state,
script-load failure state, retry behavior, and authentication error feedback.

The GIS script loads only when the dialog is opened. The credential remains in
memory only and is sent directly to the existing authentication endpoint. The
dialog emits the authenticated session to the application and does not persist
tokens in browser storage.

When GIS is not already available, the loader creates its script with
`src="https://accounts.google.com/gsi/client"`, `async`, `defer`, and
`data-google-identity="true"`. It initializes GIS with `client_id`,
`auto_select: false`, `cancel_on_tap_outside: true`, and
`use_fedcm_for_prompt: true`; it renders the button with `type: "standard"`,
`theme: "outline"`, `size: "large"`, `text: "continue_with"`,
`shape: "rectangular"`, and `width: 320`. Preserve these current messages
exactly: `Google Client ID is not configured.`, `Verifying account...`,
`Google sign-in could not be verified. Please try again.`,
`Google sign-in was blocked. Allow accounts.google.com in your browser privacy settings, then retry.`,
and `Retry Google sign-in`. Tests must assert the script URL and attributes,
initialize and render-button options (including width `320`), each message,
credential submission failure, script failure, and retry reset.

For an invalid, nonempty GIS credential whose `POST /api/auth/google` receives
HTTP 500, render only `Google sign-in could not be verified. Please try again.`;
do not render the response body, server error code, stack, or other server
detail. Clear the submitting/busy state and retain the retry path. Tests must
mock that HTTP 500 with server-detail content and assert the generic message,
cleared submitting state, an invokable retry, and absence of that content.

## Account Access States

The invited and blocked account presentations preserve their current heading,
description, status treatment, support guidance, account information, and
responsive layout. They do not provide a sign-out action. Client rendering is
informational only; Laravel remains authoritative for account and role access.

## Dashboard Shell

The authenticated dashboard preserves:

- Skip link and primary content target.
- Desktop shelf rail, active-item state, global catalog search, header actions,
  account trigger, notification trigger, and unread badge.
- Current role name, role label, account details, and role-specific workspace.
- Toast or live-status messaging triggered by existing workspace actions.
- Mobile bottom tabs replacing the shelf rail at the existing breakpoint.
- Current navigation targets and fallback behavior.

The dashboard must render the existing workspace for every supported role. The
display labels are the exact `roleConfigs` `label` values in `data.ts` (not
`shortLabel` values):

- System Administrator
- Researcher
- Research Adviser
- Research Instructor
- Research Panel
- Statistician
- Research Coordinator
- Librarian
- Research Office
- Academics

Placeholder and unavailable content is intentional and must remain placeholder
content. The migration must not invent records or connect unused endpoints.

Workspace status notifications render `role="status"` and clear 2.8 seconds
(2800 ms) after `notify` sets their message. Fake-timer tests must verify both
the visible status and its removal at 2800 ms. The Statistician workspace starts
with checks exactly `[true, true, false, false]`: it initially displays `2 of 4
checks complete` and `50%`. Tests must assert that initial state and a checkbox
change that recalculates the count and percentage.

## Notifications

The notification drawer preserves its heading, close action, unread count,
mark-all action, empty state, notification ordering, read/unread treatment,
timestamps, individual read behavior, and action navigation. It does not add a
loading UI.

Notification fields are rendered from the API resource, not fabricated sample
alerts. Render a nullable field only when it is present: in particular, render
the message/detail, action, and research-document context only when their
nullable `message`, `action_url`, and `research_document_id` values are not
null. An empty response or request error must not produce invented alert items.

Opening an unread notification marks it read with the existing `PATCH` API
behavior before following its internal action path; opening an already-read
notification skips that `PATCH`. `Mark all as read` operates only on unread
notifications and must not send a read request for an already-read item.
Nullable action paths remain non-actions. The drawer must not turn API-provided
paths into external links.

An `action_url` is actionable only when it is a validated root-relative,
supported `/research/` path. Before preserving an optional query or hash, the
literal pathname must start with `/research/`, contain no `.` or `..` segment,
and use only unencoded URI-path characters; the full value must contain neither
backslashes nor control characters. Reject full URLs, protocol-relative URLs,
unsupported prefixes, malformed percent encoding, and all percent-encoded or
recursively encoded path bypass forms. A query or hash may be retained only for
a valid pathname. Any malformed or rejected value is safely rendered as a
non-action and is never navigated to. Tests must cover a valid `/research/` path
with query and hash, plus full and protocol-relative URLs, unsupported prefixes,
backslashes, controls, encoded and recursively encoded bypass attempts, and
query/hash attached to an invalid path.

### Approved Vue accessibility remediation

The baseline uses a visual unread dot alone and, at `max-width: 1100px`, hides
the shelf item text with CSS. Those are known baseline accessibility
deficiencies. They are intentionally remediated in Vue and are not exact
baseline-parity requirements. At 1100px and below, each icon-only shelf button
must expose its item text as its accessible name (for example, with an
`aria-label` while its visible label remains hidden). Every notification item
must programmatically expose whether it is `Unread notification` or `Read
notification`, together with its available title, rather than communicating that
state only with the dot or color. Preserve the visual treatment and API behavior
while adding that programmatic state. Tests must query the icon-only shelf
buttons by their names at the 1100px layout and query both read and unread
notification buttons by their programmatic names. They must verify that a
successful individual mark-read and successful mark-all update the affected
programmatic state from unread to read. They must also verify that failed
individual mark-read and failed mark-all preserve the prior unread state and
produce no false read announcement.

## Account Dialog

The account dialog preserves the current identity, email, role, close action,
and sign-out action. It does not display `accessStatus`. Signing out uses the
current API operation, clears the in-memory session, and returns to the current
signed-out experience.

## Shared Components

Vue components retain the current rendered semantics and CSS hooks:

- `Logo` preserves the mark, wordmark, sizing variants, and accessible name.
- `Button` preserves variants, native attributes, disabled state, and event
  forwarding.
- `SectionHeading` preserves its required string title and optional string
  eyebrow, plus an optional typed `action` slot (the Vue counterpart of the
  React `action?: ReactNode` prop). It renders the action after the title and
  eyebrow block, retaining its right-side position within `section-heading`.
- `EmptyState` preserves its fixed Search icon, heading, and description, with
  no action.
- `SearchBox` accepts a string `modelValue`, emits
  `update:modelValue` for each input edit, and emits `submit` with no payload.
  It renders a `role="search"` form, decorative Search icon, screen-reader
  label, input, and `Search` submit button with decorative ArrowRight icon.
  Its defaults are label `Search the repository`, placeholder `Search titles,
authors, or keywords`, and `large: false`; `large` selects
  `search-box-large` and input ID `hero-search`, otherwise the input ID is
  `catalog-search`. Form submission prevents native navigation and emits
  `submit` once. The `Clear search` button is rendered only for a non-empty
  value, is `type="button"`, and emits only `update:modelValue` with `""`; it
  does not submit the form.
- `StatusChip` accepts exactly the `Status` values `Draft`, `Submitted`,
  `Under Review`, `Revision Required`, `Approved`, `Archived`, and `Rejected`.
  It renders the unchanged `status-chip` class plus `status-` followed by the
  lowercased, space-to-hyphen status value, and displays that exact status
  text.
- `SimilarityRing` accepts numeric `score` and optional size `small`,
  `regular` (default), or `large`. It renders `similarity-ring`, `ring-{size}`,
  CSS custom properties `--score` and `--ring-color`, the visible `{score}%`,
  and `role="img"` with `aria-label`
  `Similarity: {score} percent, {lowercase band}`. The authoritative bands are
  Low from 0 through 39 (`39` is Low), Moderate from 40 through 69 (`40` and
  `69` are Moderate), and Flagged from 70 through 100 (`70` is Flagged). Low
  uses `var(--fern)`, Moderate uses `var(--moss)`, Flagged uses
  `var(--amber)`, and only Flagged scores add `ring-high`.

Vue templates use escaped interpolation. `v-html` is prohibited.

## Dialog Interaction Contract

Every dialog and modal must:

- Use the current dialog role, modal state, accessible label relationship, and
  visible close control.
- Capture the previously focused element when opened.
- Move focus to the first intended control after Vue's next DOM update.
- Keep Tab and Shift+Tab focus within the dialog.
- Close on Escape when closing is allowed.
- Close only when the backdrop itself receives the pointer action.
- Restore focus to the invoking control after closing.
- Prevent dialog-content pointer events from triggering backdrop closure.

Drawers preserve their existing overlay and close semantics. Implementation may
use Vue lifecycle hooks and `nextTick`, but it must not use `Teleport` if that
changes DOM order, stacking, or focus behavior.

## Keyboard And Accessibility

- Preserve semantic header, nav, main, section, footer, form, table, button,
  link, heading, and list elements.
- Preserve skip links and target IDs.
- Preserve the visible `:focus-visible` treatment: a 2px solid
  `var(--moss)` outline with 2px offset for every interactive control.
- Icon-only controls retain accessible names. The approved shelf and
  notification-state remediation is specified above; it is an accessibility
  improvement over the known baseline deficiencies, not a claim of exact parity.
- Form controls retain visible or programmatic labels.
- Status, loading, error, and toast updates retain appropriate live-region
  behavior.
- Disabled and busy actions expose their state and cannot submit twice.
- Keyboard interaction must not depend on pointer hover.
- External links retain safe target and relationship attributes.
- Text, icons, borders, and state indicators must meet WCAG AA contrast. Color
  alone must not communicate state: status chips retain their text, similarity
  rings retain their numeric value and accessible band, and notifications use
  the approved programmatic read/unread distinction in addition to their
  dot/color treatment.

## Visual Contract

`src/styles.css` is a locked migration baseline. The implementation must not
redesign tokens, typography, spacing, borders, shadows, radii, animations, or
layout rules. Preserve:

- Reading Room color palette and CSS custom properties.
- Inter, Source Serif 4, and IBM Plex Mono imports and existing weights.
- Existing class names and element ordering needed by descendant selectors.
- Lucide icon names, dimensions, stroke behavior, and alignment by replacing
  `lucide-react` with the corresponding `lucide-vue-next` exports.
- Existing overlay, modal, drawer, toast, navigation, card, table, and empty
  state styling.

Scoped CSS, CSS modules, utility-class rewrites, and component-library
substitution are out of scope.

### Stylesheet integrity gate

Before conversion, F1 records the frozen SHA-256 of the external authoritative
source counterpart; after conversion, calculate the SHA-256 of the tracked
destination `v1/src/styles.css` and require byte-identical equality with that
counterpart or its recorded F1 digest. The before/after evidence must state
both SHA-256 values and the equality result.
The sole exception is a minimal **selector-only** correction for a verified Vue
rendering incompatibility that has been approved by the parent Plan before the
change. An exception may change selectors only, never declarations, tokens,
properties, values, or rule ordering. The parent Plan PR must record the prior
approval, incompatibility reproduction, selector-only diff, before/after hashes,
and visual evidence. A child PR cannot self-approve or silently substitute this
exception for the hash gate.

## Responsive Contract

At wide desktop, medium desktop or tablet, and mobile widths, preserve the
existing stylesheet's exact `max-width: 1100px` and `max-width: 767px`
breakpoints and behavior. In particular:

- The desktop dashboard shelf rail and content proportions remain intact.
- At 1100px and below, the dashboard shell has 76px left padding and the shelf
  rail is 76px wide. Its label and footer are hidden, and its navigation is an
  icon-only rail; each icon-only button exposes its item text as an accessible
  name under the approved accessibility remediation.
- Dense public and dashboard layouts collapse according to existing rules.
- At 767px and below, the shelf rail is hidden and the fixed mobile tabs replace
  it. The tabs are exactly 66px tall, have five equal columns, and remain above
  page content without overlapping reachable controls.
- At 767px and below, dashboard tables use the existing stacked-card treatment:
  the table header is visually hidden, rows and cells are blocks, and each
  `td[data-label]` supplies its visible label. Catalog layouts become one
  column and result actions stack rather than clipping horizontally.
- Dialogs and drawers remain fully reachable within the viewport. Their modal
  and drawer backdrops share fixed inset stacking at `z-index: 100`, above the
  header, rail, and 66px mobile tabs; the skip link remains above overlays.
- Touch targets remain usable and do not overlap fixed navigation.
- Reduced-motion preferences suppress nonessential animation and smooth
  scrolling as they do now.

## Component Boundary

Use typed Vue props and emits without a global event bus:

- Public pages emit `sign-in` and `navigate`.
- `GoogleSignInDialog` emits `close` and `authenticated`.
- `Dashboard` emits `navigate` and `logout`.
- `MetadataDialog` emits `close` and `sign-in`.
- `NotificationsDrawer` emits `close`, `open`, and `mark-all`.
- `RoleWorkspace` accepts the current role and emits status notifications.
- Form controls use typed `modelValue` and `update:modelValue` where applicable.

Root-owned reactive state and focused composables are sufficient. A global
store is not permitted for this migration.

## Visual Acceptance Matrix

Review deterministic states at 1440 by 900, 1024 by 768, and 390 by 844:

| Experience     | Required states                                             |
| -------------- | ----------------------------------------------------------- |
| Landing        | loading, populated, empty, repository unavailable           |
| Catalog        | default, queried, filtered, sorted, empty, unavailable      |
| Metadata       | populated dialog, keyboard focus loop, guest sign-in action |
| Authentication | initial, missing configuration, loading, error, retry       |
| Dashboard      | active role, notification badge, toast, mobile tabs         |
| Notifications  | populated read/unread, empty, mark all                      |
| Account        | account details, sign-out action, focus restoration         |
| Access         | invited and blocked accounts                                |
| Workspaces     | every supported role heading and intentional placeholder    |

Repeat representative landing, catalog, dialog, and dashboard checks with
reduced motion enabled. Compare content order, line wrapping, spacing, control
dimensions, icon alignment, overflow, fixed navigation, focus indication, and
overlay stacking against the existing frontend.

### Screenshot evidence handling

Screenshot capture is mocked, offline, and limited to synthetic fixtures; it
must not contact live services or contain real users, email addresses,
repository data, manuscript data, or other personal or confidential content.
Keep screenshots and pixel-comparison artifacts outside Git, CI, shared
storage, and external artifacts. Before review, inspect captured pixels and all
metadata, extracted text, and OCR output for sensitive content. Publish only a
non-sensitive summary (such as state, viewport, pass/fail, and an
intentional-difference explanation); do not commit, attach, or reproduce
screenshot contents in repository files. Dispose of local capture evidence
after review.

## Automated Acceptance

- Every existing React component assertion has an equivalent Vue Testing
  Library assertion.
- All supported role headings and workspace states are covered.
- Catalog query, filter, sort, loading, empty, and failure behavior is covered.
- Session loading, anonymous, active, invited, blocked, and logout behavior is
  covered.
- Dialog initial focus, tab wrapping, Escape, backdrop close, and focus restore
  are covered.
- GIS configuration, script failure, retry, submission, and success are
  covered without retaining credentials, including the exact GIS URL, options,
  button width, current messages, and an invalid nonempty credential HTTP 500
  that clears submitting state, preserves retry, and contains no server detail.
- Catalog tests cover the authoritative case-insensitive title/authors/abstract/
  keywords search, quote removal, mixed-case and quoted queries, unrelated
  filter retention, and relevance/newest/oldest ordering.
- Notifications cover nullable-field conditional rendering, no fabricated
  alerts for empty/error responses, unread count, individual read with no
  PATCH for an already-read item, mark-all requests for unread items only, and
  safe action navigation for only validated root-relative `/research/` paths
  (including query/hash handling and rejected malformed/external/bypass forms),
  plus the approved programmatic read/unread semantics: successful individual
  mark-read and mark-all change the affected state to read, while failures for
  either operation preserve the prior unread state and make no false read
  announcement.
- Dashboard tests cover the 2800 ms toast lifetime and the Statistician initial
  `[true, true, false, false]` / 50% checklist state and recalculation.
- Responsive accessibility tests cover the named icon-only shelf buttons at
  1100px and below. These and the notification semantics are approved target
  remediations, not exact baseline-parity assertions.
- Direct loading and pathname `popstate` behavior are covered; tests must not
  assert unsupported query-only catalog back/forward reactivity.
- Vite document-denial tests use only a neutral synthetic document name.

## Completion Gate

UI parity is complete only when the Vue build, type check, lint, formatting,
component tests, backend regression tests, document-denial tests, and stylesheet
integrity gate pass; the React runtime and React-specific source are absent; and
the visual acceptance matrix has no unexplained regression. The two approved
accessibility remediations remain target improvements rather than exact baseline
parity assertions.
