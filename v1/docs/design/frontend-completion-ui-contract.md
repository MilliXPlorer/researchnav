# Frontend Completion UI Contract

Parent plan: [PR #8](https://github.com/MilliXPlorer/researchnav/pull/8)

## Objective

Complete the existing ResearchNAV frontend without redesigning it. Preserve the
Reading Room visual system, current shell, existing components, Google SSO,
session behavior, and backend authorization boundary.

## Preserved UI

- Keep the existing colors, typography, spacing, cards, tables, buttons,
  dialogs, notification drawer, sidebar, mobile tabs, and responsive breakpoints.
- Keep the current History API routing. Do not add a router or state library.
- Reuse existing role pages and shared components before adding new components.
- Every visible navigation item must render a heading and a non-blank state.

## Role Navigation

Implementation remains sequential in the user-requested order:

1. Researcher
2. Research Instructor
3. Research Adviser
4. Statistician
5. Research Panelist
6. Research Coordinator
7. Research Office
8. Librarian
9. Administrator
10. Guest/Public

Existing labels and defaults are preserved unless they currently lead to a
blank page. Instructor Title Proposals, Adviser Pending Reviews, Statistician
Review Queue, Panelist Assigned Manuscripts, Research Office Compliance Review,
and Librarian Archiving Queue must have reachable, visible content. Unsupported
Administrator destinations must be removed, not replaced with speculative
forms. Retain only System Overview, Access Requests, Coordinator Accounts, All
Users, Audit Logs, and the existing settings status surface renamed System
Status.

Academics remains an existing compatibility persona outside the mandated role
implementation order. Preserve Search, My Library, and Browse by Category and
include them in Guest/Public compatibility and final role-navigation checks.

Coordinator and Research Office navigation remain separate. A coordinator must
never receive Research Office controls. Unknown roles render "Workspace
unavailable for this role" and never default to another role.

## Data States

Each data-backed destination keeps its heading and supports:

- Loading with `aria-busy="true"` or `role="status"`.
- Live data using existing cards, tables, filters, and controls.
- A destination-specific empty state for a successful empty response.
- An in-context error with Retry for a failed request.
- An in-context contract error with Retry when a successful response does not
  match the required envelope; changed read models validate required arrays,
  objects, and pagination before rendering.
- A clearly labeled read-only fallback, when eligible, with the exact text
  "Demo data — read only".

Demo views hide or disable writes, uploads, decisions, saves, previews,
downloads, and links derived from mock identifiers. Retrying always attempts the
live API. Account or role changes clear previous live, mock, selected-record,
and mutation state.

Fallback is eligible only after a live `GET` fails because of a network error or
HTTP `5xx`, the exact endpoint/read model is on the default-deny allowlist, an
exact typed deterministic anonymized fixture exists, and the request was not
aborted. Fixtures use synthetic Demo/Sample identifiers and contain no action,
preview, or download URLs. Fallback is never used for writes, similarity POST
requests, authentication/session/profile, notifications, uploads, previews,
downloads, malformed successful responses, successful empty responses, or HTTP
`401`, `403`, `404`, `405`, or `429`. Tests must prove mock views issue no
mutation, preview, download, or mock-ID-derived detail request.

## Similarity Messaging

Similarity is decision support, not automatic plagiarism detection, approval,
or rejection. Preserve service-provided values and classifications and include
visible text in addition to color.

High-similarity results use the human-review message:

> High Similarity - Adviser Review Required

> This result has been flagged for adviser review. The system does not
> automatically reject the research.

When content analysis is unavailable, say so rather than inferring a score.
Similarity POST requests never use mock results.

## Responsive Behavior

- At 320px and 375px, retain the mobile bottom navigation, single-column
  content, approximately 40–44px touch targets, wrapped labels, and no page-level
  horizontal clipping.
- At 768px, retain the compact rail/menu pattern and ensure no destination is
  hidden by compact labels.
- At 1024px and 1440px, retain the existing rail behavior and centered
  workspace without clipped controls.
- Wide tables use a labeled horizontal scroll region instead of shrinking text.
- Filters stack where needed; dialogs and drawers scroll internally.
- At 200% zoom, content, controls, and focus indicators remain reachable; run a
  forced-colors sanity check for focus, status, and active navigation.
- Preserve the existing reduced-motion behavior.

## Accessibility

- Keep the skip link and one `main` workspace landmark.
- Every destination has a programmatic `h1`.
- Active navigation uses `aria-current="page"`.
- Inputs have labels and errors are associated with their fields.
- Blocking errors use `role="alert"`; loading and non-blocking updates use
  status semantics.
- Dialogs retain accessible names, focus containment, Escape handling, and
  focus restoration.
- Every destination change moves focus to its heading, including desktop rail,
  mobile Workspace selection, Home, direct URL, and back/forward navigation.
- The mobile Workspace menu closes on Escape and close-without-selection
  restores focus to its trigger.
- Similarity and status meaning never relies on color alone.

## Acceptance Checks

- Every retained desktop, compact, and mobile navigation item renders content.
- Successful empty responses never become demo data.
- Demo records expose no active server mutation or file action.
- Authentication, authorization, validation, throttling, and write failures
  remain truthful and never fabricate success.
- Role menus contain no unrelated-role controls.
- Existing GSSO, session, profile, and sign-out behavior remains unchanged.
- Existing consent and active, invited, blocked, and access-request gating
  remains unchanged; protected authentication/access files remain no-touch.
- Keyboard and responsive checks cover the sidebar, mobile workspace menu,
  tables, notification drawer, metadata dialog, and mutation dialogs.
- Role isolation applies to page controls and `/research/{id}` deep links as
  well as navigation labels.
