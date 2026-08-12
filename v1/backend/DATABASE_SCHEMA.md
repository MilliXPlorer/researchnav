# ResearchNAV database schema

This document describes the active Laravel schema in `backend/database/migrations` and the Eloquent models in `backend/app/Models`. It is the current MariaDB schema, not the historical Express/PostgreSQL design.

## Entity classification

The thesis claim remains exactly eight major entities:

1. `USER_ROLES`
2. `USERS`
3. `RESEARCH_DOCUMENTS`
4. `SIMILARITY_RESULTS`
5. `FEEDBACK_COMMENTS`
6. `REVISIONS`
7. `NOTIFICATIONS`
8. `MONITORING_LOGS`

Supporting implementation entities are `categories`, `research_authors`, `document_files`, `title_validations`, `audit_logs`, and `research_review_assignments`. `sessions` and `migrations` are Laravel framework tables. There are no vector tables.

## Conventions and key decisions

- The active local driver is MariaDB. The schema targets `utf8mb4` and InnoDB with strict mode.
- User identifiers are UUID strings stored as `CHAR(36)`. Domain identifiers are auto-incrementing unsigned `BIGINT` values unless noted otherwise. `notifications.id` is a UUID.
- Eloquent casts are application behavior. MariaDB enum and check constraints are database behavior. Both are listed below.
- `USERS` and `categories` use Laravel soft deletes. The other application tables do not have a soft-delete column unless stated. Monitoring and audit rows are append-only and their models reject update and delete operations.
- Research metadata has both the original `title` and an indexed `normalized_title`. The original title is displayed and preserved. `ResearchService` derives the normalized value by lowercasing, replacing non-alphanumeric runs with spaces, and trimming. It is not a replacement for the original title.
- Uploaded file rows retain every version. `is_current` moves from the previous row to the new row for each document and type. The database does not enforce immutable `document_files` updates, but the upload service appends versions rather than replacing file rows.
- Private files use the `researchnav_private` local disk at `storage/app/private`. A stored path is `research/{research_document_id}/{uuid}.{extension}`. Files are served through the authenticated download route, not the public disk.

## Application tables

### `user_roles` (`USER_ROLES`)

Purpose: canonical role definitions used by authorization and by the canonical `users.role_id` foreign key.

Columns and constraints:

- `id` unsigned `BIGINT`, primary key, auto-increment.
- `name` `VARCHAR(100)`, unique, display name.
- `slug` `VARCHAR(100)`, unique, canonical role key.
- `description` `TEXT`, nullable.
- `is_active` boolean, default `true`, cast to boolean.
- `created_at`, `updated_at` timestamps.

The eight seeded role names and slugs are `Researcher` / `researcher`, `Research Instructor` / `research_instructor`, `Research Adviser` / `research_adviser`, `Research Office Personnel` / `research_office`, `System Administrator` / `administrator`, `Statistician` / `statistician`, `Librarian` / `librarian`, and `Research Panelist` / `research_panelist`.

Indexes: unique `name`, unique `slug`.

Relationship: one role has many `users`. Deleting or updating a role referenced by a user is restricted.

### `users` (`USERS`)

Purpose: authenticated accounts, Google identity data, canonical roles, account state, and legacy compatibility fields.

Columns and constraints:

- `id` `CHAR(36)`, UUID primary key, non-incrementing Eloquent key.
- `email` `VARCHAR(254)`, unique. A MariaDB check requires `email = LOWER(email)` using binary comparison.
- `google_sub` `VARCHAR(255)`, nullable and unique when present. Non-SQLite migrations use binary collation so Google subjects remain case-sensitive.
- `role` enum: `admin`, `researcher`, `adviser`, `instructor`, `panel`, `statistician`, `coordinator`, `librarian`, `research-office`, `academics`.
- `role_id` unsigned `BIGINT`, required after canonical backfill, FK to `user_roles.id`.
- `access_status` enum: `active`, `invited`, `blocked`, default `blocked`.
- `account_status` enum: `active`, `inactive`, `suspended`, `pending`, default `pending`.
- `is_admin` boolean, default `false`. A MariaDB check requires it to be true only when `role = admin`.
- `student_employee_id` `VARCHAR(100)`, nullable.
- `first_name`, `middle_name`, `last_name` `VARCHAR(100)`, nullable. Google-created accounts may have null profile names.
- `password` `VARCHAR(255)`, nullable and cast as `hashed`. Google accounts may have a null password.
- `invited_by` `CHAR(36)`, nullable, self-FK to `users.id`.
- `invitation_sent_at`, `confirmed_at`, `last_login_at` nullable datetime(6).
- `email_verified_at` nullable timestamp.
- `remember_token` nullable `VARCHAR(100)`.
- `created_at`, `updated_at` datetime(6).
- `deleted_at` nullable timestamp(6) for soft deletes. Eloquent uses `SoftDeletes`; rows remain in the database and ordinary queries exclude them.

Model casts: `is_admin` boolean; the four account timestamps and `email_verified_at` datetime; `password` hashed. `role` and both status fields remain strings backed by database enums.

The model keeps `role` and `role_id` synchronized. Legacy roles map to canonical slugs as follows: `admin` to `administrator`, `researcher` to `researcher`, `adviser` to `research_adviser`, `instructor` to `research_instructor`, `statistician` to `statistician`, `librarian` to `librarian`, `panel` to `research_panelist`, and `coordinator`, `research-office`, and `academics` to `research_office`. `access_status` maps to `account_status`: `active` to `active`, `invited` and `blocked` to `pending`. Canonical `inactive` and `suspended` map back to legacy `blocked`.

Indexes: unique `email`, unique nullable `google_sub`, `role`, `access_status`, `role_id`, `account_status`, and `student_employee_id`.

Relationships: users belong to one `user_roles` row; `invited_by` is a self-reference; users submit documents, author research, upload files, create feedback, request revisions, perform monitoring, validate titles, create audit rows, and participate in review assignments. FK delete rules are restrict for required user references, null for optional historical actor references, and restrict for `invited_by`.

### `research_documents` (`RESEARCH_DOCUMENTS`)

Purpose: research metadata and the controlled submission, review, approval, archive, and visibility state.

Columns and constraints:

- `id` unsigned `BIGINT`, primary key, auto-increment.
- `submitted_by` `CHAR(36)`, required FK to `users.id`.
- `category_id` unsigned `BIGINT`, nullable FK to `categories.id`.
- `title` `VARCHAR(500)`, original title.
- `normalized_title` `VARCHAR(500)`, nullable, indexed normalized title used for comparison and search support.
- `abstract` `LONGTEXT`, nullable.
- `keywords` `TEXT`, nullable.
- `publication_year` nullable MariaDB `YEAR` (SQLite uses unsigned small integer).
- `institution_name`, `institution_location`, `academic_unit`, and `degree_program` nullable `VARCHAR(255)` metadata.
- `manuscript_date_label` nullable `VARCHAR(50)` preserves source labels such as `May 2026` without inventing a day.
- `abstract_provenance` nullable `VARCHAR(255)` identifies whether an abstract was synthesized from a source manuscript.
- `import_source_sha256` nullable unique `CHAR(64)` and `import_source_filename` nullable indexed `VARCHAR(500)` are private import-identity fields. API resources never expose them.
- `research_stage` enum: `title_proposal`, `ongoing`, `completed`.
- `submission_status` enum: `draft`, `submitted`, `under_review`, `revision_required`, `approved`, `archived`; default `draft`.
- `archive_status` enum: `not_archived`, `pending_archiving`, `archived`; default `not_archived`.
- `visibility` enum: `private`, `registered_only`, `public`; default `private`.
- `submitted_at`, `approved_at`, `archived_at` nullable datetime(6).
- `created_at`, `updated_at` datetime(6).
- `deleted_at` nullable datetime(6). Eloquent soft deletes the metadata row; related rows are not database-cascaded.

Model casts: `publication_year` integer; the five date fields are datetime. Statuses and visibility remain strings backed by enums.

Indexes: `research_documents_submitter_status_idx` on (`submitted_by`, `submission_status`); `research_documents_category_year_idx` on (`category_id`, `publication_year`); `research_documents_stage_status_archive_idx` on (`research_stage`, `submission_status`, `archive_status`); `research_documents_visibility_status_idx` on (`visibility`, `submission_status`); single-column indexes on `normalized_title`, `title` (`rd_title_idx`), `category_id` (`rd_category_idx`), `publication_year` (`rd_year_idx`), `research_stage` (`rd_stage_idx`), `submission_status` (`rd_submission_status_idx`), `archive_status` (`rd_archive_status_idx`), `visibility` (`rd_visibility_idx`), `submitted_by` (`rd_submitted_by_idx`), and `submitted_at` (`rd_submitted_at_idx`).

Relationships: belongs to the submitter and optional category; has authors, files, similarity results as source and matched document, feedback comments, revisions, monitoring logs, title validations, and review assignments. Both document foreign keys in `similarity_results` restrict deletion. The submitter and category foreign keys also restrict deletion and update.

Reviewed corpus imports match only the immutable source checksum, reject title and normalized-title collisions, preserve the original import owner, and validate every source as a contained, non-symlink OOXML package. The current corpus has eleven DOCX files but ten distinct studies because the two Caralos files have the same checksum. Canonical files are copied to private storage; source filenames and checksums are not public metadata.

### `similarity_results` (`SIMILARITY_RESULTS`)

Purpose: trusted, persisted comparisons between two different research documents. It stores results supplied to `SimilarityService`; it is not a vector store or an automatic approval engine.

Columns and constraints:

- `id` unsigned `BIGINT`, primary key, auto-increment.
- `source_research_id` and `matched_research_id` unsigned `BIGINT`, required FKs to `research_documents.id`, both restrict on delete and update.
- `source_title` and `matched_title` `VARCHAR(500)`, title snapshots captured at analysis time.
- `tfidf_score`, `cosine_score`, `fasttext_score`, `final_similarity_score`, and `threshold` `DECIMAL(8,6)`. The first and third are nullable; cosine defaults to `0`; threshold defaults to `0.700000`.
- `is_flagged` boolean, default `false`, cast to boolean.
- `contextual_analysis` `LONGTEXT`, nullable.
- `matched_terms` JSON, nullable, cast to array.
- `analysis_type` enum: `title`, `document`, `search_retrieval`.
- `analyzed_at`, `created_at`, `updated_at` datetime(6).

Model casts: all five decimal fields use `decimal:6`; `is_flagged` boolean; `matched_terms` array; `analyzed_at` datetime. Server-side model saving always resets `threshold` to the string value `0.700000` and derives `is_flagged` from `final_similarity_score >= threshold`, regardless of a caller-provided flag.

MariaDB checks bound every non-null component score, final score, and threshold to `0..1`; require distinct source and matched documents; and require flag consistency. Scores are therefore normalized to the inclusive range 0 to 1 with six fractional places. The fixed `.700000` value is a server-side flagging rule, not an algorithm assertion. Mock scores appear only in factories and tests. A flagged similarity result never automatically approves or rejects a document. A reviewer must create and record an explicit `title_validations` decision.

Indexes: `similarity_results_source_score_idx` on (`source_research_id`, `final_similarity_score`); `similarity_results_matched_score_idx` on (`matched_research_id`, `final_similarity_score`); (`is_flagged`, `analyzed_at`); and `analysis_type`.

Relationships: each result belongs to one source and one matched document, and can have many title validations.

### `feedback_comments` (`FEEDBACK_COMMENTS`)

Purpose: comments and review feedback attached to a research document, optionally to a specific file version.

Columns and constraints: `id` unsigned `BIGINT` primary key; required `research_document_id` FK; required UUID `user_id` FK; nullable `document_file_id` FK; `comment` `LONGTEXT`; `feedback_type` enum `comment`, `suggestion`, `revision_request`, `approval_remark`, `general_feedback`, default `general_feedback`; `feedback_status` enum `open`, `acknowledged`, `resolved`, default `open`; and `created_at`, `updated_at` datetime(6). The document and user FKs restrict deletion and update. The file FK is nullable and nulls on file deletion.

Model status values are strings. Indexes: (`research_document_id`, `feedback_status`), `user_id`, and `document_file_id`. Relationships belong to the document, user, and optional file.

### `revisions` (`REVISIONS`)

Purpose: scoped revision requests and resubmission state for a research document.

Columns and constraints: `id` unsigned `BIGINT` primary key; required `research_document_id` FK; required UUID `requested_by` FK; nullable `document_file_id` FK; `revision_number` unsigned integer; `revision_remarks` `LONGTEXT`; `revision_status` enum `requested`, `in_progress`, `resubmitted`, `under_review`, `accepted`, default `requested`; `requested_at` required datetime(6); nullable `submitted_at` and `resolved_at` datetime(6); and `created_at`, `updated_at` datetime(6). The document and requester FKs restrict delete and update. The file FK nulls on delete and restricts update. `revision_number` is unique per document.

Model casts: `revision_number` integer and the three lifecycle dates datetime. Indexes: (`research_document_id`, `revision_status`), `requested_by`, and `document_file_id`. Open revisions are `requested` or `in_progress`.

### `monitoring_logs` (`MONITORING_LOGS`)

Purpose: research-specific operational timeline, including activity and status changes. This is distinct from security and accountability auditing.

Columns and constraints: `id` unsigned `BIGINT` primary key; required `research_document_id` FK; nullable UUID `performed_by` FK; `activity_type` `VARCHAR(100)`; nullable `remarks`, `previous_status`, `new_status`, and `monitoring_status`; required `activity_date` datetime(6); and `created_at` timestamp(6) with current-time default. The document FK restricts delete and update. The actor FK nulls on delete and restricts update. There is no `updated_at` column.

The model has no normal timestamp pair and casts `activity_date` and `created_at` to datetime. Model hooks reject updates and deletes, making monitoring rows immutable at the application layer.

Indexes: (`research_document_id`, `activity_date`), (`performed_by`, `activity_date`), and (`activity_type`, `activity_date`). `monitoring_status` is a free string, not an enum.

### `notifications` (`NOTIFICATIONS`)

Purpose: the built-in notification table used by the custom `ResearchDatabaseChannel` for in-app research activity notifications.

Columns and constraints: UUID `id` primary key; `type` string; `notifiable_type` and UUID `notifiable_id` from `uuidMorphs('notifiable')`; nullable `research_document_id` unsigned `BIGINT` FK to `research_documents.id`; `data` text; nullable `read_at` timestamp; and `created_at`, `updated_at` timestamps. The research document FK nulls on delete and restricts on update.

`notifiable_type` and `notifiable_id` are a polymorphic application link and have no FK to `users` or any other table. The custom channel creates rows through the notifiable model and stores the document ID separately when present. Indexes are the morph index from `uuidMorphs` and `research_document_id`.

### Supporting table: `categories`

Purpose: research classification.

Columns: `id` unsigned `BIGINT` primary key; unique `name` `VARCHAR(150)`; unique `slug` `VARCHAR(180)`; nullable `description` text; `is_active` boolean default `true`, cast to boolean; `created_at`, `updated_at`; and nullable `deleted_at` for Eloquent soft deletes.

Indexes: unique `name`, unique `slug`, and (`is_active`, `name`). A document's category FK restricts category deletion and update. Soft-deleted categories remain physically present and are excluded by ordinary model queries.

### Supporting table: `research_authors`

Purpose: ordered author names for a research document, with optional links to ResearchNAV accounts.

Columns: `id` unsigned `BIGINT` primary key; required `research_document_id` FK; nullable UUID `user_id` FK; `author_name` `VARCHAR(255)`; `author_order` unsigned integer default `1`; `is_corresponding_author` boolean default `false`; and `created_at`, `updated_at`. The document FK restricts delete and update. The optional user FK nulls on user deletion and restricts update.

Model casts: `author_order` integer and `is_corresponding_author` boolean. Indexes: unique (`research_document_id`, `author_order`), unique (`research_document_id`, `author_name`), and `user_id`. Replacing authors deletes existing author rows and inserts the supplied ordered list, so this table is not soft-deleted.

### Supporting table: `document_files`

Purpose: private uploaded file metadata and version history for a research document.

Columns: `id` unsigned `BIGINT` primary key; required `research_document_id` and UUID `uploaded_by` FKs; `document_type` enum `title_proposal`, `draft`, `chapter`, `revised_manuscript`, `final_manuscript`, `attachment`; `version_number` unsigned integer; `original_filename` `VARCHAR(500)`; `stored_filename` `VARCHAR(500)`; `file_path` `VARCHAR(1000)`; nullable `file_extension` `VARCHAR(50)`, `mime_type` `VARCHAR(255)`, and unsigned `file_size` `BIGINT`; `is_current` boolean default `true`; required `uploaded_at` datetime(6); and `created_at`, `updated_at` datetime(6). Both FKs restrict deletion and update.

The model casts `version_number` and `file_size` to integer, `is_current` to boolean, and `uploaded_at` to datetime. A model guard and MariaDB check require `version_number >= 1`. The unique key on (`research_document_id`, `document_type`, `version_number`) prevents duplicate versions. Indexes: (`research_document_id`, `document_type`, `is_current`), `uploaded_by`, plus the unique key. There is no soft delete. Current rows are selected with the `current` scope.

### Supporting table: `title_validations`

Purpose: explicit human title-review decisions, including the similarity result considered by the reviewer.

Columns: `id` unsigned `BIGINT` primary key; required `research_document_id` FK; nullable `similarity_result_id` FK; required UUID `validated_by` FK; `validation_status` enum `pending`, `approved`, `revision_required`, `rejected`, default `pending`; nullable `adviser_remarks` `LONGTEXT`; nullable `validated_at` datetime(6); and `created_at`, `updated_at` datetime(6). All three FKs restrict deletion and update, including the nullable similarity FK.

The model casts `validated_at` to datetime. Indexes: (`research_document_id`, `validation_status`), `similarity_result_id`, and `validated_by`. Pending rows are the only rows eligible for a decision. The assigned reviewer must explicitly record `approved`, `revision_required`, or `rejected`.

### Supporting table: `audit_logs`

Purpose: security and accountability history for actor actions. It is not the research progress timeline.

Columns: `id` unsigned `BIGINT` primary key; nullable UUID `user_id` FK; `action` `VARCHAR(100)`; nullable `entity_type` `VARCHAR(150)` and `entity_id` `VARCHAR(100)`; nullable `description` `LONGTEXT`, `ip_address` `VARCHAR(45)`, and `user_agent` text; and `created_at` timestamp(6) with current-time default. The user FK nulls on deletion and restricts update. `entity_type` and `entity_id` are application metadata and are not foreign keys.

The model has no `updated_at`, casts `created_at` to datetime, and rejects update and delete operations. Indexes: (`entity_type`, `entity_id`) and (`user_id`, `created_at`). Audit descriptions are deliberately human summaries, not request payloads.

### Supporting table: `research_review_assignments`

Purpose: assignment-scoped authorization for advisers and instructors reviewing one research document. This table is intentionally included in the implementation schema even though it is not one of the eight major thesis entities.

Columns: `id` unsigned `BIGINT` primary key; required unsigned `BIGINT` `research_document_id` FK; required UUID `reviewer_id` and `assigned_by` FKs to `users.id`; `review_role` enum `adviser`, `instructor`; `is_active` boolean default `true`, cast to boolean; and `created_at`, `updated_at` datetime(6). All three FKs restrict deletion and update.

The unique key (`research_document_id`, `reviewer_id`, `review_role`) is named `research_review_assignment_unique`. Indexes are `review_assignment_document_active_idx` on (`research_document_id`, `is_active`) and `review_assignment_reviewer_active_idx` on (`reviewer_id`, `is_active`). Replacing assignments deactivates omitted rows and activates or creates the supplied rows. A reviewer can review a document only when the assignment is active, unless the actor is research office personnel or an administrator.

## Framework tables

### `sessions`

Laravel database-session storage, not a domain entity. Columns are `id` string primary key, nullable UUID-shaped `user_id` with an index but no FK, nullable `ip_address` `VARCHAR(45)`, nullable `user_agent` text, `payload` long text, and indexed integer `last_activity`.

### `migrations`

Laravel's migration ledger. It records the migration name and batch in the standard framework table and is not part of the application ERD or the eight-entity thesis claim.

## Workflow and visibility rules

The implemented submission transitions are:

```text
draft -> submitted -> under_review -> approved -> archived
                         |
                         v
                 revision_required -> under_review
```

- Only a document owner can submit a draft, edit `draft` or `revision_required` metadata, and resubmit the latest unresolved revision.
- A reviewer or research office actor can move `submitted` to `under_review` and `under_review` to `approved`. Active adviser or instructor assignments are checked per document. The service records `approved_at` when approval occurs.
- Revision requests are created only while `under_review`, set the document to `revision_required`, and create an incrementing per-document revision number. Resubmission sets the revision to `resubmitted` and the document back to `under_review`.
- Only research office personnel or an administrator can archive approved research. Archiving sets `submission_status = archived`, `archive_status = archived`, records `archived_at`, and applies the requested visibility.
- Similarity flags do not make workflow decisions. Human validation and authorized status transitions are separate operations.
- The public repository query is exactly: `submission_status IN ('approved', 'archived') AND archive_status = 'archived' AND visibility = 'public'`. Registered-only research is not returned by the public repository.
- Imported source manuscripts are made `archived` and `public` only through the explicit import command. Their `approved_at` and `submitted_at` remain null, so repository publication does not claim academic approval or a precise submission date.

## Referential actions summary

The schema uses restrict-on-delete for required document, category, role, submitter, uploader, reviewer, assigner, validator, requester, and similarity references. Optional historical actor references use null-on-delete for `research_authors.user_id`, `monitoring_logs.performed_by`, and `audit_logs.user_id`. Optional file references in feedback and revisions null on file deletion. The optional notification document reference nulls on document deletion. User soft deletes do not cascade to domain rows.
