# ResearchNAV entity relationship diagram

## Eight major thesis entities

The thesis model contains exactly these eight major entities:

1. `USER_ROLES`
2. `USERS`
3. `RESEARCH_DOCUMENTS`
4. `SIMILARITY_RESULTS`
5. `FEEDBACK_COMMENTS`
6. `REVISIONS`
7. `NOTIFICATIONS`
8. `MONITORING_LOGS`

The diagram also shows the six supporting implementation tables required by the active Laravel services: `CATEGORIES`, `RESEARCH_AUTHORS`, `DOCUMENT_FILES`, `TITLE_VALIDATIONS`, `AUDIT_LOGS`, and `RESEARCH_REVIEW_ASSIGNMENTS`. Framework tables `SESSIONS` and `MIGRATIONS` are listed separately and are intentionally not in the application ERD.

```mermaid
erDiagram
    USER_ROLES {
        bigint id PK
        string name UK
        string slug UK
        boolean is_active
    }
    USERS {
        uuid id PK
        string email UK
        string google_sub UK
        bigint role_id FK
        string role
        string access_status
        string account_status
        boolean is_admin
        uuid invited_by FK
        datetime deleted_at
    }
    CATEGORIES {
        bigint id PK
        string name UK
        string slug UK
        boolean is_active
        datetime deleted_at
    }
    RESEARCH_DOCUMENTS {
        bigint id PK
        uuid submitted_by FK
        bigint category_id FK
        string title
        string normalized_title
        string institution_name
        string academic_unit
        string degree_program
        string manuscript_date_label
        string abstract_provenance
        string import_source_sha256 UK
        string research_stage
        string submission_status
        string archive_status
        string visibility
        datetime deleted_at
    }
    RESEARCH_AUTHORS {
        bigint id PK
        bigint research_document_id FK
        uuid user_id FK
        string author_name
        int author_order
        boolean is_corresponding_author
    }
    DOCUMENT_FILES {
        bigint id PK
        bigint research_document_id FK
        uuid uploaded_by FK
        string document_type
        int version_number
        string file_path
        boolean is_current
    }
    SIMILARITY_RESULTS {
        bigint id PK
        bigint source_research_id FK
        bigint matched_research_id FK
        decimal final_similarity_score
        decimal threshold
        boolean is_flagged
        string analysis_type
    }
    FEEDBACK_COMMENTS {
        bigint id PK
        bigint research_document_id FK
        uuid user_id FK
        bigint document_file_id FK
        string feedback_type
        string feedback_status
    }
    REVISIONS {
        bigint id PK
        bigint research_document_id FK
        uuid requested_by FK
        bigint document_file_id FK
        int revision_number
        string revision_status
    }
    MONITORING_LOGS {
        bigint id PK
        bigint research_document_id FK
        uuid performed_by FK
        string activity_type
        string previous_status
        string new_status
        string monitoring_status
    }
    NOTIFICATIONS {
        uuid id PK
        string type
        string notifiable_type
        uuid notifiable_id
        bigint research_document_id FK
        datetime read_at
    }
    TITLE_VALIDATIONS {
        bigint id PK
        bigint research_document_id FK
        bigint similarity_result_id FK
        uuid validated_by FK
        string validation_status
    }
    AUDIT_LOGS {
        bigint id PK
        uuid user_id FK
        string action
        string entity_type
        string entity_id
    }
    RESEARCH_REVIEW_ASSIGNMENTS {
        bigint id PK
        bigint research_document_id FK
        uuid reviewer_id FK
        uuid assigned_by FK
        string review_role
        boolean is_active
    }

    USER_ROLES ||--o{ USERS : defines
    USERS ||--o{ USERS : invites
    USERS ||--o{ RESEARCH_DOCUMENTS : submits
    CATEGORIES ||--o{ RESEARCH_DOCUMENTS : classifies
    RESEARCH_DOCUMENTS ||--o{ RESEARCH_AUTHORS : has
    USERS o|--o{ RESEARCH_AUTHORS : optionally_identifies
    RESEARCH_DOCUMENTS ||--o{ DOCUMENT_FILES : stores_versions
    USERS ||--o{ DOCUMENT_FILES : uploads
    RESEARCH_DOCUMENTS ||--o{ SIMILARITY_RESULTS : source
    RESEARCH_DOCUMENTS ||--o{ SIMILARITY_RESULTS : matched
    RESEARCH_DOCUMENTS ||--o{ FEEDBACK_COMMENTS : receives
    USERS ||--o{ FEEDBACK_COMMENTS : writes
    DOCUMENT_FILES o|--o{ FEEDBACK_COMMENTS : scopes
    RESEARCH_DOCUMENTS ||--o{ REVISIONS : has_requests
    USERS ||--o{ REVISIONS : requests
    DOCUMENT_FILES o|--o{ REVISIONS : supports
    RESEARCH_DOCUMENTS ||--o{ MONITORING_LOGS : tracks
    USERS o|--o{ MONITORING_LOGS : performs
    RESEARCH_DOCUMENTS o|--o{ NOTIFICATIONS : references
    USERS ||..o{ NOTIFICATIONS : notifiable_polymorphic_no_FK
    RESEARCH_DOCUMENTS ||--o{ TITLE_VALIDATIONS : requires
    SIMILARITY_RESULTS o|--o{ TITLE_VALIDATIONS : informs
    USERS ||--o{ TITLE_VALIDATIONS : records
    USERS o|--o{ AUDIT_LOGS : acts
    RESEARCH_DOCUMENTS ||--o{ RESEARCH_REVIEW_ASSIGNMENTS : assigned_review
    USERS ||--o{ RESEARCH_REVIEW_ASSIGNMENTS : reviews
    USERS ||--o{ RESEARCH_REVIEW_ASSIGNMENTS : assigns
```

## Supporting and framework tables

Supporting implementation tables:

- `CATEGORIES` classifies documents and is soft-deletable.
- `RESEARCH_AUTHORS` stores ordered author names and optionally links an author to a UUID user.
- `DOCUMENT_FILES` stores private file metadata. Versions are per document and `document_type`, begin at `1`, and use `is_current` to identify the current version.
- `TITLE_VALIDATIONS` stores explicit human decisions: `pending`, `approved`, `revision_required`, or `rejected`.
- `AUDIT_LOGS` stores immutable actor and action history. `entity_type` and `entity_id` are metadata, not foreign keys.
- `RESEARCH_REVIEW_ASSIGNMENTS` scopes adviser or instructor review by document. Its roles are `adviser` and `instructor`, and only active assignments authorize those reviewers.

Framework tables:

- `SESSIONS` stores Laravel database sessions. Its indexed `user_id` is not a database FK.
- `MIGRATIONS` stores Laravel's migration ledger.

## Status, threshold, and public rule notes

- `RESEARCH_DOCUMENTS.research_stage`: `title_proposal`, `ongoing`, `completed`.
- `RESEARCH_DOCUMENTS.submission_status`: `draft`, `submitted`, `under_review`, `revision_required`, `approved`, `archived`.
- `RESEARCH_DOCUMENTS.archive_status`: `not_archived`, `pending_archiving`, `archived`.
- `RESEARCH_DOCUMENTS.visibility`: `private`, `registered_only`, `public`.
- Canonical user roles: `researcher`, `research_instructor`, `research_adviser`, `research_office`, `administrator`, `statistician`, `librarian`, and `research_panelist`.
- Workflow permits `draft -> submitted -> under_review -> approved -> archived`; review can request `under_review -> revision_required`, and the owner can resubmit `revision_required -> under_review`.
- Similarity component and final scores are `DECIMAL(8,6)` values constrained to `0..1`. The model always stores the server-side threshold `0.700000` and derives `is_flagged` from the final score. A flag never auto-approves or auto-rejects research.
- Public repository reads use the exact predicate: `submission_status IN ('approved', 'archived') AND archive_status = 'archived' AND visibility = 'public'`.
- Imported source identity fields are private operational metadata. Public resources expose institution/program metadata and abstract provenance, but never source filenames, checksums, storage paths, or workflow-internal fields.
- `NOTIFICATIONS.notifiable_type` and `notifiable_id` are a Laravel polymorphic runtime link. The diagram uses a dotted relationship to show that it is not a database FK. The only notification FK is the nullable `research_document_id`.
- User primary and foreign keys are UUID strings. The role, document, category, file, result, feedback, revision, log, validation, audit, and assignment identifiers are unsigned `BIGINT` values, except for notification UUIDs.
