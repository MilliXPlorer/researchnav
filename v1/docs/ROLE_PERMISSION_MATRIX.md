# ResearchNAV Role–Permission Matrix

Generated: 2026-08-18 (Week 3, August 17–21). Companion to `docs/REQUIREMENTS.md`
and `docs/GANTT_GAP_ANALYSIS.md`.

## Roles

| Legacy `users.role` | Canonical `user_roles.slug` (identity) | Persona |
|---|---|---|
| `researcher` | `researcher` | Researcher (submits and tracks research) |
| `instructor` | `research_instructor` | Research Instructor (class sections, review, reports) |
| `adviser` | `research_adviser` | Research Adviser (advisees, review, validation) |
| `panel` | `research_panelist` | Research Panelist (defense evaluations) |
| `statistician` | `statistician` | Statistician (methodology sign-off) |
| `coordinator` | `research_office` (identity only) | Research Coordinator (program operations) |
| `librarian` | `librarian` | Librarian (repository metadata, retention) |
| `research-office` | `research_office` | Research Office Personnel (office authority) |
| `academics` | `research_office` (identity only) | Academics (library and recommendations) |
| `admin` | `administrator` | System Administrator (broad authority) |

## Coordinator resolution (decision, 2026-08-18)

`coordinator` is a legacy persona, not a distinct canonical role: its canonical
identity maps to `research_office` (same as `research-office` and `academics`),
but **authority is assigned per legacy role string**, never inherited from the
canonical mapping.

Consequences, now enforced at both the route and service layers:

- Coordinators use the coordinator workspace (`/api/coordinator/*`:
  schedules, duplicate flags, adviser load, program reports, instructor
  provisioning) and the program dashboard sections.
- Coordinators must **not** use office workspace routes (`/api/office/*`:
  compliance decisions, account management, privacy logs, office reports).
  This was previously reachable through canonical-slug matching; the
  `office.authority` middleware now mirrors `DomainAuthorization::isOffice()`
  and returns `403 ROLE_NOT_AUTHORIZED`. Same for `academics`.
- `DomainAuthorization::isOffice()` remains the single service-level authority
  check (review, archive, upload, review-assignment mutation).
- Naming: documentation and UI must present the persona "Research Coordinator"
  and the distinct "Research Office Personnel"; the canonical slug
  `research_office` is never used to grant office authority.
- Regression tests: `ReviewAuthorizationTest` (`isOffice` + office-route 403
  for coordinator/academics, 200 for research-office/admin).

## Permission matrix

`Y` = allowed, `R` = read/self only, `–` = denied. "Self" means documents the
actor owns; "assigned" means an active `research_review_assignments` row.
Guests (no session) have no panel; the public repository is the only guest
surface. All authenticated roles can read notifications (`/api/notifications`).

| Capability | researcher | instructor | adviser | panel | statistician | coordinator | librarian | research-office | academics | admin |
|---|---|---|---|---|---|---|---|---|---|---|
| Public repository browse/detail/similarity (sessionless) | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y |
| Create/edit/submit/resubmit own drafts | Y | – | – | – | – | – | – | – | – | – |
| Upload files to own documents | Y | R(own) | – | – | – | – | – | Y* | – | Y |
| Run similarity check on own documents | Y | Y(assigned) | Y(assigned) | – | – | – | – | Y | – | Y |
| View document + monitoring + feedback + revisions | R(self) | R(assigned) | R(assigned) | R(assigned) | R(assigned) | – | – | Y | – | Y |
| Feedback comments and revisions on a document | R(self) | R(assigned) | R(assigned) | – | – | – | – | Y | – | Y |
| Title validation decisions | – | Y(assigned) | Y(assigned) | – | – | – | – | Y | – | Y |
| Review assignment replacement | – | – | – | – | – | – | – | Y | – | Y |
| Start review workflow (`under_review`) | – | Y(assigned) | Y(assigned) | – | – | – | – | Y | – | Y |
| Grant final research approval (`approved`) | – | – | – | – | – | – | – | Y | – | Y |
| Archive approved research | – | – | – | – | – | – | – | Y | – | Y |
| Class sections CRUD + members + documents | – | Y(own sections) | – | – | – | – | – | – | – | – |
| Class reports / similarity overview / students / title proposals | – | Y | – | – | – | – | – | – | – | – |
| Advisee list / pending reviews / feedback history / similarity alerts | – | – | Y(advisees) | – | – | – | – | – | – | – |
| Defense schedules CRUD | – | Y | – | – | – | Y | – | – | – | – |
| Panel assignments / schedule / evaluations / history | – | – | – | Y(assigned) | – | – | – | – | – | – |
| Methodology queue / checklist / sign-off / return / signoffs | – | – | – | – | Y(assigned) | – | – | – | – | – |
| Instructor provisioning + program reports + duplicate flags + adviser load | – | – | – | – | – | Y | – | – | – | – |
| Catalog / archiving queue / metadata standards / metadata reviews / retention logs | – | – | – | – | – | – | Y | – | – | – |
| Office compliance / users / privacy logs / office reports | – | – | – | – | – | – | – | Y | – | Y |
| Academics categories read / library CRUD / recommendations | – | – | – | – | – | – | – | – | Y | – |
| Categories create/update | – | – | – | – | – | – | – | – | – | Y |
| Admin users / coordinator provisioning / audit logs / system status | – | – | – | – | – | – | – | – | – | Y |
| Saved library items (public repository bookmarks) | – | – | – | – | – | – | – | – | Y | – |

\* `research-office` may upload `final_manuscript`/`attachment` to approved
documents only (office archive support); admins have the same rule.

## Enforcement points

- Route authorization: `EnsureRole` (legacy string **or** canonical slug),
  `EnsureActiveAccount`, `EnsureActiveAdministrator`, and the new
  `office.authority` middleware (legacy `research-office` string or active
  administrator only).
- Service authorization: `DomainAuthorization` (`isActiveAccount`,
  `isActiveAdministrator`, `hasAnyRole`, `isReviewer`, `isOffice`,
  `isAssignedReviewer`, `canReview`) used by ResearchService,
  ReviewAssignmentService, DocumentService, SimilarityService, and the domain
  controller base.
- Model policies exist for ResearchDocument, DocumentFile, FeedbackComment,
  Revision, TitleValidation. Policies for the 2026-08-18 workflow tables are
  still pending; those controllers rely on route and service checks.

## Test coverage

- `ReviewAuthorizationTest` — compatibility roles never gain office
  privileges; owner-only draft control; assigned-only review; office-route
  enforcement.
- `RoleWorkspaceApiTest`, `RoleWorkspaceApiSecondTest`, `ApiContractTest`,
  `DashboardTest` — per-role workspace route access, cross-role denial.
- Week 3E extends this into a dedicated matrix test (guests, inactive
  accounts, every role against every route group).
