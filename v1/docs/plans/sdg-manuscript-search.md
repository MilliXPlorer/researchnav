# SDG Manuscript Search Plan

## Plan status

- **Artifact:** canonical implementation plan only. This document does not authorize product-code edits, staging, commits, pushes, pull requests, migrations, backfills, or deployment.
- **Plan worktree:** `C:\Users\MURALL~1\AppData\Local\Temp\opencode\researchnav-plan-sdg`
- **Plan branch:** `plan/sdg-manuscript-search`
- **Approved base:** `322a3afba37284010b152a76782d4b078f3b7b53` (`chore/researchnav-current-baseline`)
- **Parent PR policy:** create a new Draft parent Plan PR from `plan/sdg-manuscript-search` to `chore/researchnav-current-baseline`. Draft PR #11 belongs to the parent completion workflow and must not be reused, retargeted, edited, or treated as this feature's control plane.
- **Active application:** `v1/frontend` (React/TypeScript) and `v1/backend` (Laravel/PHP), with bounded use of the existing ready manuscript-search projection. Legacy `v1/server` is out of scope.
- **Reserved migration:** `v1/backend/database/migrations/2026_09_07_000050_create_sdg_classification_tables.php`. Sequence `000049` already exists; `000050` is the next valid sequence on the approved base. Re-scan immediately before implementation. If `000050` then exists, stop and update this plan rather than creating a collision or renaming an applied migration.

## Objective

Let public catalog visitors narrow archived research to one of the 17 United Nations Sustainable Development Goals (SDGs), using only explicit SDG declarations already present in `manuscript_search_documents.body_text` rows whose `extraction_status` is `ready`. Persist the derived classification separately, expose a sessionless `GET /api/sdgs` taxonomy and a validated integer `sdg` filter on `GET /api/repository`, keep the React selection in the catalog URL, and backfill public records from 2020 through 2025 through the existing reindex command.

## Scope and non-goals

### In scope

1. An immutable application taxonomy containing all 17 goal numbers and official short titles.
2. Deterministic detection of explicitly written SDG markers in ready manuscript body text.
3. Separate, persistent classification-run and per-goal detection rows tied to a manuscript-search projection.
4. Classification refresh and removal coordinated with the projection's ready, invalidated, failed, unsupported, no-source, ineligible, source-change, and deletion lifecycle.
5. A public, sessionless `GET /api/sdgs` endpoint.
6. A single `sdg` integer query filter on `GET /api/repository` that composes with current search, category, and year filters.
7. An accessible, URL-backed, single-select SDG control on `/catalog` populated from `/api/sdgs`.
8. An inclusive 2020-2025, idempotent, resumable backfill through `repository:reindex-manuscripts`.

### Explicit non-goals

- OCR, scanned-image interpretation, new file parsing, direct file reads by the detector, or extraction from a non-ready projection.
- Inferring an SDG from title, abstract, keywords, category, author, official goal-name text alone, topic similarity, nearby context, embeddings, an LLM, an external service, or a semantic/keyword model.
- Confidence scores, evidence snippets, declaration offsets, raw match text, manuscript body text, source paths, hashes, extractor errors, or internal classification metadata in any public response.
- Multi-select, OR/AND goal composition, SDG badges on records, admin editing, manual overrides, or a new classification review workflow.
- Any change to similarity inputs, candidate selection, TF-IDF/cosine/FastText processing, weights, thresholds, score precision, classification labels, ranking, persistence, public similarity request/response fields, or similarity UI behavior.
- Changes under `v1/server`, `v1/algorithm`, authentication, download authorization, or unrelated schema/documentation.

## Frozen functional and data contracts

### Explicit declaration grammar

`SdgDeclarationDetector` receives one string: the non-null `body_text` of a persisted `ManuscriptSearchDocument` whose status is `ready`. It returns unique goal integers in ascending order.

Recognize case-insensitively only a complete marker followed by one or more individually valid, canonical decimal integer tokens in the inclusive range 1-17:

- marker: `SDG`, `SDGs`, `Sustainable Development Goal`, or `Sustainable Development Goals`;
- marker boundaries: the marker must be a complete phrase, not part of a Unicode letter or decimal-digit run. A bare number requires one or more horizontal whitespace characters after the marker. An introducer may follow that whitespace, and only `#` may instead be directly adjacent to the marker; `SDG13` and `SDGNo. 13` are not markers;
- optional number introducer: `#`, `No.`, `No`, `Nos.`, or `Nos`, followed by zero or more horizontal whitespace characters and then a number token;
- list separators after the first number: comma, slash, ampersand, or the word `and`. Punctuation separators permit surrounding horizontal whitespace; `and` must be a complete word with horizontal whitespace on both sides. Newlines are not whitespace in this grammar. A repeated complete marker may begin another declaration;
- optional punctuation and an official title after a recognized number do not create an additional detection.

Each number token is exactly `1` through `17`, with no leading zero, sign, decimal point, adjoining Unicode letter/decimal digit, or range connector. Whole-token boundaries prevent goal 1 from matching 10-17. Ranges are never supported: hyphen, en dash, em dash, and `to` are not separators, and neither endpoint of a conjoined range such as `SDGs 3-5`, `SDGs 3–5`, or `SDGs 3 to 5` is detected. Do not salvage a valid-looking substring from a malformed or conjoined token such as `SDG13`, `SDG 4th`, `SDG 04`, or `SDG 4.0`.

List parsing is safely partial and deterministic: retain every independently valid 1-17 token reached through the marker/list grammar, but ignore malformed, out-of-range, trailing, or conjoined tokens without inference. Thus `SDGs 3, 18 and 5` detects 3 and 5, while `SDGs 3-5` detects neither range endpoint; a later valid token after an allowed separator remains eligible. Duplicate declarations produce one detection. No surrounding-text interpretation is permitted.

Examples that detect: `SDG 4`, `SDG #13`, `SDG No. 6`, `SDGs 3, 4 and 5`, `Sustainable Development Goals 7 & 12`, and `SDG 4 (Quality Education)`. Examples that do not detect: `Goal 4`, `quality education`, `climate action`, `the goals include four outcomes`, `SDG 0`, `SDG 18`, `SDG 2025`, or a bare official goal title.

The detector version is an explicit configuration value. A version change makes an otherwise ready classification stale and causes deterministic reclassification from its existing ready body text; it never changes or reruns similarity.

### SDG taxonomy

The ordered public taxonomy is exactly:

| Number | Title                                   |
| -----: | --------------------------------------- |
|      1 | No Poverty                              |
|      2 | Zero Hunger                             |
|      3 | Good Health and Well-being              |
|      4 | Quality Education                       |
|      5 | Gender Equality                         |
|      6 | Clean Water and Sanitation              |
|      7 | Affordable and Clean Energy             |
|      8 | Decent Work and Economic Growth         |
|      9 | Industry, Innovation and Infrastructure |
|     10 | Reduced Inequalities                    |
|     11 | Sustainable Cities and Communities      |
|     12 | Responsible Consumption and Production  |
|     13 | Climate Action                          |
|     14 | Life Below Water                        |
|     15 | Life on Land                            |
|     16 | Peace, Justice and Strong Institutions  |
|     17 | Partnerships for the Goals              |

`GET /api/sdgs` returns `{"data":[{"number":1,"title":"No Poverty"}, ...]}` in numeric order. It is read-only and sessionless. It exposes no counts or document associations.

### Persistence contract

Migration `2026_09_07_000050_create_sdg_classification_tables.php` creates only the following additive objects and inserts the frozen 17-row taxonomy:

1. `sustainable_development_goals`: unsigned tiny integer `number` primary key and unique `title`; no mutation API.
2. `manuscript_sdg_classifications`: primary key, unique `manuscript_search_document_id` foreign key with cascade delete, `detector_version`, `projection_indexed_at` at microsecond precision, `classified_at` at microsecond precision, and timestamps. One row means the referenced ready projection was completely evaluated, including the valid result of zero detections.
3. `manuscript_sdg_detections`: primary key, `manuscript_sdg_classification_id` cascade foreign key, unsigned tiny integer `sdg_number` restricted foreign key to the taxonomy, timestamps, and a unique `(manuscript_sdg_classification_id, sdg_number)` key.

Use explicit index/constraint names below MariaDB's identifier limit. Do not add SDG columns or relations to `similarity_results`; do not add SDG columns to `research_documents` or `manuscript_search_documents`. Detection rows store only goal identity, never matched text, offsets, snippets, confidence, or body hashes.

Classification and replacement of its detection set occur in one database transaction while the projection is still ready. Freshness requires the classification's `detector_version` and `projection_indexed_at` to match the current ready projection. A projection with no current complete classification does not qualify for an SDG filter.

### Projection and backfill lifecycle

- A successful ready projection is classified from the exact `body_text` being persisted in the same projection workflow.
- A classification-only current-ready refresh is an explicit separate service method/path. It accepts only a persisted ready projection, reads its persisted `body_text`, and performs no source-file, storage, extractor, OCR, or network read. A missing/stale classification refreshed through this path reports the new `classified` reindex outcome.
- The existing reindex source-verification path remains unchanged. The command uses the classification-only path only for an already-current ready projection that needs classification; it does not use it to verify a source or to bypass the normal reindex path when that path requires source verification (including force, source-change, or non-ready cases).
- Invalidating or changing a projection, clearing body text, recording failed/unsupported/no-source status, making a document ineligible, deleting the projection, or deleting its document removes the classification and detections before they can be queried as current. Database cascades are defense in depth for projection deletion; explicit invalidation handles in-place status updates.
- A current ready projection with a current classification remains `skipped`. Repeated runs are idempotent and do not duplicate detections.
- Extend `repository:reindex-manuscripts` with validated `--year-from` and `--year-to` options (inclusive, 1901-2155, from not later than to), a `classified` output counter, and filtering before chunking. Existing `--document`, `--force`, `--retry-failed`, chunk bounds, purge, and failure exit semantics remain compatible.
- The production backfill command is `php artisan repository:reindex-manuscripts --year-from=2020 --year-to=2025 --retry-failed --chunk=100`. It may be rerun after a failure. It must not alter publication years, source files, extracted body text of current ready projections, or any similarity row.

### Public repository API

- Add nullable `sdg` validation to `GET /api/repository`: integer and `between:1,17`. Values such as `0`, `18`, decimals, arrays, booleans, and non-integer strings return the existing 422 validation envelope.
- When present, `sdg=N` restricts the existing public scope to documents having a ready manuscript-search projection, a current complete classification, and a detection for N. It composes conjunctively with `q`, author, keyword, category, exact/range year, pagination, and existing ordering.
- A document with explicit declarations for multiple goals appears under each corresponding single-goal request but appears at most once per request.
- Keep `PublicResearchDocumentResource` as the public field allowlist. Do not return goal detections on repository list/detail responses; the goal number is a filter input only.
- Do not add `sdg` to `POST /api/repository/similarity`. When both `q` and `sdg` are active in the UI, retain the existing similarity POST and intersect its authoritative ranked result with IDs from the filtered GET, preserving the similarity order exactly.

### Frontend URL and interaction contract

- Add one labeled select, `Filter by Sustainable Development Goal`, with `All Sustainable Development Goals` plus the 17 API-provided options formatted `SDG N — Title`.
- The selected value is the single URL parameter `sdg=N`. Selecting All deletes `sdg`; unrelated `q`, year, category, institute, and sort parameters remain intact. Initial valid URL state hydrates the select and triggers server filtering. Invalid/out-of-range URL values do not trigger a malformed API request and are normalized away.
- SDG joins the existing server-filter key and request cancellation/race handling. It is never applied as a client text match. With a submitted similarity query, use the current allowed-ID intersection and preserve backend ranking.
- Provide scoped taxonomy loading/failure/retry behavior without hiding otherwise usable catalog results. The select is keyboard accessible and is disabled only while its own options are unavailable.

## Requirement-to-evidence matrix

| Requirement                                  | Primary implementation evidence                            | Required test evidence                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit-only detection from ready body text | detector and classification services; projection lifecycle | positive grammar, malformed/mixed-list and whitespace/boundary negatives, no-range cases, negative inference/OCR/metadata, non-ready exclusion, all-17 parameterized tests                  |
| Isolated persistence                         | migration and three SDG models                             | schema, foreign keys, uniqueness, zero-detection classification, cascade/down-up tests on SQLite and MariaDB                                                                                |
| Lifecycle invalidation                       | projection service integration                             | ready, stale-version, source-change, pending, failure, no-source, unsupported, ineligible, and delete cases                                                                                 |
| Public taxonomy                              | sessionless route/controller/resource                      | exact 17 ordered rows, exact field allowlist, no session cookie/counts/associations                                                                                                         |
| Integer repository filter                    | controller validation and repository query                 | every invalid shape, single/multi-detection matches, public-scope isolation, composition, pagination, no duplicates                                                                         |
| URL-backed single select                     | API client and catalog page                                | initial/deep-link state, select updates/removal, filter fetch, q intersection order, invalid URL, loading/error/retry, accessibility                                                        |
| 2020-2025 backfill                           | reindex command and classification-only refresh path       | inclusive boundaries, validation before processing, persisted-current-body classification with no storage read, unchanged reindex source verification, idempotence, resume/failure counters |
| Privacy and similarity isolation             | resource allowlist and protected-path audit                | forbidden-field assertions, exact weighted-score regressions, protected diff audit                                                                                                          |

## Dependency graph

```text
E0 Entry gates
  |
  v
D1 Additive schema + models
  |
  v
D2 Explicit detector + classification persistence
  |\
  | +------------------------------+
  v                                v
D3 Projection lifecycle + CLI     A1 Public taxonomy + repository filter
  |                                |
  +---------------+----------------+
                  |
U1 Frontend API + URL-backed SDG filter (contract work may start after E0;
                  integration waits for A1)
                  |
                  v
I1 Combined integration, migration/backfill rehearsal, privacy/security,
   similarity regression, and ownership audit
                  |
                  v
O1 Operational documentation
                  |
                  v
X0 Exit gates / parent Plan PR ready for review
```

D1 and the frozen API contract are the only foundations. D2 depends on D1. D3 depends on D2. A1 depends on D1 and may develop in parallel with D2/D3, but it may not merge until lifecycle-currentness tests pass. U1 may develop against the frozen contract in parallel, but its child PR may not be accepted until A1 passes. I1 and O1 are strictly sequential after all implementation children merge into the plan branch.

## Worktree and merge rules

1. The Repository Agent creates every implementation worktree from the latest verified `plan/sdg-manuscript-search` commit after the new Draft parent Plan PR exists. Never copy uncommitted content from another checkout.
2. Each branch opens a child PR targeting `plan/sdg-manuscript-search`, not `chore/researchnav-current-baseline`, `main`, or PR #11. Merge children in dependency order.
3. One named owner controls every task and every writable path. A required edit outside an owner's list stops that workstream for reassignment; owners must not opportunistically edit shared files.
4. Every builder leaves changes unstaged. A Pre-Commit Tester must inspect the uncommitted diff and pass the listed checks before a Git Steward may explicitly stage owned paths. No `git add .`, force push, history rewrite, or worktree sharing.
5. Integration verification is read-only. Findings return to the owner of the affected path through the same build/test/steward loop.

## Ordered workstreams

### D1 — Additive SDG persistence

- **Owner:** Database Builder
- **Branch / isolated worktree:** `feat/sdg-persistence` / `C:\Users\MURALL~1\AppData\Local\Temp\opencode\researchnav-sdg-persistence`
- **Depends on:** E0
- **Exclusive file ownership:**
  - `v1/backend/database/migrations/2026_09_07_000050_create_sdg_classification_tables.php` (new)
  - `v1/backend/app/Models/SustainableDevelopmentGoal.php` (new)
  - `v1/backend/app/Models/ManuscriptSdgClassification.php` (new)
  - `v1/backend/app/Models/ManuscriptSdgDetection.php` (new)
  - `v1/backend/app/Models/ManuscriptSearchDocument.php`
  - `v1/backend/tests/Feature/Database/SdgClassificationSchemaTest.php` (new)
- **Tasks:**
  1. Re-scan migration names, reserve `000050`, and implement the three-table additive schema, explicit indexes/FKs, 17-row taxonomy, model casts/fillable fields, and only the projection-to-classification relations needed by later work.
  2. Make `down()` drop detections, classifications, then taxonomy, without touching manuscript, research, file, or similarity data.
  3. Test exact titles/order, uniqueness, zero-detection classification representation, relationship shape, cascade behavior, and migration down/up.
- **Entry gate:** base and migration sequence verified; no migration beyond `000049` conflicts.
- **Acceptance / exit gate:** schema tests pass on SQLite and a disposable MariaDB instance; identifiers fit MariaDB; `migrate --pretend` shows only additive SDG objects; no existing migration or non-owned model changed.
- **Focused commands (from `v1/backend`):**
  - `vendor/bin/pint --test database/migrations/2026_09_07_000050_create_sdg_classification_tables.php app/Models/SustainableDevelopmentGoal.php app/Models/ManuscriptSdgClassification.php app/Models/ManuscriptSdgDetection.php app/Models/ManuscriptSearchDocument.php tests/Feature/Database/SdgClassificationSchemaTest.php`
  - `php artisan test tests/Feature/Database/SdgClassificationSchemaTest.php`
  - `php artisan migrate --pretend --path=database/migrations/2026_09_07_000050_create_sdg_classification_tables.php`

### D2 — Deterministic declaration detection and persistence service

- **Owner:** SDG Detection Backend Engineer
- **Branch / isolated worktree:** `feat/sdg-declaration-detection` / `C:\Users\MURALL~1\AppData\Local\Temp\opencode\researchnav-sdg-detection`
- **Depends on:** D1 merged
- **Exclusive file ownership:**
  - `v1/backend/app/Services/SdgDeclarationDetector.php` (new)
  - `v1/backend/app/Services/ManuscriptSdgClassificationService.php` (new)
  - `v1/backend/config/researchnav.php`
  - `v1/backend/tests/Unit/SdgDeclarationDetectorTest.php` (new)
  - `v1/backend/tests/Feature/ManuscriptSdgClassificationServiceTest.php` (new)
- **Tasks:**
  1. Implement the frozen explicit grammar as deterministic local PHP, returning sorted unique integers and doing no I/O.
  2. Implement transactional classify/currentness/invalidate operations that accept only a persisted ready projection, record a complete zero-or-more result, replace detections atomically, and use the configured detector version plus projection index timestamp.
  3. Add table-driven positive/negative tests, one successful declaration per all 17 goals, list/dedup/case/punctuation tests, the frozen horizontal-whitespace and marker/number boundary rules, safe mixed-list partial detection, malformed trailing/conjoined-token rejection, no-range behavior, non-ready rejection, stale-version behavior, and no-evidence persistence assertions.
- **Entry gate:** D1 models and constraints are merged and stable.
- **Acceptance / exit gate:** all frozen examples pass; thematic words, metadata-only text, out-of-range/prefix numbers, malformed/conjoined tokens, ranges, and non-ready projections never classify; only individually valid tokens in a mixed list may classify; persisted rows contain no source text, match text, offsets, or scores.
- **Focused commands (from `v1/backend`):**
  - `vendor/bin/pint --test app/Services/SdgDeclarationDetector.php app/Services/ManuscriptSdgClassificationService.php config/researchnav.php tests/Unit/SdgDeclarationDetectorTest.php tests/Feature/ManuscriptSdgClassificationServiceTest.php`
  - `php artisan test tests/Unit/SdgDeclarationDetectorTest.php tests/Feature/ManuscriptSdgClassificationServiceTest.php`

### D3 — Projection lifecycle and 2020-2025 reindex backfill

- **Owner:** Projection Lifecycle Backend Engineer
- **Branch / isolated worktree:** `feat/sdg-projection-backfill` / `C:\Users\MURALL~1\AppData\Local\Temp\opencode\researchnav-sdg-projection`
- **Depends on:** D2 merged
- **Exclusive file ownership:**
  - `v1/backend/app/Services/ManuscriptSearchProjectionService.php`
  - `v1/backend/app/Console/Commands/ReindexManuscripts.php`
  - `v1/backend/tests/Feature/ManuscriptSearchTest.php`
  - `v1/backend/tests/Feature/SdgBackfillCommandTest.php` (new)
- **Tasks:**
  1. Invoke classification only for ready text and invalidate it on every stale/non-ready/purge path without weakening existing locking or source verification.
  2. Add and use an explicit classification-only current-ready refresh method/path for a missing/stale classification. It operates only on the persisted ready projection/body and performs no source-file or storage read, extraction, OCR, or network I/O; retain skip semantics for a current classification and leave the existing reindex source-verification path unchanged.
  3. Add inclusive year options and validation, a `classified` outcome/counter, idempotence, bounded chunking, and resumable failure behavior while preserving all current command options and schedule compatibility.
  4. Cover ready, source race/change, extractor-version change, detector-version change, pending, failed, unsupported, no-source, ineligible, deletion, zero-detection, and repeated-run cases.
- **Entry gate:** D2 service contract and tests pass.
- **Acceptance / exit gate:** no stale detection survives loss of ready state; no detector call reads a file or non-ready body; the classification-only current-ready refresh makes no source-file/storage read; existing reindex source verification retains its current behavior; 2019/2026 records are excluded from the requested backfill while 2020 and 2025 are included; current ready rows are classified without extraction; command can safely resume and remains nonzero on extraction failure.
- **Focused commands (from `v1/backend`):**
  - `vendor/bin/pint --test app/Services/ManuscriptSearchProjectionService.php app/Console/Commands/ReindexManuscripts.php tests/Feature/ManuscriptSearchTest.php tests/Feature/SdgBackfillCommandTest.php`
  - `php artisan test tests/Feature/ManuscriptSearchTest.php tests/Feature/SdgBackfillCommandTest.php`

### A1 — Sessionless taxonomy and public repository filter

- **Owner:** Public API Backend Engineer
- **Branch / isolated worktree:** `feat/sdg-public-api` / `C:\Users\MURALL~1\AppData\Local\Temp\opencode\researchnav-sdg-api`
- **Depends on:** D1 to develop; D3 to merge/accept
- **Exclusive file ownership:**
  - `v1/backend/routes/web.php`
  - `v1/backend/app/Http/Controllers/SustainableDevelopmentGoalController.php` (new)
  - `v1/backend/app/Http/Resources/SustainableDevelopmentGoalResource.php` (new)
  - `v1/backend/app/Http/Controllers/PublicRepositoryController.php`
  - `v1/backend/app/Services/PublicRepositoryService.php`
  - `v1/backend/tests/Feature/PublicSdgApiTest.php` (new)
  - `v1/backend/tests/Feature/PublicRepositoryTest.php`
- **Tasks:**
  1. Register `GET /api/sdgs` inside the existing sessionless public-read group and emit only the frozen two-field taxonomy.
  2. Validate `sdg` strictly on repository GET and add the relation-based current ready classification filter without selecting or serializing private projection/classification fields.
  3. Test sessionlessness, exact taxonomy, invalid input shapes, public-scope isolation, zero/multiple detections, no duplicates, pagination, and composition with q/category/year.
  4. Leave the controller's similarity method and every similarity request/resource/service unchanged.
- **Entry gate:** D1 is merged; query/relation contract is stable.
- **Acceptance / exit gate:** endpoint and filter tests pass; responses have no session cookie and no body/evidence/internal fields; filter cannot resurrect private, unarchived, ineligible, deleted, non-ready, or stale records; D3 lifecycle tests pass before merge.
- **Focused commands (from `v1/backend`):**
  - `vendor/bin/pint --test routes/web.php app/Http/Controllers/SustainableDevelopmentGoalController.php app/Http/Resources/SustainableDevelopmentGoalResource.php app/Http/Controllers/PublicRepositoryController.php app/Services/PublicRepositoryService.php tests/Feature/PublicSdgApiTest.php tests/Feature/PublicRepositoryTest.php`
  - `php artisan test tests/Feature/PublicSdgApiTest.php tests/Feature/PublicRepositoryTest.php`

### U1 — Frontend API and URL-backed single-select filter

- **Owner:** Frontend Builder
- **Branch / isolated worktree:** `feat/sdg-catalog-filter` / `C:\Users\MURALL~1\AppData\Local\Temp\opencode\researchnav-sdg-frontend`
- **Depends on:** E0 and frozen contracts to develop; A1 to merge/accept
- **Exclusive file ownership:**
  - `v1/frontend/src/sdgApi.ts` (new)
  - `v1/frontend/src/sdgApi.test.ts` (new)
  - `v1/frontend/src/api.ts`
  - `v1/frontend/src/api.test.ts`
  - `v1/frontend/src/CatalogPage.tsx`
  - `v1/frontend/src/CatalogPage.test.tsx`
  - `v1/frontend/src/styles.css`
- **Tasks:**
  1. Add a typed taxonomy fetcher and add `sdg` only to the literal repository filter contract/query serialization.
  2. Add taxonomy load/error/retry state and the accessible single select, hydrate and normalize URL state, preserve unrelated parameters, and include SDG in existing server-filter cancellation/currentness behavior.
  3. Prove q+sdg uses the existing GET allowed-ID intersection while preserving similarity POST rank and score display; do not add SDG to the similarity request.
  4. Keep responsive toolbar behavior and all existing empty/loading/error states usable.
- **Entry gate:** API response/query contract is frozen; mock fixtures include all 17 goals.
- **Acceptance / exit gate:** deep links are reproducible; one and only one integer is represented; All removes the URL key; all 17 options use API titles; invalid URL input is not sent; stale requests cannot win; keyboard and accessible-name tests pass; similarity functions/types/score presentation remain byte-for-byte unchanged except unavoidable import/context movement rejected by review.
- **Focused commands (from `v1`):**
  - `npm run format:check --workspace=@researchnav/frontend`
  - `npm run lint --workspace=@researchnav/frontend`
  - `npm run test --workspace=@researchnav/frontend -- --run src/sdgApi.test.ts src/api.test.ts src/CatalogPage.test.tsx`
  - `npm run build --workspace=@researchnav/frontend`

### I1 — Integrated verification, security/privacy review, and rollout rehearsal

- **Owner:** Integration Tester
- **Branch / isolated worktree:** `integration/sdg-manuscript-search` / `C:\Users\MURALL~1\AppData\Local\Temp\opencode\researchnav-sdg-integration`
- **Depends on:** D1, D2, D3, A1, and U1 merged into `plan/sdg-manuscript-search`
- **File ownership:** none; read-only verification. Fixes return to the exclusive owner above.
- **Tasks and acceptance checks:**
  1. Audit the combined diff against ownership and protected-path lists with the machine-checkable protected-path audit below; verify only approved paths changed and migration `000050` is unique.
  2. Run focused suites, full Laravel/frontend suites, exact similarity regressions, formatting, lint, build, dependency audits, and Python similarity tests.
  3. On disposable SQLite and MariaDB databases, rehearse fresh migration, baseline-to-`000050` upgrade, exact taxonomy, rollback/re-apply, 2020-2025 backfill, interruption/rerun, and query plans/index use.
  4. Manually verify all 17 options, deep linking, All/invalid values, category/year composition, q+sdg rank preservation, guest sessionlessness, and responsive keyboard operation.
  5. Inspect public list/detail/taxonomy payloads and logs for forbidden manuscript body, evidence, paths, hashes, error details, and classifications. Verify rate limits and download/auth behavior are unchanged.
  6. Record row counts before/after: eligible 2020-2025 projections, ready projections, complete classifications, zero-detection classifications, detections by goal, failures/no-source/unsupported, and remaining stale/missing classifications. Counts are operational evidence only and must not be exposed publicly.
- **Exit gate:** every required command passes or an explicitly pre-existing baseline failure is reproduced at `322a3af`, documented, and separately approved; no feature-caused failure, security finding, migration discrepancy, stale classification, privacy leak, or similarity delta remains.

### O1 — Operational documentation

- **Owner:** Documentation Agent
- **Branch / isolated worktree:** `docs/sdg-manuscript-search-operations` / `C:\Users\MURALL~1\AppData\Local\Temp\opencode\researchnav-sdg-docs`
- **Depends on:** I1 pass and recorded rehearsal evidence
- **Exclusive file ownership:**
  - `v1/docs/SDG_MANUSCRIPT_SEARCH.md` (new)
- **Tasks:** document explicit-only semantics and limitations, API usage, detector versioning, migration, the exact backfill command, counters, monitoring, safe rerun, disable/rollback steps, and privacy/similarity boundaries. Do not claim OCR or inferred relevance.
- **Acceptance / exit gate:** commands match the released CLI, a second operator can follow the rehearsal, no private examples/evidence are copied into documentation, and links/checklists are ready for the parent PR.
- **Focused command:** `npx prettier --check docs/SDG_MANUSCRIPT_SEARCH.md` from `v1` if Markdown is covered by the installed formatter; otherwise record a manual link/command review.

## Protected similarity boundary

The following are read/test-only for every workstream and must have no diff:

- `v1/algorithm/**`
- `v1/backend/app/Contracts/SimilarityProcess.php`
- `v1/backend/app/Services/Similarity*`
- `v1/backend/app/Services/similarity/**`
- `v1/backend/app/Services/ManuscriptSimilarityContentService.php`
- `v1/backend/app/Services/ManuscriptSimilarityTextCache.php`
- `v1/backend/app/Services/PublicRepositorySimilarityService.php`
- `v1/backend/app/Http/Requests/PublicRepositorySimilarityRequest.php`
- `v1/backend/app/Http/Resources/PublicRepositorySimilarityResource.php`
- `v1/backend/app/Http/Controllers/SimilarityController.php`
- similarity migrations, including `000007`, `000034`, and `000036`-`000038`
- existing similarity tests and `v1/docs/SIMILARITY_*.md`
- `v1/frontend/src/similarity.ts` and `v1/frontend/src/similarity.test.ts`
- frontend similarity components and tests: `v1/frontend/src/SimilarityResults.tsx`, `v1/frontend/src/SimilarityResults.test.tsx`, and `v1/frontend/src/SimilarityQuery.test.tsx`
- the score calculation/display contracts in `v1/frontend/src/api.ts`, `v1/frontend/src/types.ts`, components, and `v1/frontend/src/CatalogPage.tsx`

Necessary edits to `PublicRepositoryController.php`, `api.ts`, or `CatalogPage.tsx` must be confined to GET filtering/taxonomy UI. Review rejects changes to `POST /repository/similarity`, similarity payloads, ordering, formatting, labels, or score UI. A q+sdg search must preserve the exact order and decimal score strings returned by the unchanged similarity endpoint.

Run this audit from the repository root before every child-PR and integration gate. It normalizes and deduplicates changed paths from the committed comparison range, unstaged changes, staged changes, and untracked non-ignored files. It prints and exits nonzero separately for protected-similarity and ownership violations. Set `DIFF_BASE` only to the verified PR base when it differs from `chore/researchnav-current-baseline`. During the plan phase only, set `PLAN_PHASE=1` so this plan artifact is an allowed changed path; do not set it for implementation or integration gates.

```powershell
$base = if ($env:DIFF_BASE) { $env:DIFF_BASE } else { "chore/researchnav-current-baseline" }
git rev-parse --verify "${base}^{commit}" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Diff base '$base' is not a commit." }

$workstreamOwnershipAllowlists = @(
  @{ Name = "D1"; Paths = @(
    "v1/backend/database/migrations/2026_09_07_000050_create_sdg_classification_tables.php",
    "v1/backend/app/Models/SustainableDevelopmentGoal.php",
    "v1/backend/app/Models/ManuscriptSdgClassification.php",
    "v1/backend/app/Models/ManuscriptSdgDetection.php",
    "v1/backend/app/Models/ManuscriptSearchDocument.php",
    "v1/backend/tests/Feature/Database/SdgClassificationSchemaTest.php"
  ) }
  @{ Name = "D2"; Paths = @(
    "v1/backend/app/Services/SdgDeclarationDetector.php",
    "v1/backend/app/Services/ManuscriptSdgClassificationService.php",
    "v1/backend/config/researchnav.php",
    "v1/backend/tests/Unit/SdgDeclarationDetectorTest.php",
    "v1/backend/tests/Feature/ManuscriptSdgClassificationServiceTest.php"
  ) }
  @{ Name = "D3"; Paths = @(
    "v1/backend/app/Services/ManuscriptSearchProjectionService.php",
    "v1/backend/app/Console/Commands/ReindexManuscripts.php",
    "v1/backend/tests/Feature/ManuscriptSearchTest.php",
    "v1/backend/tests/Feature/SdgBackfillCommandTest.php"
  ) }
  @{ Name = "A1"; Paths = @(
    "v1/backend/routes/web.php",
    "v1/backend/app/Http/Controllers/SustainableDevelopmentGoalController.php",
    "v1/backend/app/Http/Resources/SustainableDevelopmentGoalResource.php",
    "v1/backend/app/Http/Controllers/PublicRepositoryController.php",
    "v1/backend/app/Services/PublicRepositoryService.php",
    "v1/backend/tests/Feature/PublicSdgApiTest.php",
    "v1/backend/tests/Feature/PublicRepositoryTest.php"
  ) }
  @{ Name = "U1"; Paths = @(
    "v1/frontend/src/sdgApi.ts",
    "v1/frontend/src/sdgApi.test.ts",
    "v1/frontend/src/api.ts",
    "v1/frontend/src/api.test.ts",
    "v1/frontend/src/CatalogPage.tsx",
    "v1/frontend/src/CatalogPage.test.tsx",
    "v1/frontend/src/styles.css"
  ) }
  @{ Name = "O1"; Paths = @(
    "v1/docs/SDG_MANUSCRIPT_SEARCH.md"
  ) }
)
$ownershipAllowlist = @(
  $workstreamOwnershipAllowlists | ForEach-Object { $_.Paths }
) | Sort-Object -Unique
$planPhaseAllowlist = @("v1/docs/plans/sdg-manuscript-search.md")
$allowed = @($ownershipAllowlist)
if ($env:PLAN_PHASE -eq "1") {
  $allowed += $planPhaseAllowlist
}

$protected = @(
  "v1/algorithm/**",
  "v1/backend/app/Contracts/SimilarityProcess.php",
  "v1/backend/app/Services/Similarity*",
  "v1/backend/app/Services/similarity/**",
  "v1/backend/app/Services/ManuscriptSimilarityContentService.php",
  "v1/backend/app/Services/ManuscriptSimilarityTextCache.php",
  "v1/backend/app/Services/PublicRepositorySimilarityService.php",
  "v1/backend/app/Http/Requests/PublicRepositorySimilarityRequest.php",
  "v1/backend/app/Http/Resources/PublicRepositorySimilarityResource.php",
  "v1/backend/app/Http/Controllers/SimilarityController.php",
  "v1/backend/database/migrations/*similarity*",
  "v1/backend/tests/**/*Similarity*",
  "v1/docs/SIMILARITY_*.md",
  "v1/frontend/src/similarity.ts",
  "v1/frontend/src/similarity.test.ts",
  "v1/frontend/src/SimilarityResults.tsx",
  "v1/frontend/src/SimilarityResults.test.tsx",
  "v1/frontend/src/SimilarityQuery.test.tsx"
)
$changed = @(
  git diff --name-only --diff-filter=ACDMRT "${base}...HEAD"
  git diff --name-only --diff-filter=ACDMRT
  git diff --cached --name-only --diff-filter=ACDMRT
  git ls-files --others --exclude-standard
) | ForEach-Object {
  $_.Trim().Replace("\", "/") -replace "^\./", ""
} | Where-Object { $_ } | Sort-Object -Unique
$protectedViolations = $changed | Where-Object {
  $path = $_
  $protected | Where-Object { $path -like $_ }
}
$ownershipViolations = $changed | Where-Object {
  $path = $_
  -not ($allowed | Where-Object { $path -like $_ })
}
if ($protectedViolations) {
  $protectedViolations | ForEach-Object { "Protected similarity path changed: $_" }
}
if ($ownershipViolations) {
  $ownershipViolations | ForEach-Object { "Changed path outside workstream ownership allowlists: $_" }
}
if ($protectedViolations -or $ownershipViolations) {
  exit 1
}
```

## Security and privacy controls

1. **Minimum source:** classification reads only an already-persisted ready `body_text`. It never opens a file, invokes OCR/extraction, queries title/abstract/keywords, calls Python, or sends data over a network.
2. **No evidence persistence/exposure:** detections contain only foreign keys. Public resources are explicit allowlists. Tests reject `body_text`, snippets, match/evidence text, offsets, hashes, source IDs/paths, extraction status/errors, detector version, timestamps, and internal classification IDs.
3. **Public-scope preservation:** SDG filtering is an additional predicate under the existing archived/public/non-deleted scope, not an alternate access path. Taxonomy and repository reads remain sessionless; download stays authenticated, authorized, and audited.
4. **Stale-data fail closed:** missing, incomplete, non-ready, or stale classifications do not match. Invalidation deletes derived rows transactionally; cascade deletion is defense in depth.
5. **Input and query safety:** accept one bounded integer, use query-builder bindings/relations, avoid dynamic SQL identifiers, and retain pagination limits. Test array/duplicate query input according to Laravel's validation envelope.
6. **Denial-of-service control:** detection is linear/bounded over existing extracted text, uses no catastrophic-backtracking regex, and runs in the bounded reindex process. Chunk remains clamped to 1-500; public repository throttle remains in place.
7. **Operational confidentiality:** backfill logs contain counts and document IDs only when explicitly targeted; never log body text or matches. Database access to derived tables follows the same private backend credentials as manuscript projections.
8. **Dependency and secret review:** scan the diff for credentials/generated bodies, run Composer/npm audits, and do not add a package for deterministic matching without architecture reapproval.

## Migration, backfill, deployment, and rollback

### Pre-deployment gate

1. Confirm deployed commit ancestry includes `322a3af`, and record current application/migration versions.
2. Verify `000050` is absent from both filenames and the target database's `migrations` table.
3. Take and verify a restorable database backup. Record counts for `research_documents`, `manuscript_search_documents` by status/year, and `similarity_results`.
4. Run the fresh and upgrade migration matrix on a disposable MariaDB matching production. Run `migrate --pretend` and inspect that only the three SDG tables and 17 taxonomy rows are introduced.
5. Confirm private storage and worker capacity for records lacking a ready projection; classification of current ready projections itself must not read storage or invoke extraction.

### Deployment order

1. Deploy compatible application code with the migration while the feature UI remains unreleased or disabled by release sequencing.
2. Run `php artisan migrate --force` from `v1/backend`.
3. Verify `GET /api/sdgs` returns exactly 17 ordered entries and an SDG-filtered repository request returns safely even before backfill completion.
4. Run from `v1/backend`:

   ```powershell
   php artisan repository:reindex-manuscripts --year-from=2020 --year-to=2025 --retry-failed --chunk=100
   ```

5. Treat a nonzero exit as an incomplete backfill, not permission to bypass failures. Record counters, correct source/extraction issues through normal operations, and rerun the same command. Unsupported/no-source records remain safely unclassified.
6. Reconcile ready 2020-2025 projections against current classifications, verify no stale rows and no duplicate detections, sample explicit declarations privately without copying evidence, then release the frontend control.
7. Monitor API 422/5xx rates, reindex outcomes/duration, database load, and result-count anomalies. Do not emit manuscript evidence into telemetry.

### Rollback and disable strategy

1. **Fast disable:** roll back the frontend/API application release or hide the UI through release sequencing. Older code ignores the additive SDG tables; do not delete source projections or run a compensating similarity job.
2. **Data retention:** leave the three inert derived tables in place during diagnosis so re-deployment is resumable. They contain no manuscript text/evidence.
3. **Schema rollback, only if approved:** after confirming no newer migration shares the batch and after a fresh backup, run the migration's targeted rollback in a maintenance window:

   ```powershell
   php artisan migrate:rollback --path=database/migrations/2026_09_07_000050_create_sdg_classification_tables.php --force
   ```

   Verify the command targets only `000050`. Its `down()` drops detections, classifications, and taxonomy only. If migration state is ambiguous, do not improvise SQL; restore/reconcile from the verified backup.

4. Application rollback must precede schema rollback so no running code queries removed tables. Backfill has no reverse data mutation: it does not change source manuscripts, publication years, or similarity rows.
5. Re-deployment reapplies `000050` and reruns the same idempotent 2020-2025 command.

## Test gates and commands

All commands run against the exact committed child revision at PR gate and again against the combined plan branch. Reports include command, exit code, duration, skipped tests, environment, and concise output. `migrate:fresh` is allowed only on an explicitly disposable database.

### Backend focused and full gates (from `v1/backend`)

```powershell
vendor/bin/pint --test
php artisan test tests/Feature/Database/SdgClassificationSchemaTest.php tests/Unit/SdgDeclarationDetectorTest.php tests/Feature/ManuscriptSdgClassificationServiceTest.php tests/Feature/ManuscriptSearchTest.php tests/Feature/SdgBackfillCommandTest.php tests/Feature/PublicSdgApiTest.php tests/Feature/PublicRepositoryTest.php
php artisan test tests/Unit/SimilarityScorePolicyTest.php tests/Unit/ManuscriptSimilarityTextCacheTest.php tests/Feature/PublicRepositorySimilarityTest.php tests/Feature/SimilarityCheckTest.php
composer test
composer audit --locked
```

### Frontend gates (from `v1`)

```powershell
npm run format:check --workspace=@researchnav/frontend
npm run lint --workspace=@researchnav/frontend
npm run test --workspace=@researchnav/frontend -- --run src/sdgApi.test.ts src/api.test.ts src/CatalogPage.test.tsx
npm run test --workspace=@researchnav/frontend
npm run build --workspace=@researchnav/frontend
npm audit --workspace=@researchnav/frontend --omit=dev
```

### Similarity Python regression gates (from `v1`)

```powershell
python -m pytest algorithm/test_research_similarity.py backend/app/Services/similarity/tests -v
```

### Disposable MariaDB migration/backfill matrix (from `v1/backend`)

1. Fresh schema through `000050`, schema tests, exact 17 rows.
2. Snapshot restored at `000049`, migrate to `000050`, compare all pre-existing table counts/checksums, then run the focused tests.
3. Backfill fixtures at years 2019, 2020, 2025, and 2026; prove inclusive bounds and no extractor call for current ready rows.
4. Interrupt after a chunk, rerun, and prove one classification per projection and one detection per classification/goal.
5. Roll `000050` down and up on disposable data; prove only SDG-derived objects are removed and source/similarity counts/checksums remain unchanged.
6. Use `EXPLAIN` for representative `sdg`, `sdg+year`, and `sdg+q` queries; reject table-wide avoidable scans caused by missing join indexes.

## Risk register

| Risk                                            | Prevention / detection                                                                                                                     | Owner                  | Stop condition                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| False-positive thematic inference               | frozen marker grammar and negative corpus; no title/abstract/keyword inputs                                                                | D2                     | any bare theme/title produces a goal                                                                     |
| False number prefixes/list parsing              | whole-token, horizontal-whitespace, range, separator, mixed-list, all-17, and adversarial regex tests                                      | D2                     | 1 matches 10-17, a range endpoint classifies, or a malformed/conjoined token classifies                  |
| Stale classification after source/status change | transactional invalidation, freshness fields, cascade, lifecycle matrix                                                                    | D3                     | non-ready/stale record matches API                                                                       |
| Migration collision or unsafe rollback          | reserve/re-scan `000050`, explicit names, disposable upgrade/down-up, backup                                                               | D1 / I1                | collision, non-additive SQL, or source-table delta                                                       |
| Partial/expensive backfill                      | chunk limits, explicit persisted-body classification-only path, unchanged source verification, counters, nonzero failure, idempotent rerun | D3 / I1                | classification-only refresh reads storage, source verification changes unexpectedly, or rerun duplicates |
| Public manuscript/evidence leakage              | resource allowlists, payload/log scans, no evidence columns                                                                                | A1 / Security Reviewer | any forbidden field/content is public/logged                                                             |
| Public-scope bypass                             | relation filter nested under existing public scope and negative fixtures                                                                   | A1                     | private/unarchived/deleted record appears                                                                |
| Similarity regression                           | protected paths, exact-value PHP/Python/frontend regressions, q+sdg rank checks                                                            | all / I1               | any protected diff or score/order delta                                                                  |
| URL/filter race or malformed input              | validated hydration, request abort/currentness key, API 422 tests                                                                          | U1                     | stale request wins or invalid value is sent                                                              |
| Baseline/PR lineage contamination               | all branches from verified plan branch; child PRs target dedicated plan PR                                                                 | Repository Agent       | branch is based on/targets PR #11 or wrong SHA                                                           |

## Entry gates (E0)

- [ ] PR Coordinator links the approved product/explorer/architect handoffs and confirms this plan preserves their explicit marker, 17-title taxonomy, zero-detection classification, API, and single-select contracts; any proposed deviation stops for re-planning.
- [ ] GitHub Repository Agent verifies `plan/sdg-manuscript-search` points to `322a3af` before the plan commit and that `chore/researchnav-current-baseline` is the intended parent PR base.
- [ ] A new Draft parent Plan PR is created for this feature; PR #11 remains untouched and separate.
- [ ] Baseline focused/full test evidence is recorded at `322a3af`, including any pre-existing failures; implementation does not begin from an unexplained failing baseline.
- [ ] Migration filenames and target migration table are checked; `2026_09_07_000050_create_sdg_classification_tables.php` remains collision-free.
- [ ] All workstream owners accept exclusive paths, isolated worktrees, branch targets, dependency order, and protected similarity paths.
- [ ] Disposable MariaDB and a backup/restore rehearsal environment are available before migration acceptance.

## Exit gates (X0)

- [ ] Every workstream acceptance criterion and command passes on its exact child commit and the combined plan branch.
- [ ] All 17 goals are returned exactly and can be selected/filter matched through an end-to-end test.
- [ ] Positive and negative detector matrices prove explicit author declaration only from ready body text, with no OCR, metadata, context, semantic, or external inference.
- [ ] Projection lifecycle and detector-version tests prove no stale or non-ready classification can match.
- [ ] Public responses/logs expose no body text or evidence, and existing public scope/session/download controls are unchanged.
- [ ] 2020-2025 MariaDB backfill interruption/rerun and reconciliation pass; migration and rollback rehearsal is recorded.
- [ ] Protected similarity paths have no diff and exact score/weight/threshold/ranking regressions pass.
- [ ] Frontend deep links, one-value URL behavior, q+sdg rank preservation, error/retry, keyboard, and responsive checks pass.
- [ ] Documentation and parent Plan PR contain child PR links, exact test evidence, migration/backfill counts, rollback evidence, decisions, and residual risks.
- [ ] Security Reviewer and Code Reviewer have no unresolved blocking findings; the parent Plan PR may then move from Draft to ready for review. Merge/release still requires explicit authorization.

## Workstream checklist

- [ ] E0 entry gates complete
- [ ] D1 additive persistence merged and MariaDB-verified
- [ ] D2 explicit detector/classification service merged
- [ ] D3 projection lifecycle and reindex backfill merged
- [ ] A1 sessionless taxonomy and repository filter merged
- [ ] U1 URL-backed frontend single select merged
- [ ] I1 full integration, privacy/security, similarity, and rollout gates passed
- [ ] O1 operational documentation merged
- [ ] Child PR links and test evidence recorded in the dedicated parent Plan PR
- [ ] X0 exit gates complete

## Plan PR body draft

**Title:** `plan: add explicit SDG manuscript filtering`

**Base / head:** `chore/researchnav-current-baseline` <- `plan/sdg-manuscript-search`

### Goal

Plan an isolated, privacy-preserving SDG filter for the public manuscript catalog. Classifications come only from explicit SDG markers in already-ready manuscript body projections, cover all 17 goals, remain synchronized with projection lifecycle, and do not alter similarity behavior.

### Scope

- Add a 17-goal taxonomy plus separate classification and detection persistence.
- Detect only explicit `SDG` / `Sustainable Development Goal` number declarations in ready `manuscript_search_documents.body_text`.
- Add sessionless `GET /api/sdgs` and integer `sdg` filtering on `GET /api/repository`.
- Add an accessible URL-backed single select to `/catalog`.
- Backfill inclusive publication years 2020-2025 through the idempotent reindex command.

### Non-goals and boundaries

- No OCR, title/abstract/keyword/context inference, semantic model, LLM, evidence snippets, or body exposure.
- No SDG multi-select, record badges, overrides, or workflow decisions.
- No change to similarity workers, weights, thresholds, precision, ranking, persistence, API contract, or UI scoring.
- No legacy `server/` changes.

### Architecture decisions

- Reserved additive migration: `2026_09_07_000050_create_sdg_classification_tables.php` (`000049` already exists).
- A complete classification row can have zero detections; detections store only goal foreign keys.
- Missing/stale/non-ready classification fails closed. Projection invalidation removes derived SDG rows.
- `POST /api/repository/similarity` stays untouched; q+sdg intersects filtered IDs while preserving its order.
- Production backfill: `php artisan repository:reindex-manuscripts --year-from=2020 --year-to=2025 --retry-failed --chunk=100`.

### Workstreams

| ID                    | Owner                                 | Status                              | Branch                                  | Child PR |
| --------------------- | ------------------------------------- | ----------------------------------- | --------------------------------------- | -------- |
| D1 Persistence        | Database Builder                      | Pending                             | `feat/sdg-persistence`                  |          |
| D2 Detection          | SDG Detection Backend Engineer        | Blocked by D1                       | `feat/sdg-declaration-detection`        |          |
| D3 Lifecycle/backfill | Projection Lifecycle Backend Engineer | Blocked by D2                       | `feat/sdg-projection-backfill`          |          |
| A1 Public API         | Public API Backend Engineer           | Blocked by D1/D3 acceptance         | `feat/sdg-public-api`                   |          |
| U1 Frontend           | Frontend Builder                      | Contract-ready; merge blocked by A1 | `feat/sdg-catalog-filter`               |          |
| I1 Integration        | Integration Tester                    | Blocked by implementation           | `integration/sdg-manuscript-search`     |          |
| O1 Operations docs    | Documentation Agent                   | Blocked by I1                       | `docs/sdg-manuscript-search-operations` |          |

### Acceptance and verification

- [ ] Exact ordered 17-goal taxonomy and all-17 detector coverage
- [ ] Explicit-marker positives and no-inference/non-ready negatives
- [ ] Schema, uniqueness, cascade, lifecycle, stale-version, and rollback tests
- [ ] Public scope, integer validation, composition, sessionless, and payload privacy tests
- [ ] URL/deep-link, single-select, q+sdg order, accessibility, and frontend build tests
- [ ] 2020-2025 MariaDB backfill interruption/rerun/reconciliation
- [ ] Full Laravel/frontend suites, Pint, Prettier, ESLint, TypeScript/build, and dependency audits
- [ ] Protected similarity diff is empty; exact PHP/Python/frontend similarity regressions pass
- [ ] Security and code reviews have no blocking findings

### Migration and rollback

The migration is additive and must pass fresh/upgrade/down-up tests on disposable MariaDB after a verified backup. Roll application code back before any targeted `000050` schema rollback. The backfill changes only new derived SDG rows and existing projection lifecycle state; it never rewrites source documents or similarity rows.

### Coordination

This is a new Draft parent Plan PR targeting the baseline branch. Draft PR #11 remains the separate parent workflow PR and must not be retargeted or reused. Child PRs target this plan branch and update this checklist only through the PR Coordinator.
