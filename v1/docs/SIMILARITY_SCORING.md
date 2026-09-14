# Similarity Scoring

ResearchNAV compares research titles and extracted manuscript text with the
existing TF-IDF and cosine-similarity pipeline. The authoritative policy is
`title-content-weighted-v1`.

Similarity is decision support. It does not prove originality or plagiarism,
and it never automatically approves or rejects research. An adviser or other
authorized reviewer makes the final academic decision.

## Internal Representation

All component and overall scores are normalized decimals in the inclusive
range `0..1`. The Python worker returns independent title and content cosine
scores as fixed-point decimal strings. Laravel validates those strings and
calculates the policy result without binary floating-point threshold checks.

Laravel converts normalized scores to percentages only for API presentation.
React formats API-provided percentages and percentage-point contributions to
two decimal places for display. React does not calculate the overall score,
classification, or review flags.

The two independently rounded displayed contributions can differ by a cent from
the displayed overall. The interface labels that transparent equation
`Displayed overall ≈ …`; only Laravel's fixed-point value is exact.

## TF-IDF and Cosine

Titles and manuscript content are vectorized separately. Existing Unicode
tokenization, case folding, the versioned stopword list, sparse TF-IDF, and
cosine-similarity implementation are unchanged. Scores are finite and bounded
to `0..1`; malformed, negative, above-one, NaN, or infinite worker values are
rejected before persistence.

FastText can provide supporting context but never changes title, content, or
overall scores, ranking, classification, or review flags.

## Weighted Formula

The backend configuration supplies one policy:

```text
Title weight:   0.30
Content weight: 0.70

overall_similarity =
    (title_similarity * 0.30) +
    (content_similarity * 0.70)
```

The versioned application configuration freezes these values for
`title-content-weighted-v1`; environment variables cannot relabel another set
of values as that policy. The configured weights must sum exactly to `1.0`. The previous public-query
`max(title_similarity, content_similarity)` rule and the previous persisted
combined-text cosine are historical algorithms only; neither is authoritative
for new checks.

Example:

```text
Title similarity:             0.292108 = 29.210800%
Title weighted contribution:  29.210800 * 0.30 = 8.763240 points

Content similarity:           0.234404 = 23.440400%
Content weighted contribution:23.440400 * 0.70 = 16.408280 points

Overall similarity:           0.2517152 = 25.171520%
Displayed overall:            25.17%
```

The component percentages are never added without weights.

## Classification

Laravel classifies the unrounded normalized overall score:

```text
overall >= 0.70  -> high
overall >= 0.40  -> moderate
otherwise        -> low
```

The ranges are therefore:

| Classification | Percentage range             |
| -------------- | ---------------------------- |
| Low            | `0.00%` through `39.99...%`  |
| Moderate       | `40.00%` through `69.99...%` |
| High           | `70.00%` through `100.00%`   |

## Adviser Review

Laravel derives all review decisions:

```text
overall_flagged = overall_similarity >= 0.70
title_match_alert = title_similarity >= 0.90
adviser_review_required = overall_flagged OR title_match_alert
```

`flag_reason` is one of:

| Conditions                        | Reason                    |
| --------------------------------- | ------------------------- |
| High overall and near-exact title | `overall_and_title_match` |
| High overall only                 | `overall_high_similarity` |
| Near-exact title only             | `near_exact_title_match`  |
| Neither                           | `not_flagged`             |

The title safeguard keeps a nearly identical title in human review even when
different or incomplete manuscript content lowers the weighted result.

## Manuscript Processing

The current pipeline supports text extraction from PDF and DOCX. Legacy DOC is
unsupported. Scanned PDFs require a separate OCR process and can produce a
no-text or failed status.

Extracted text is stored in the private, one-row-per-research
`manuscript_search_documents` projection and reused. Similarity page requests
do not extract or retry candidate projections: only currently ready projections
are consumed. A projection is trusted only when its status is `ready`, its body
is nonblank, its source SHA-256 is lowercase 64-character hexadecimal, and its
`extractor_version` exactly equals the configured current extractor version.
Otherwise it is unavailable (never an official overall), even if it has body
text. A source may safely use that trusted projection or the existing bounded
on-demand extraction path. The worker compares the approved bounded full
extracted text, not only the first page or public abstract.

The current algorithm produces one content score per candidate from the whole
approved extracted document. It is not chunk-based, so one manuscript cannot
appear repeatedly because multiple chunks matched. Reliable cover-page,
header/footer, table-of-contents, acknowledgment, institutional-template, and
reference-section detection is not currently implemented. ResearchNAV does not
claim that such sections were removed.

## Unavailable Content

If either required manuscript content operand is missing, unsupported, empty,
failed, stale, or unverifiable:

- the valid title score remains available;
- content score and contribution are `null`;
- official overall score, percentage, and classification are `null`;
- `overall_flagged` is false;
- the independent 90% title safeguard can still require adviser review; and
- the UI states that content analysis and overall similarity are unavailable.

No fake zero, title-as-content substitution, or reweighted fallback is used.
Extraction failures are returned as sanitized statuses; manuscript text and
private paths are never exposed in API responses or logs.

FastText is optional supporting context on both persisted and public checks.
Missing model/package/runtime support produces a nullable FastText score and
sanitized contextual copy while title/content TF-IDF scoring continues.

## API Contract

Public, authenticated query, and persisted-result resources expose:

```text
title_similarity_score
title_similarity_percentage
title_weight
title_weighted_contribution
content_similarity_score
content_similarity_percentage
content_weight
content_weighted_contribution
overall_similarity_score
overall_similarity_percentage
classification
overall_flagged
title_match_alert
adviser_review_required
flag_reason
algorithm_version
analyzed_at
```

Weights are normalized decimals. Weighted contributions are percentage points,
which makes the displayed equation transparent. Each value is rounded for
display independently, so the UI labels it `Displayed overall ≈ A + B ≈ C`,
rather than claiming the rounded addends equal the rounded overall exactly.
Query requests still accept
only `q`; persisted-check requests still accept only an empty JSON object.
Frontend-provided scores, classifications, or flags are never accepted.

## Persistence and History

Migration `2026_09_01_000036_add_weighted_similarity_fields.php` adds the
weighted policy fields without modifying an applied migration. New persisted
checks append immutable `title-content-weighted-v1` rows. Existing rows retain
their original scores, timestamps, and algorithm versions; they are not
silently recalculated or relabeled.

Migration `2026_09_01_000037_strengthen_weighted_similarity_constraints.php`
adds current-version MariaDB decision/formula constraints without rewriting
historical rows. It is applied through the normal deployment migration step.

Before a persisted write or public response, the service revalidates the source
and every candidate title plus projection identity, status, source/body hashes,
extractor version, and selected source-file identity/hash. The source snapshot
also records whether the worker used a trusted ready projection, a selected
file, or unavailable content; therefore a projection/file appearing or
disappearing while unavailable also aborts the whole response/write rather than
returning a mixed snapshot.

Inspect history without writing data:

```powershell
php artisan similarity:history-report --json
```

`rows_requiring_recalculation` reports records from older algorithms. A future
recalculation must be a deliberate, idempotent operation that appends new rows;
the current command is report-only.

## Configuration

`backend/config/researchnav.php` contains the versioned immutable policy:
`title-content-weighted-v1` is `.30` title, `.70` content, `.40` moderate,
`.70` high, and `.90` title alert. These are not environment variables.

Operational worker paths, limits, timeouts, and FastText configuration remain
documented in `backend/.env.example` and `backend/README.md`.
