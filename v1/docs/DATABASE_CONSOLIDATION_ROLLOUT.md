# Database consolidation rollout

The first consolidation migration is intentionally additive. It creates and backfills
`research_review_records` and `activity_logs`, but the application continues to use
the original tables. This is the expand phase and is safe to roll back with the
migration `down()` before cutover.

## Current state

- Existing tables are not dropped.
- Existing models and services are not redirected.
- Monitoring and audit writes now mirror into `activity_logs` while their original
  tables remain authoritative.
- Shadow rows retain `source_type` and `source_id` so they can be compared with the
  source tables.
- The migration is not a request to delete old data.

## Required cutover checks

Before redirecting reads or writes, compare row counts and key fields for every
source type, verify foreign-key orphans, and run the full Laravel test suite against
MariaDB. Keep the original tables until the comparison and rollback test pass.

Run `php artisan consolidation:check-parity` to perform the repeatable read-only
count, missing-key, and duplicate-key checks.

The shadow mirror is intentionally fail-fast inside the same transaction: if the
consolidated write cannot be recorded, the original event is rolled back as well.

Review writes for revisions, title validations, and feedback are also mirrored into
`research_review_records`. Their typed source tables remain authoritative until a
later read-cutover release.

## Read adapter

`ConsolidatedReadAdapter` is available for parity-tested read paths, but the feature
flag `RESEARCHNAV_CONSOLIDATION_READ_SHADOW` defaults to `false`. It must remain
disabled until each consumer has an adapter test proving equivalent authorization,
ordering, relationships, and response fields.

The compliance and metadata queue adapters are not yet eligible for enablement:
their current source queries include documents with no review row, while the first
shadow implementation only hydrates existing review rows. The source query remains
the active behavior until this empty-review case is implemented and tested.

The file-deletion outbox is deliberately not folded into `document_files` yet. That
change needs a separate migration after all pending storage deletions are drained.

## v1 cutover state

`researchnav_v1` is the active local MariaDB database and contains 21 tables. Its
typed review and activity models now dynamically resolve to the consolidated tables
when the legacy table is absent, while SQLite test databases continue to use their
legacy tables for existing contract coverage. The original `researchnav_db` remains
available as the rollback database.

The v1 database has been smoke-tested for consolidated model resolution, source ID
allocation, activity/audit writes, and transaction rollback. Table removal is not a
rollback operation; restoring `researchnav_db` or its verified SQL backup is the
rollback procedure.
