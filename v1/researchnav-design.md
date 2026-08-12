# RESEARCHNAV — UI/UX Design Specification

**System:** A Web-Based Research Repository System with Automated Title Similarity Detection (TF-IDF + Cosine Similarity)
**Institution:** Tangub City Global College
**Scope of this document:** design system (color, type, layout), the public landing page, and a dedicated dashboard design for each system actor.

---

## 1. Design System

### 1.1 Color Palette — "Reading Room" (White + Dark Green)

| Token | Hex | Role |
| --- | --- | --- |
| `canopy` | `#10331F` | Primary dark green — top bar, sidebar background, primary text on white in headings |
| `moss` | `#1F5C3D` | Secondary green — links, active nav state, primary buttons |
| `fern` | `#5FA37D` | Accent green — hover states, secondary buttons, chips, low-range similarity fill |
| `paper` | `#FFFFFF` | Base background — page canvas, cards |
| `mist` | `#F3F7F4` | Surface — card backgrounds, table stripes, input fields |
| `ink` | `#172019` | Primary body text |
| `slate` | `#5B6660` | Secondary / muted text, placeholders, timestamps |
| `amber` | `#D98E36` | Warning — flagged similarity (70%+), pending review |
| `rust` | `#B3432B` | Destructive — rejected, error states, overdue |

Usage rule: **white dominates the canvas**; dark green is used with intent (navigation, headings, primary actions, data emphasis) rather than as a background wash across large surfaces. This keeps long reading surfaces (abstracts, tables of results) legible, the way a library reading room stays bright while the shelving and signage carry the color identity.

### 1.2 Typography

| Role | Typeface | Used for |
| --- | --- | --- |
| Display / Serif | **Source Serif 4** | Research titles, hero headline, paper titles anywhere they appear in results or archive views — gives the repository an academic, journal-like register (echoes how Google Scholar sets citation titles in serif) |
| UI / Sans | **Inter** | Navigation, buttons, form labels, body UI copy |
| Data / Mono | **IBM Plex Mono** | Similarity percentages, document IDs, dates, submission codes, revision numbers |

Type scale: `32/40` hero, `24/32` page title, `18/28` section title, `15/22` body, `13/18` caption/meta.

### 1.3 Layout Concept — "Reading Room"

The product is modeled as a library reading room rather than a generic admin panel:

- A **central catalog column** (search bar + result cards) is the spine of every browsing surface — landing page, repository search, dashboards' "related studies" panels.
- A **left shelf rail** (icon + label sidebar, `canopy` background) is the constant wayfinding element across every logged-in dashboard.
- A **top reading lamp bar** (thin `paper` bar, 64px, bottom border in `mist`) holds global search, notifications, and account — kept quiet so the catalog stays the focus.

```
┌─────────────────────────────────────────────────────────────┐
│  ⌂ ResearchNAV      [ 🔍 search the repository… ]   🔔  👤  │  ← Reading lamp bar (paper, 64px)
├───────────┬─────────────────────────────────────────────────┤
│  SHELF    │                                                 │
│  RAIL     │              MAIN CATALOG / WORKSPACE            │
│  (canopy) │                                                 │
│           │                                                 │
│  ▸ Home   │                                                 │
│  ▸ ...    │                                                 │
│  ▸ ...    │                                                 │
└───────────┴─────────────────────────────────────────────────┘
```

Every role dashboard below reuses this shell; only the shelf-rail items and the main workspace content change.

### 1.4 Signature Element — The Similarity Ring

The one motif carried through the entire product is the **Similarity Ring**: a small circular radial gauge (not a flat progress bar) that visualizes a title's similarity score wherever it appears — search results, submission review, panel evaluation, coordinator reports.

```
      ___
    /     \        0–39%   → ring fills in `fern`   (Low)
   |  42%  |       40–69%  → ring fills in `moss`   (Moderate)
    \ ___ /        70–100% → ring fills in `amber`, ring pulses once on load (High / Flagged)
```

The ring's three fill states map directly to the system's own similarity thresholds, so the interface teaches the scoring logic by how it looks, not just by a number.

### 1.5 Core Components

| Component | Spec |
| --- | --- |
| Primary button | `moss` fill, white text, 8px radius, `canopy` on hover |
| Secondary button | 1px `moss` border, `moss` text, `mist` fill on hover |
| Status chip | Pill, 12px text, background = 10% tint of status color (green=approved, amber=pending/flagged, rust=rejected, slate=draft) |
| Card | `paper` background, 1px `mist` border, 12px radius, 4px `canopy` left accent bar on hover for clickable cards |
| Table | `mist` header row, `canopy` header text, zebra striping in `mist` at 40% |
| Sidebar item (active) | `moss` background at 15% opacity, `fern` left indicator bar, `paper` text |

---

## 2. Landing Page (Public, Pre-Login)

**Purpose:** function like Google Scholar's homepage — search-first, minimal chrome, no login wall — with a single Google SSO entry point for anyone who wants to submit, monitor, or manage records.

```
┌───────────────────────────────────────────────────────────────────┐
│                         ResearchNAV                     [Sign in] │
│                                                                     │
│                                                                     │
│                     R E S E A R C H N A V                          │
│         Search Tangub City Global College's research               │
│                                                                     │
│      ┌───────────────────────────────────────────────┐  [Search]  │
│      │ 🔍  Search titles, authors, keywords…          │            │
│      └───────────────────────────────────────────────┘            │
│                                                                     │
│      All years ▾     All categories ▾     All institutes ▾        │
│                                                                     │
│   ──────────────────────────  or  ──────────────────────────       │
│                                                                     │
│              [ G  Continue with Google ]                            │
│                                                                     │
├───────────────────────────────────────────────────────────────────┤
│  Recently archived                                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │
│  │ Title (serif) │  │ Title (serif) │  │ Title (serif) │          │
│  │ Authors · Yr  │  │ Authors · Yr  │  │ Authors · Yr  │          │
│  │ [Abstract ▾]  │  │ [Abstract ▾]  │  │ [Abstract ▾]  │          │
│  └───────────────┘  └───────────────┘  └───────────────┘          │
├───────────────────────────────────────────────────────────────────┤
│  About · Institute of Computer Studies · Contact · Data Privacy    │
└───────────────────────────────────────────────────────────────────┘
```

**Sections**

1. **Header** — wordmark left, single `Sign in` link right (opens Google SSO, no separate ResearchNAV password by default).
2. **Hero search** — large centered search bar, `canopy` wordmark in Source Serif 4, subtext in `slate`. Filters (year / category / institute) sit directly under the bar as low-emphasis dropdown chips, mirroring how the study's respondents asked for filter-by-year and filter-by-category.
3. **Google SSO** — a single `Continue with Google` button below an "or" divider; this is also the entry point for Researchers, Advisers, Instructors, Panels, Statisticians, Coordinators, Librarian, Research Office, and Academics — role is resolved after SSO by the account's assigned role in `USER_ROLES`, not by a separate login form per role.
4. **Recently archived** — three-card row, serif titles, similarity/relatedness not shown here (this is a public catalog, not a review surface).
5. **Guest search behavior** — search and abstract/metadata viewing require no account; document download and submission are gated behind sign-in, consistent with the system's guest-access rule.
6. **Footer** — institutional links, Data Privacy Act notice/terms link (per the "terms and conditions before login" requirement raised in interviews).

---

## 3. Role Dashboards

All dashboards share the Reading Room shell (§1.3). Each section below lists the shelf-rail navigation, the main workspace widgets, and a wireframe of the workspace only.

---

### 3.1 Research Student (Guest)

**Who:** anonymous or lightly-authenticated students browsing the repository before or without submitting their own research. Primary need identified in interviews: fast keyword search, filter by year/category, and confidence that a topic isn't a duplicate.

**Shelf rail:** Search · Browse by Category · Browse by Year · About

**Workspace — Search & Browse**

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 [ management system for small business_______ ]  Go   │
│ Year: 2020–2026 ▾   Category: Web-based ▾   Institute ▾  │
├─────────────────────────────────────────────────────────┤
│ 128 results                                Sort: Relevance ▾│
│ ┌───────────────────────────────────────────────────┐   │
│ │ "Inventory Management System for..."   (serif)     │   │
│ │ Dela Cruz, Reyes · 2024 · BSCS · Web-based          │   │
│ │ Abstract preview text truncated to two lines…       │   │
│ │ [ View metadata ]  🔒 Sign in to download           │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────┐   │
│ │ ...next result card...                              │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** keyword search with autosuggest, year/category/institute filters, abstract-only preview, "sign in to download / submit" prompt on any gated action. No Similarity Ring shown here — the ring is a review tool, not a public-facing score.

---

### 3.2 Researcher

**Who:** the student who owns a research submission — writes the title, uploads drafts, tracks revisions, checks similarity before defense.

**Shelf rail:** My Dashboard · My Submissions · New Submission · Similarity Check · Related Studies · Notifications

**Workspace — My Dashboard**

```
┌─────────────────────────────────────────────────────────┐
│ Welcome back, Filjoy                                     │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐                │
│ │ Status    │ │ Similarity│ │ Revisions │                │
│ │ Under     │ │   (42%)   │ │  requested│                │
│ │ Review    │ │  ring     │ │     1     │                │
│ └───────────┘ └───────────┘ └───────────┘                │
├─────────────────────────────────────────────────────────┤
│ My Submission                                             │
│ "RESEARCHNAV: A Web-Based Research Repository System..." │
│ Submitted: Jun 12  ·  Adviser: Prof. X  ·  IMRAD attached │
│ [ Upload revision ]   [ View adviser comments ]           │
├─────────────────────────────────────────────────────────┤
│ Related studies found (Similarity Ring per row)           │
│  ⊙38%  "Digital Archiving System for..."      [View]     │
│  ⊙24%  "Institutional Repository Platform..." [View]     │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** status chip (Draft / Submitted / Under Review / Revision Required / Approved / Archived), Similarity Ring summary card, revision timeline, related-studies list ranked by Cosine Similarity, upload-a-revision action, adviser comment thread.

---

### 3.3 Research Adviser

**Who:** guides one or more researchers, reviews drafts, leaves comments, decides if similarity/quality is acceptable to proceed.

**Shelf rail:** My Advisees · Pending Reviews · Similarity Alerts · Feedback History · Notifications

**Workspace — Pending Reviews**

```
┌─────────────────────────────────────────────────────────┐
│ Pending Reviews (4)                                       │
│ ┌───────────────────────────────────────────────────┐   │
│ │ Advisee: J. Santos          ⊙ 74% AMBER — Flagged   │   │
│ │ "Smart Attendance System using..."                  │   │
│ │ [ Compare with matched title ]  [ Request revision ]│   │
│ │ [ Approve to proceed ]                               │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────┐   │
│ │ Advisee: M. Lopez            ⊙ 31% — Low            │   │
│ │ "Web-based Grading Portal for..."                    │   │
│ │ [ Add comment ]  [ Approve ]                         │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** flagged-first queue (amber rings surfaced above the rest), side-by-side title/abstract compare for flagged pairs, comment composer, approve/request-revision actions, per-advisee history.

---

### 3.4 Research Instructor

**Who:** teaches the research subject/class; oversees a whole class section's title proposals, not just one advisee — needs a roster view.

**Shelf rail:** My Sections · Title Proposals · Similarity Overview · Class Reports · Notifications

**Workspace — Title Proposals (Class View)**

```
┌─────────────────────────────────────────────────────────┐
│ Section: BSCS 4A                    Filter: All statuses ▾│
├───────────┬───────────────────────┬──────┬────────────────┤
│ Group      │ Title                 │ ⊙    │ Status         │
├───────────┼───────────────────────┼──────┼────────────────┤
│ Group 1    │ Inventory System for…│ 22%  │ Approved       │
│ Group 2    │ Smart Attendance…     │ 74%  │ Revision Req.  │
│ Group 3    │ Learning Management…  │ 51%  │ Under Review   │
├───────────┴───────────────────────┴──────┴────────────────┤
│ [ Export class similarity report ]  [ Bulk remind group ]  │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** class roster table with inline Similarity Ring column, sortable by score/status, bulk actions (remind, export), a class-level similarity distribution chart (low/moderate/high counts) for spotting duplicate clustering early — directly answers the "title hearing" duplication problem raised in interviews.

---

### 3.5 Research Panel

**Who:** evaluates proposals/defenses; needs read access to the full manuscript, prior comments, and similarity data at the moment of defense — not submission management.

**Shelf rail:** Defense Schedule · Assigned Manuscripts · Evaluation Form · Panel History

**Workspace — Assigned Manuscript**

```
┌─────────────────────────────────────────────────────────┐
│ Defense: Jul 14, 9:00 AM — Room 302                        │
│ "Smart Attendance System using..."           ⊙ 74% AMBER  │
│ Researcher: J. Santos   Adviser: Prof. Y                   │
│ [ Read full manuscript ]  [ View related/matched titles ]  │
├─────────────────────────────────────────────────────────┤
│ Evaluation Form                                             │
│ Originality ★★★★☆   Methodology ★★★☆☆   Clarity ★★★★★     │
│ Comments: [                                             ]  │
│ [ Submit evaluation ]                                       │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** defense-day agenda list, read-only manuscript viewer, similarity + matched-title reference panel, structured evaluation form (criteria + comment box), submit-once evaluation lock.

---

### 3.6 Statistician

**Who:** reviews the statistical treatment / methodology section specifically, signs off before a study can proceed to defense or archiving.

**Shelf rail:** Review Queue · Methodology Checklist · Sign-offs Issued · Notifications

**Workspace — Review Queue**

```
┌─────────────────────────────────────────────────────────┐
│ Awaiting statistical review (3)                            │
│ ┌───────────────────────────────────────────────────┐   │
│ │ "Web-based Grading Portal for..."                   │   │
│ │ Design: Descriptive-Developmental                   │   │
│ │ Sample: n=24, purposive sampling                     │   │
│ │ Instrument: 5-pt Likert (ISO/IEC 25010)               │   │
│ │ Checklist: ☑ Design fit  ☑ Sample size  ☐ Instrument │   │
│ │ [ Request clarification ]   [ Sign off ]             │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** methodology checklist (design fit, sampling method, instrument validity, analysis plan), sign-off action that unlocks the next workflow stage, clarification-request thread back to the researcher/adviser.

---

### 3.7 Research Coordinator

**Who:** oversees the research program end-to-end across sections/advisers — schedules title hearings/defenses, tracks program-wide throughput, resolves cross-section duplicate flags.

**Shelf rail:** Program Overview · Schedules · Duplicate Flags · Adviser Load · Reports · Notifications

**Workspace — Program Overview**

```
┌─────────────────────────────────────────────────────────┐
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐               │
│ │ Active │ │ Flagged│ │ Defenses│ │ Archived│              │
│ │  86    │ │  12    │ │  this wk│ │  this yr│              │
│ │        │ │ ⊙70%+  │ │   6    │ │   214   │              │
│ └────────┘ └────────┘ └────────┘ └────────┘               │
├─────────────────────────────────────────────────────────┤
│ Cross-section duplicate flags                              │
│  ⊙81%  BSCS 4A "Smart Attendance..." ↔ BSIT 3B "Smart..." │
│  [ Notify both advisers ]  [ Escalate to Research Office ] │
├─────────────────────────────────────────────────────────┤
│ Defense calendar (week view)                    [+ Schedule]│
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** program-wide KPI cards, cross-section/cross-adviser duplicate resolution list (the case a single instructor or adviser can't see because it spans classes), defense scheduling calendar, adviser workload distribution.

---

### 3.8 Librarian

**Who:** owns the archive itself — metadata standards, cataloging, retention, and final publish-to-repository step once a paper is approved.

**Shelf rail:** Archiving Queue · Repository Catalog · Metadata Standards · Retention & Compliance · Notifications

**Workspace — Archiving Queue**

```
┌─────────────────────────────────────────────────────────┐
│ Ready to archive (5)                                       │
│ ┌───────────────────────────────────────────────────┐   │
│ │ "Inventory System for Small Business"                │   │
│ │ Metadata: Title ✔  Authors ✔  Abstract ✔  Keywords ✔ │   │
│ │ File: manuscript.pdf (12.4 MB)  Category: Web-based  │   │
│ │ [ Edit metadata ]   [ Publish to repository ]         │   │
│ └───────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│ Repository Catalog                          [ + New entry ]│
│ Search catalog…                Filter: Category / Year ▾   │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** metadata completeness checklist per record, publish/unpublish control, catalog search/edit table, retention & versioning log (superseded revisions kept vs. archived final).

---

### 3.9 Research Office (CAES)

**Who:** the institutional administrative office — compliance, cross-program reporting, account/role governance, and the Data Privacy/consent side of the system.

**Shelf rail:** Institutional Overview · Compliance Review · User & Role Management · Reports & Exports · Data Privacy Log · Notifications

**Workspace — Compliance Review**

```
┌─────────────────────────────────────────────────────────┐
│ Pending compliance review (7)                               │
│ ┌───────────────────────────────────────────────────┐   │
│ │ "Learning Management System for..."                  │   │
│ │ Format ✔   Required attachments ✔   Consent forms ✔  │   │
│ │ [ Endorse for archiving ]   [ Return for correction ]│   │
│ └───────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│ Institutional Reports                                        │
│ [ Similarity trend report ]  [ Submission volume by dept. ] │
│ [ User activity export ]     [ Data privacy consent log ]   │
├─────────────────────────────────────────────────────────┤
│ User & Role Management                        [ + Add user ]│
│ Search users…    Role: All ▾    Status: All ▾               │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** repository compliance checklist (format, attachments, consent), one-click report generation (similarity trends, submission volume, activity, consent log — matching the evaluation's ISO/IEC 25010 reporting needs), user/role admin table with activate-deactivate controls, Data Privacy Act consent log for auditability.

---

### 3.10 Academics (Faculty-at-Large)

**Who:** faculty outside the immediate advising chain who use the repository for their own scholarship, cross-referencing, or curriculum research — broader access than a guest, but not a review role.

**Shelf rail:** Search · My Library (saved/bookmarked) · Browse by Category · Notifications

**Workspace — My Library**

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 [ search the repository_______________ ]        Go     │
├─────────────────────────────────────────────────────────┤
│ Saved (14)                              Sort: Recent ▾     │
│ ┌───────────────────────────────────────────────────┐   │
│ │ ★ "Digital Archiving System for..."                  │   │
│ │   Reyes, 2023 · [ Download PDF ]  [ Remove ]         │   │
│ └───────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│ Suggested for you (based on saved items)                    │
│  ⊙61%  "Institutional Repository Platform..."               │
└─────────────────────────────────────────────────────────┘
```

**Key widgets:** full search + download privileges (unlike the guest role), bookmark/save-to-library, lightweight "suggested related" list driven by the same similarity engine but framed as recommendations rather than duplicate-flagging.

---

## 4. Shared UI Patterns

**Status chip legend** (used identically across every dashboard)

| Chip | Color | Meaning |
| --- | --- | --- |
| Draft | `slate` tint | Not yet submitted |
| Submitted | `moss` tint | In queue, unreviewed |
| Under Review | `fern` tint | Being read by adviser/instructor/panel |
| Revision Required | `amber` tint | Sent back with comments |
| Approved | `moss` solid | Cleared to proceed / archive |
| Archived | `canopy` tint | Published to repository |
| Rejected | `rust` tint | Not accepted |

**Similarity Ring states** — identical rendering rules everywhere it appears (§1.4): `fern` 0–39%, `moss` 40–69%, `amber` 70–100% with a single pulse on first render to draw attention without becoming a persistent animation.

**Notifications drawer** — same right-side slide-over on every role, grouped by Today / This Week / Earlier, each item routes to the exact record it references.

---

## 5. Accessibility & Responsive Notes

- Text contrast: `ink` on `paper`/`mist` and `paper` on `canopy`/`moss` both meet WCAG AA at body size.
- All Similarity Rings carry the percentage as text, never color alone, for colorblind-safe reading.
- Shelf rail collapses to a bottom tab bar (Home / Search / Dashboard / Notifications / Account) below 768px; dashboard tables convert to stacked cards.
- Keyboard focus is visible on every interactive element (2px `moss` outline, 2px offset).
- Motion is limited to the single similarity-ring pulse and a 150ms fade on route change; reduced-motion preference disables both.
