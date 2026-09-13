# Shared Repository Management Implementation Plan

## Document Status

- **Artifact:** canonical planning document only; no product implementation is authorized by this file.
- **Evidence date:** 2026-09-13.
- **Scope:** shared Repository Management for active Research Office and System Admin. It provides document search, existing-workspace view/edit, management archive and restore, queued permanent deletion, a durable deletion ledger, and immutable audit/activity/monitoring/retention snapshots.

---

## Architecture Decisions

| Decision                     | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared authority             | All routes use the shared `office.authority` middleware. Research Office and active System Admin use the same resources and policies.                                                                                                                                                                                                                                                                                                                                                           |
| Canonical route tree         | The canonical document collection is `/api/office/repository-management/documents`. Document actions are beneath `/api/office/repository-management/documents/{researchDocument}/...`. Deletion resources are `/api/office/repository-management/deletions`. No alternate admin route tree exists.                                                                                                                                                                                              |
| Management state             | Management archive eligibility and restore eligibility are derived only from `deleted_at` and `management_archived_at`: a document is management-archived only when both are non-null. A soft-deleted row with `management_archived_at` null is legacy or workflow-deleted and is not restoreable or permanently deletable through Repository Management. The deletion ledger records a queued deletion independently of the document lifecycle.                                                |
| Archive and restore contract | `POST` archive and restore requests require the body `{}`. They preserve `archive_status`, `submission_status`, and `visibility` exactly; neither action changes publication state.                                                                                                                                                                                                                                                                                                             |
| Permanent-delete contract    | Permanent delete requires a reason, exact `DELETE {submission_reference}` confirmation, current strong `If-Match` ETag, and an `Idempotency-Key`. The initial acceptance returns `202`; a same-fingerprint idempotency replay returns `200` with the original aggregate ledger resource.                                                                                                                                                                                                        |
| Actors                       | User primary keys are UUIDs in `users.id`. All actor columns are UUID FKs to `users.id`; application code uses `actor.id`.                                                                                                                                                                                                                                                                                                                                                                      |
| Durable deletion             | A ledger has an `unsignedBigInteger target_research_document_id` with **no FK** to `research_documents`, plus immutable document-identifying snapshots. Each storage object has one durable `repository_deletion_objects` row with an encrypted locator.                                                                                                                                                                                                                                        |
| Privacy                      | APIs never return storage paths, decrypted locators, raw storage errors, idempotency keys, hashes, or request fingerprints.                                                                                                                                                                                                                                                                                                                                                                     |
| Immutable history            | `repository_document_history_snapshots` and audit/activity history are snapshotted/retained before purge. MariaDB's canonical immutable event history is the `activity_logs` stream: its typed `monitoring_logs` and `retention_logs` tables are migrated into that stream as applicable and then dropped. SQLite retains its typed monitoring/retention tables, whose direct document references must be nullable with `ON DELETE SET NULL`. Non-history `research_review_records` are purged. |

---

## Data Model Changes

### 1. `research_documents` additions

| Column                       | Type             | Constraints                                      | Purpose                                                                                                                          |
| ---------------------------- | ---------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `management_archived_at`     | `timestamp(6)`   | nullable                                         | Set together with `deleted_at` by management archive; its presence distinguishes a management archive from other soft deletions. |
| `management_archived_by`     | UUID             | nullable, FK to `users.id`, `ON DELETE SET NULL` | Archiving actor.                                                                                                                 |
| `restored_at`                | `timestamp(6)`   | nullable                                         | Last management restore time.                                                                                                    |
| `restored_by`                | UUID             | nullable, FK to `users.id`, `ON DELETE SET NULL` | Restoring actor.                                                                                                                 |
| `permanent_delete_queued_at` | `timestamp(6)`   | nullable                                         | Time a permanent-delete request was accepted.                                                                                    |
| `permanent_delete_queued_by` | UUID             | nullable, FK to `users.id`, `ON DELETE SET NULL` | Actor who queued deletion.                                                                                                       |
| `row_version`                | unsigned integer | not null, default `1`                            | Optimistic-lock version, incremented for every mutation.                                                                         |

`deleted_at` and `management_archived_at` are the management-state pair. Management archive sets both in one transaction. Management restore clears both in one transaction. No archive reason is stored because archive requests use `{}`.

`ResearchDocument` scopes:

- `scopeManagementArchived`: `deleted_at IS NOT NULL AND management_archived_at IS NOT NULL`.
- `scopeLegacySoftDeleted`: `deleted_at IS NOT NULL AND management_archived_at IS NULL`.
- `scopeRestorableManagementArchived`: the same predicate as `scopeManagementArchived`, excluding every row with any deletion ledger, including failed ledgers whose storage may already be partially removed.

### 2. `repository_deletion_ledger`

| Column                                    | Type                 | Constraints                                     | Purpose                                                                                                                                  |
| ----------------------------------------- | -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                      | `bigIncrements`      | PK                                              | Ledger identifier.                                                                                                                       |
| `target_research_document_id`             | `unsignedBigInteger` | not null, **no FK**                             | Durable target identity after document purge.                                                                                            |
| `submission_reference`                    | `VARCHAR(40)`        | not null                                        | Immutable confirmation/audit snapshot.                                                                                                   |
| `title`                                   | `VARCHAR(500)`       | not null                                        | Immutable title snapshot retained after purge.                                                                                           |
| `requested_by`                            | UUID                 | nullable FK to `users.id`, `ON DELETE SET NULL` | Requesting actor.                                                                                                                        |
| `idempotency_key_hash`                    | `char(64)`           | not null                                        | SHA-256 hash of the normalized idempotency key; never expose it.                                                                         |
| `request_fingerprint`                     | `char(64)`           | not null                                        | Persisted SHA-256 fingerprint of target, reason, confirmation, and request semantics; used to reject key reuse with a different request. |
| `reason`                                  | `text`               | not null                                        | Permanent-delete reason, retained in the internal ledger/audit record.                                                                   |
| `status`                                  | enum                 | not null                                        | `queued`, `deleting`, `purge_retryable`, `purge_deleting`, `completed`, `storage_failed`, or `purge_failed`.                             |
| `object_count`                            | unsigned integer     | not null, default `0`                           | Number of durable object rows created with the ledger.                                                                                   |
| `objects_deleted_count`                   | unsigned integer     | not null, default `0`                           | Projection of rows in terminal `deleted` state.                                                                                          |
| `objects_terminal_failed_count`           | unsigned integer     | not null, default `0`                           | Projection of rows in terminal `terminal_failed` state.                                                                                  |
| `purge_attempts`                          | unsigned integer     | not null, default `0`                           | DB-purge attempts.                                                                                                                       |
| `last_error_code`                         | string               | nullable                                        | Generic stable error code only.                                                                                                          |
| `lease_token`                             | `char(36)`           | nullable                                        | Opaque token for the worker that owns a `deleting` or `purge_deleting` claim.                                                            |
| `lease_expires_at`                        | `timestamp(6)`       | nullable, indexed with status                   | Claim expiry; an expired claim is recoverable.                                                                                           |
| `next_attempt_at`                         | `timestamp(6)`       | nullable, indexed with status                   | Earliest time a `purge_retryable` ledger may be claimed; null for a newly queued ledger.                                                 |
| `queued_at`, `started_at`, `completed_at` | `timestamp(6)`       | as applicable                                   | Lifecycle timestamps.                                                                                                                    |
| `created_at`, `updated_at`                | `timestamp(6)`       | Laravel timestamps                              | Audit timestamps.                                                                                                                        |

Indexes and constraints:

- Unique (`idempotency_key_hash`) makes a normalized idempotency key globally single-use, independent of target, without a document FK.
- Index (`status`, `queued_at`) supports polling; index (`status`, `next_attempt_at`) supports due purge retries.
- Unique (`target_research_document_id`) permits only one deletion ledger for a document, regardless of idempotency key.
- In the acceptance transaction, the service locks the target document and the matching global idempotency row (`lockForUpdate`). It computes the fingerprint from the target, reason, exact confirmation, and versioned request semantics before deciding: the same hash plus the same fingerprint is a replay of the original ledger; the same hash plus a different fingerprint (including a different target) is `409 IDEMPOTENCY_CONFLICT`. If concurrent first use races before a row exists, the unique-key loser catches the duplicate-key result and re-reads/locks that hash before applying the same replay/conflict decision.

### 3. `repository_deletion_objects`

| Column                     | Type                      | Constraints                                                         | Purpose                                                              |
| -------------------------- | ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `id`                       | `bigIncrements`           | PK                                                                  | Object identifier.                                                   |
| `ledger_id`                | `unsignedBigInteger`      | not null, FK to `repository_deletion_ledger.id`, restrict on delete | Ledger parent.                                                       |
| `encrypted_locator`        | `text`                    | not null                                                            | Encrypted storage locator.                                           |
| `storage_type`             | enum(`local`, `supabase`) | not null                                                            | Storage backend.                                                     |
| `status`                   | enum                      | not null, default `pending`                                         | `pending`, `deleting`, `retryable`, `deleted`, or `terminal_failed`. |
| `attempts`                 | unsigned integer          | not null, default `0`                                               | Claimed storage-delete attempts.                                     |
| `next_attempt_at`          | `timestamp(6)`            | nullable                                                            | Retry schedule.                                                      |
| `last_error_code`          | string                    | nullable                                                            | Generic internal error code only.                                    |
| `lease_token`              | `char(36)`                | nullable                                                            | Opaque token for the worker that owns a `deleting` claim.            |
| `lease_expires_at`         | `timestamp(6)`            | nullable, indexed with status                                       | Claim expiry; an expired claim is recoverable.                       |
| `deleted_at`               | `timestamp(6)`            | nullable                                                            | Successful/idempotent storage-delete time.                           |
| `created_at`, `updated_at` | `timestamp(6)`            | Laravel timestamps                                                  | Audit timestamps.                                                    |

Indexes: (`ledger_id`, `status`, `next_attempt_at`), (`ledger_id`, `status`, `lease_expires_at`), and (`ledger_id`). Object rows are created in the same transaction as their ledger. The ledger cannot be queued without its complete object inventory.

### 4. Models and migrations

- `ResearchDocument` adds the fields above, casts timestamps and `row_version`, and increments `row_version` with the mutation that changes the row.
- `RepositoryDeletionLedger` owns the ledger fields and aggregate projection refresh method.
- `RepositoryDeletionObject` owns encrypted locator persistence and retry metadata.
- `RepositoryDocumentHistorySnapshot` owns the immutable pre-purge history context.
- Migration names and model names use `repository_deletion_objects`, not locator terminology.
- All actor FK migrations use the UUID type and reference `users.id` with `nullOnDelete()`.

### 5. Storage inventory, history snapshots, and FK disposition

**Storage inventory is allowlisted and complete before queueing.** Under the target-document lock, inventory is read only from `document_files.file_path` and `pending_private_file_deletions.storage_path` where `research_document_id` is the target. It must not read `instituteStudies`, infer paths from metadata, enumerate a disk/bucket/prefix/folder, or call a storage listing API. Each candidate is normalized to the configured canonical relative locator, rejected if it is empty, absolute, contains `..`, a backslash, control characters, or an unrecognized storage prefix/type, then deduplicated by (`storage_type`, canonical locator) before encryption and object-row insertion. A queued ledger has exactly one object row for each valid deduplicated candidate; invalid candidates reject the request without creating any queue state.

**History snapshot.** The permanent-delete transaction writes one immutable `repository_document_history_snapshots` record before child purge. It has `ledger_id` (FK to the ledger), scalar `target_research_document_id`, `submission_reference VARCHAR(40)`, `snapshot_json`, `actor_id`, and timestamps. The snapshot supplies document identity/context after retained history references are nulled. `audit_logs` and `activity_logs` are never deleted. On MariaDB, `activity_logs` is canonical history after consolidation. Migration `000045` already dropped `retention_logs` without copying it, so this feature reports that pre-existing gap and does not claim to recover or fabricate missing historical retention rows; new repository-management evidence is written directly to `activity_logs`. SQLite retains `monitoring_logs` and `retention_logs` as immutable typed history.

**Exact FK disposition, by driver.** The migration must discover live constraint names rather than assume Laravel-generated names. On MariaDB, it uses `information_schema.KEY_COLUMN_USAGE` joined to `REFERENTIAL_CONSTRAINTS` to make `activity_logs.research_document_id` nullable and recreate that FK with `ON DELETE SET NULL`; `notifications.research_document_id` is verified as nullable/SET NULL. Consolidated MariaDB does not recreate typed monitoring or retention tables. On SQLite, it rebuilds each retained affected table with a nullable column and `ON DELETE SET NULL`, copying rows and restoring indexes/triggers while foreign-key enforcement is controlled for the rebuild. SQLite applies this to `activity_logs.research_document_id`, `monitoring_logs.research_document_id`, `retention_logs.research_document_id`, and, only if verification finds it is not already compliant, `notifications.research_document_id`. `audit_logs` has no direct document FK and is retained with the snapshot.

| Referencing rows                                                                                                                                                                                                    | MariaDB and SQLite disposition before `research_documents` hard delete                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity_logs`, `notifications`                                                                                                                                                                                    | Retain on both drivers; snapshot context first; direct document FK is nullable with `SET NULL`.                                                                                                            |
| `monitoring_logs`, `retention_logs`                                                                                                                                                                                 | MariaDB: absent after consolidation; new evidence uses canonical `activity_logs`, and pre-existing retention loss is reported rather than fabricated. SQLite: retain with nullable `SET NULL` document FK. |
| `research_review_records`                                                                                                                                                                                           | Purge by `research_document_id`; it is non-history, including any driver-present restrictive FK.                                                                                                           |
| `document_files`, `pending_private_file_deletions`, `research_authors`, `research_review_assignments`, `defense_schedules`, `manuscript_search_documents`, `research_project_team_members`, `class_section_members` | Purge by `research_document_id`.                                                                                                                                                                           |
| `saved_library_items` when the retired legacy table exists                                                                                                                                                          | Purge by `research_document_id` before the parent because its historical FK is restrictive.                                                                                                                |
| `similarity_results`                                                                                                                                                                                                | Purge where `source_research_id = target` **or** `matched_research_id = target`.                                                                                                                           |
| Driver-present legacy mutable tables: `feedback_comments`, `revisions`, `title_validations`, `evaluations`, `methodology_reviews`, `compliance_reviews`, `metadata_reviews`                                         | Purge by `research_document_id` before the parent.                                                                                                                                                         |

The purge transaction deletes the listed mutable rows in child-safe order, then force-deletes the document. It never relies on `CASCADE` as an undocumented cleanup path. MariaDB typed-history removal occurs in the migration/rollout before repository purges, not as an unrecorded per-document purge action.

---

## API Contract

| Method  | Canonical path                                                                      | Operation                                                                         |
| ------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET`   | `/api/office/repository-management/documents`                                       | Paginated document search/filter, including soft-deleted documents.               |
| `GET`   | `/api/office/repository-management/documents/capabilities`                          | Feature flags, supported filters/sort, page limit, ETag and idempotency contract. |
| `GET`   | `/api/office/repository-management/documents/{researchDocument}`                    | Document workspace resource and ETag.                                             |
| `PATCH` | `/api/office/repository-management/documents/{researchDocument}`                    | Metadata update with `If-Match`.                                                  |
| `POST`  | `/api/office/repository-management/documents/{researchDocument}/management-archive` | Management archive; body exactly `{}`.                                            |
| `POST`  | `/api/office/repository-management/documents/{researchDocument}/management-restore` | Management restore; body exactly `{}`.                                            |
| `POST`  | `/api/office/repository-management/documents/{researchDocument}/permanent-delete`   | Queue permanent deletion.                                                         |
| `GET`   | `/api/office/repository-management/deletions`                                       | Paginated aggregate deletion ledger.                                              |
| `GET`   | `/api/office/repository-management/deletions/{deletion}`                            | One aggregate deletion ledger resource.                                           |

All routes use `office.authority`; every `PATCH`/`POST` mutation additionally uses `origin.allowed` and the domain-mutation throttle. No legacy route variants exist. Show, update, archive, and restore explicitly resolve with `withTrashed()`. Permanent delete receives a validated scalar document ID instead of implicit model binding: it resolves the global idempotency hash and ledger replay/conflict first, then loads and locks the `withTrashed()` document only for a new request. This preserves replay after the document has been force-deleted.

### Document representations

- The list response is `{ schema_version: 1, data, links, meta }`. Each item contains `id`, `submission_reference`, `title`, `authors`, `institute`, `degree_program`, `publication_year`, `research_stage`, `submission_status`, a `publication` object, a `management` object with aggregate deletion state, `import.is_imported`, timestamps, server-provided `capabilities`, `permanent_delete_confirmation`, `row_version`, and `etag`. `links` and `meta` retain the standard Laravel paginator shape plus normalized sort and filters.
- List accepts only these query parameters: `q` (submission-reference/title search), `submission_status`, `archive_status`, `visibility`, `management_state` (`active`, `management_archived`, or `legacy_soft_deleted`), `deletion_state` (`none`, `accepted`, or `terminal`), `sort` (`submission_reference`, `title`, `created_at`, `updated_at`, or `management_archived_at`, optionally prefixed with `-`), `page`, and `per_page`. Unknown filters/sorts, invalid enum values, and page values outside the advertised limit return `422 VALIDATION_ERROR`.
- Show returns `{ data }`, where `data` contains every list field plus editable workspace metadata (`abstract`, `keywords`, and the fields accepted by `PATCH`), `management_archived_by`, `restored_at`, `restored_by`, `permanent_delete_queued_by`, and an aggregate `deletion` value of `null` or `{ id, status, object_count, objects_deleted_count, objects_terminal_failed_count, queued_at, started_at, completed_at }`. The current strong ETag is sent as `ETag: "repository-document-{id}-v{row_version}"` and duplicated in `data.etag`.
- `GET /documents/capabilities` returns `{ schema_version: 1, data }` with `data.enabled`, `filters`, `sorts`, `max_per_page`, `editable_fields`, `management_archive`, `management_restore`, `permanent_delete`, and `etag`. `etag` declares `required_for: ["patch", "management_archive", "management_restore", "permanent_delete"]`, `header: "If-Match"`, and strong `"repository-document-{id}-v{row_version}"` format. `permanent_delete` declares `reason_min: 1`, `reason_max: 5000`, confirmation template `DELETE {submission_reference}`, and `idempotency_header: "Idempotency-Key"`.
- `PATCH` and all three document actions require current `If-Match`; missing is `428 PRECONDITION_REQUIRED`, and malformed/stale/nonmatching is `412 PRECONDITION_FAILED`. Validation is `422 VALIDATION_ERROR` with a field-error map; missing document is `404 DOCUMENT_NOT_FOUND`; policy denial is `403 FORBIDDEN`; invalid lifecycle is `409 NOT_ELIGIBLE`; an existing target ledger under another key is `409 DELETION_ALREADY_QUEUED`; and key reuse with another fingerprint is `409 IDEMPOTENCY_CONFLICT`. Authentication is `401 AUTHENTICATION_REQUIRED`, origin denial `403 ORIGIN_NOT_ALLOWED`, oversized body `413 PAYLOAD_TOO_LARGE`, and throttling `429 RATE_LIMIT_EXCEEDED`. Errors never expose SQL, paths, locators, provider responses, or exception text.
- Do not expose encrypted locators, object rows, raw errors, idempotency keys, `idempotency_key_hash`, or `request_fingerprint`.
- A document is editable unless policy forbids it for the existing publication/workflow state. Management archive state alone does not alter publication state.
- `PATCH` accepts only: `title` (filled string, max 500), `abstract` (nullable string, max 50,000), `keywords` (nullable string, max 5,000), `publication_year` (nullable integer 1901–2155), `category_id` (nullable active category ID), `institute` (nullable configured institute), `degree_program` (nullable valid program for the resulting institute, max 255), `manuscript_date_label` (nullable string, max 50), `research_stage` (`title_proposal`, `ongoing`, or `completed`), and `authors` (1–50 ordered entries with nullable existing user UUID, required distinct trimmed `author_name` max 255, and boolean `is_corresponding_author`). At least one field is required. Unknown workflow, publication, storage, management, or identity fields are rejected.

### Actions

**Management archive**

- Requires an exact empty JSON object: `{}`; reject fields or a non-object body with `422`.
- Requires a current `If-Match` as specified above.
- Requires `deleted_at IS NULL` and no active deletion ledger for the target.
- In one transaction, set `deleted_at` and `management_archived_at` to the same time, set `management_archived_by = actor.id`, increment `row_version`, and write audit/activity/monitoring records.
- Preserve `archive_status`, `submission_status`, and `visibility` without modification.

**Management restore**

- Requires `{}` and `deleted_at IS NOT NULL AND management_archived_at IS NOT NULL`.
- Requires a current `If-Match` as specified above.
- Reject legacy/workflow soft-deleted rows and documents with any deletion ledger, including `storage_failed` or `purge_failed`, using `409 NOT_ELIGIBLE`.
- In one transaction, clear `deleted_at`, `management_archived_at`, and `management_archived_by`; set `restored_at`, `restored_by = actor.id`; increment `row_version`; and write audit/activity/monitoring records.
- Preserve `archive_status`, `submission_status`, and `visibility` without modification.

**Permanent delete**

- Requires `reason` (string, max 5000), `confirmation` exactly equal to `DELETE {submission_reference}`, a current strong `If-Match: "repository-document-{id}-v{row_version}"`, and `Idempotency-Key`.
- In one transaction, lock the `withTrashed()` target and lock the row for the globally normalized key hash. Compute the versioned request fingerprint. If the row exists, equal fingerprints return its aggregate ledger resource with `200` and `idempotent_replay: true`; unequal fingerprints return `409 IDEMPOTENCY_CONFLICT`. This replay/conflict decision occurs before current-ETag and lifecycle eligibility checks, so a successful original request remains replayable after it has changed the row version/state. A concurrent absent-key race is resolved by the global unique constraint, then re-read and lock as described in the ledger model.
- For a new key, require management state (`deleted_at` and `management_archived_at` both non-null), no existing accepted deletion for the target, and the current ETag. Build only the allowlisted, validated, deduplicated inventory; encrypt each locator; persist the key hash and fingerprint; create the ledger, every object row, and history snapshot; mark queue metadata with `actor.id`; increment `row_version`; and write immutable `RESEARCH_PERMANENT_DELETE_QUEUED` audit/activity entries containing `actor.id`, `reason`, and `submission_reference`, all in **one database transaction**. On SQLite, also write its retained typed monitoring record; on MariaDB, the canonical event is the activity stream. Any failure rolls back every one of these writes.
- The initial response is `202 { ledger_id, status: "queued", idempotent_replay: false }`; the response and later deletion resources expose aggregate status only. A replay is `200` with that same aggregate shape and `idempotent_replay: true`, using the ledger's current status rather than creating another queue item.

---

## Deletion Processor

### State machines

**Object state transitions**

```
pending -> deleting -> deleted
                    -> retryable -> deleting
                    -> terminal_failed
```

- A worker atomically claims only `pending` or due `retryable` rows by changing it to `deleting`, setting a fresh `lease_token` and `lease_expires_at`, and incrementing `attempts` exactly once.
- Missing storage is a successful idempotent deletion and transitions to `deleted`.
- A failure below the configured maximum transitions to `retryable` with `next_attempt_at`; the final failed attempt transitions to terminal `terminal_failed`.
- Completion/failure updates require both prior `deleting` state and the matching unexpired object `lease_token` **and** a matching unexpired parent-ledger lease, and clear the object lease, preventing concurrent workers from completing or counting one object twice.
- Before each batch, stale object claims (`status = deleting AND lease_expires_at < now()`) are recovered atomically to due `retryable` without incrementing `attempts`; a late worker with the old token cannot complete the reclaimed object.

**Ledger state transitions**

```
queued -> deleting -> purge_retryable -> purge_deleting -> completed
                    -> storage_failed
purge_deleting -> purge_retryable
purge_deleting -> purge_failed
```

- `storage_failed` and `purge_failed` are terminal. `purge_retryable` is explicitly retryable. A ledger remains `deleting` while any object is pending, claimed, or retryable, and its `next_attempt_at` is set to the earliest retryable child time.
- A storage worker claims `queued -> deleting` with a fresh ledger `lease_token` and `lease_expires_at`; it may claim/process objects only while that parent lease is current. The object lease is independent and protects the individual storage operation.
- After all object rows are `deleted`, the ledger transitions to `purge_retryable`. A processor claim changes it to `purge_deleting`, sets a fresh `lease_token`/`lease_expires_at`, and increments `purge_attempts` exactly once.
- A purge failure below the configured maximum returns to `purge_retryable`; the final failure becomes terminal `purge_failed`.
- Ledger completion/failure requires its matching unexpired lease token and clears the lease. Before selection, stale `purge_deleting` claims are atomically returned to due `purge_retryable` without incrementing `purge_attempts`; stale `deleting` storage claims recover expired child claims and clear the parent lease. The scheduler claims `queued`, due `deleting` rows without a live lease, and due `purge_retryable` rows; a due `deleting` row resumes only pending or due-retryable child objects. It never retries terminal ledger states without an explicitly authorized operational repair.

### Counting and processing rules

- Never increment ledger totals as a side effect of a retry. After every conditional object transition, recompute `object_count`, `objects_deleted_count`, and `objects_terminal_failed_count` from the durable object rows in the same transaction, or maintain them with an equivalent idempotent conditional transition.
- A duplicate worker completion changes zero rows and therefore changes zero counts.
- If any object is `terminal_failed`, set ledger `storage_failed` with `STORAGE_DELETION_FAILED`; never proceed to purge.
- Purge only after all objects are `deleted`. Lock and locate the target by scalar `target_research_document_id`; tolerate an already-purged target as idempotent success.
- Purge exactly the documented mutable FK inventory (including non-history `research_review_records`) before force-deleting the document in one transaction. Do not delete audit logs, activity logs, monitoring logs, or retention snapshots; their nullable document FKs use `ON DELETE SET NULL`.
- The scheduler runs every five minutes, uses bounded batches and configured storage/purge retry limits, logs generic error codes, and provides neither a user retry nor a cancel operation.

---

## Workstreams and Acceptance Checks

### B1 — Migrations and models

**Exclusive files (Database Builder):**

- `v1/backend/database/migrations/2026_09_13_000001_add_repository_management_state_to_research_documents.php`
- `v1/backend/database/migrations/2026_09_13_000002_create_repository_deletion_ledger.php`
- `v1/backend/database/migrations/2026_09_13_000003_create_repository_deletion_objects_and_history_snapshots.php`
- `v1/backend/database/migrations/2026_09_13_000004_preserve_repository_history_foreign_keys.php`
- `v1/backend/app/Models/ResearchDocument.php`
- `v1/backend/app/Models/RepositoryDeletionLedger.php`
- `v1/backend/app/Models/RepositoryDeletionObject.php`
- `v1/backend/app/Models/RepositoryDocumentHistorySnapshot.php`

**Acceptance checks:**

- Fresh migration creates the management timestamps, UUID actor FKs to `users.id`, `row_version`, `unsignedBigInteger` ledger scalar target without a document FK, `submission_reference VARCHAR(40)`, persisted hashes, leases, object table, and history snapshot table.
- Management scope requires both `deleted_at` and `management_archived_at`; legacy scope requires `deleted_at` with null management timestamp.
- Unique target/key hash and idempotency fingerprint behavior are tested.
- Object/ledger retry and terminal states, lease-token claims, stale-claim recovery, and recomputed counts are tested.
- Driver-specific nullable `SET NULL` history migrations and the full FK-inventory test pass.

### B2 — Repository Management API

**Exclusive files (Backend API Builder):**

- `v1/backend/app/Http/Controllers/ResearchOfficeController.php`
- `v1/backend/app/Services/RepositoryManagementService.php`
- `v1/backend/app/Services/RepositoryDeletionInventory.php`
- `v1/backend/app/Services/RepositoryDeletionLocatorCipher.php`
- `v1/backend/app/Policies/ResearchDocumentPolicy.php`
- `v1/backend/bootstrap/providers.php`
- `v1/backend/routes/web.php`

**Acceptance checks:**

- Only the canonical `/api/office/repository-management/documents` and `/api/office/repository-management/deletions` resources and their documented descendants are registered.
- Every mutation has `office.authority`, `origin.allowed`, and the domain-mutation throttle; archive and restore accept only `{}` and preserve all three publication fields.
- `actor.id` is written to UUID actor columns.
- Permanent delete persists the target scalar, key hash, request fingerprint, and only the canonical validated/deduplicated `document_files`/`pending_private_file_deletions` inventory; it never performs folder/bucket enumeration. Duplicate requests are idempotent or conflict as specified.
- Ledger, object rows, queue metadata, history snapshot, and `RESEARCH_PERMANENT_DELETE_QUEUED` audit/activity/monitoring entries with `actor.id`, reason, and submission reference commit atomically.
- Deletion responses contain aggregate state only.

### B3 — Scheduled deletion processor

**Exclusive files (Backend Processor Builder):**

- `v1/backend/app/Console/Commands/ProcessRepositoryDeletionLedger.php`
- `v1/backend/app/Services/RepositoryDeletionProcessor.php`
- `v1/backend/app/Services/RepositoryDeletionStorageAdapter.php`
- `v1/backend/config/console.php`

**Acceptance checks:**

- Local and Supabase deletion are idempotent for an absent object.
- Retryable versus terminal object and ledger transitions, token-checked completion, and stale lease recovery follow the state machines.
- Concurrent processing cannot double increment attempts or aggregate counts.
- DB purge is transactional, purges non-history `research_review_records`, and preserves immutable snapshots with null document references.

### F1–F3 — Frontend API, workspace, and navigation

**Exclusive files (Frontend Builder):**

- F1: `v1/frontend/src/api.ts`
- F2: `v1/frontend/src/RepositoryManagementWorkspace.tsx`, `v1/frontend/src/RepositoryManagementWorkspace.test.tsx`
- F3: `v1/frontend/src/RoleSidebarPages.tsx`, `v1/frontend/src/AdminSidebarPages.tsx`

No file above is assigned to another workstream. Existing storage services are consumed through their public interface and are not edited by this plan.

- Use only the canonical document and deletion paths.
- Archive and restore dialogs send `{}` and state that publication state is preserved.
- Restore and permanent-delete controls appear only when both management-state timestamps are present and no accepted deletion is active.
- Permanent deletion requires reason, exact confirmation, ETag, and client-generated idempotency key.
- Ledger UI displays aggregate counts and generic status only.

---

## Test Gates

### Backend

- `php artisan migrate:fresh --seed`
- `php artisan test --filter=RepositoryManagementServiceTest`
- `php artisan test --filter=RepositoryDeletionProcessorTest`
- `php artisan test --filter=ResearchOfficeRepositoryTest`
- `php artisan test --filter=DeletionLedgerApiTest`
- `php artisan test --filter=ResearchDocumentPolicyTest`
- `composer test`

Key scenarios include archive/restore `{}` validation and publication preservation; `origin.allowed` on every mutation; management-state derivation; `users.id` actor FKs; `VARCHAR(40)` submission-reference and unsigned-BIGINT target schema; idempotency replay/conflict; no document FK on the scalar target; only table-sourced canonical/deduplicated storage inventory with no listing/enumeration; atomic queued audit with actor/reason/reference; durable object transitions; stale object and ledger claim recovery; no double counts under retry/concurrency; absent-object success; terminal failures not reprocessed; and no sensitive storage/idempotency data in responses.

**Full FK-inventory gate:** `RepositoryDeletionForeignKeyInventoryTest` runs after fresh migration on both supported drivers. For MariaDB it reads `information_schema.KEY_COLUMN_USAGE` plus `REFERENTIAL_CONSTRAINTS`; for SQLite it executes `PRAGMA foreign_key_list` for every application table. It fails on any FK that references `research_documents.id` but is absent from the disposition table above, on any retained-history reference that is not nullable/`SET NULL`, or when a seeded permanent purge leaves a mutable child (especially `research_review_records`) or cannot null retained history. This is an inventory assertion, not merely a test of the known model relations.

### Frontend

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm run test -- --run src/RepositoryManagementWorkspace.test.tsx`
- `npm run build`

Key scenarios include canonical paths, `{}` archive/restore requests, publication-state preservation, state-derived action visibility, ETag/idempotency permanent-delete submission, and aggregate-only deletion display.

---

## Migration and Rollout

1. Deploy migrations with queue processing disabled. Verify UUID actor FKs reference `users.id`, the ledger target has no document FK, `submission_reference` is `VARCHAR(40)`, leases and object/history rows/indexes exist, and the full driver-specific FK inventory passes.
2. Backfill only `management_archived_at` for records known to have been management-archived. Do not infer management state from publication/workflow fields. Existing soft-deleted rows without a reliable management timestamp remain legacy/workflow-deleted and are not eligible for management restore or permanent delete.
3. Verify immutable history snapshots and their nullable `ON DELETE SET NULL` FKs using the full inventory gate.
4. Deploy API and processor, enable the five-minute scheduler only after a zero-queue check, then deploy frontend navigation behind the optional `REPOSITORY_MANAGEMENT_ENABLED` flag.
5. **Rollback guard for all deletion evidence:** rollback is prohibited while any ledger, deletion-object, or history-snapshot row exists, including failed and completed rows. First disable queueing and scheduler workers, export every ledger/object/history-snapshot row plus corresponding `audit_logs`, `activity_logs`, and SQLite retained `monitoring_logs`/`retention_logs` evidence with checksums and a tested restoration runbook, then drain or operationally resolve in-flight work and clear expired leases. Only explicit data-owner authorization after verified evidence preservation permits rollback; otherwise the additive tables and nullable history FKs remain. Never drop deletion evidence merely because a backup exists.

---

## Handoff

Implementation starts only after plan approval, a clean baseline SHA, MariaDB migration-safety confirmation, and workstream ownership acknowledgement. The Plan Coordinator creates `feat/repository-management` from the approved baseline and assigns the workstreams.
