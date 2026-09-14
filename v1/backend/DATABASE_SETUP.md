# ResearchNAV database setup

This is the setup guide for the active Laravel backend and its local XAMPP MariaDB database. The legacy Express/PostgreSQL backend is not active and is not used by the normal root development commands.

## Prerequisites

- Windows XAMPP with MariaDB and phpMyAdmin. Configure MariaDB to listen on `127.0.0.1:3307`.
- System PHP 8.5 with `pdo_mysql`. Laravel requires PHP `^8.3`; XAMPP's PHP is not the PHP used for Artisan or Composer.
- Composer 2.
- Node.js and npm for the React/Vite frontend.
- A Google OAuth Web Client ID for local Google sign-in. The same client ID is configured in the frontend and backend. This ID-token flow does not use a client secret or redirect URI.

Confirm the system runtime before setup:

```powershell
php -v
composer --version
node --version
npm --version
```

## Install dependencies and environment files

Run these commands from the repository root:

```powershell
npm install
composer install --working-dir=backend
Copy-Item frontend\.env.example frontend\.env
Copy-Item backend\.env.example backend\.env
php backend\artisan key:generate
```

Do not commit either `.env` file. The backend example contains variable names and safe local defaults only. An old root `.env` is not automatically loaded by either active application after the split.

## Backend environment

Set these non-secret local values in `backend/.env`:

```env
APP_NAME=ResearchNAV
APP_ENV=local
APP_DEBUG=true
APP_URL=http://127.0.0.1:3001
FRONTEND_URL=http://localhost:5173
APP_ORIGINS=http://localhost:5173
TRUSTED_PROXIES=127.0.0.1

DB_CONNECTION=mariadb
DB_HOST=127.0.0.1
DB_PORT=3307
DB_DATABASE=researchnav_db
DB_USERNAME=root
DB_PASSWORD=

SESSION_DRIVER=database
SESSION_LIFETIME=480
SESSION_COOKIE=researchnav_sid
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
```

Set `GOOGLE_CLIENT_ID` to the local Google Web Client ID. Set `GOOGLE_CA_BUNDLE` only when the local PHP/cURL certificate bundle needs an explicit path, for example the XAMPP bundle path already shown in `.env.example`.

`BOOTSTRAP_ADMIN_EMAIL` is optional and supplies the default email for the admin bootstrap command. AWS variables are only needed if the configured filesystem is changed to S3. No database password belongs in this file.

## Create the database

Start the XAMPP Control Panel. Start **Apache** when phpMyAdmin or the local web server is needed, and start **MySQL/MariaDB**. Confirm the MariaDB service is configured for port `3307`. Port `3306` is owned by the separate Windows MySQL service and is not the ResearchNAV database.

phpMyAdmin is available at [http://localhost/phpmyadmin/](http://localhost/phpmyadmin/) while XAMPP Apache is running. The browser URL uses the Apache port; the phpMyAdmin server configuration targets MariaDB port `3307`.

Create the database if it does not exist:

```sql
CREATE DATABASE IF NOT EXISTS researchnav_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

The active connection is MariaDB database `researchnav_db` at `127.0.0.1:3307`, with `utf8mb4` and InnoDB-backed foreign-key tables.

## Migrate and seed

From the repository root, use the verified Artisan commands:

```powershell
php backend\artisan migrate
php backend\artisan migrate:status
php backend\artisan db:seed
```

`DatabaseSeeder` only maintains the eight required canonical roles. It does not create dummy users, sample categories, or demo research records. Create categories and real accounts through the authorized application APIs or administration commands.

Google accounts can have a null password and null `first_name`, `middle_name`, or `last_name`. These are valid account states, not missing migration data.

Current schema baseline: **29 tables and 44 migrations** (including private-file deletion, manuscript search, access-request, and researcher-submission workflow support). `submission_reference` is required and unique; migration `2026_09_01_000040` backfills any legacy nulls before enforcing the non-null constraint. Live data counts change through normal application use; use `php backend\artisan migrate:status` and application queries rather than this guide as the source of operational counts.

Before applying migrations or seeders to a database containing data, inspect the migration status and take a backup. Do not use `migrate:fresh` against a database that contains data that must be preserved. Before recovery work, preserve a backup of the affected database and private storage in an approved location.

## Import reviewed study material

Keep reviewed import material in private backend storage and maintain a reviewed catalog with approved metadata and source-grounded abstracts. Back up the affected database and private storage before importing.

Run the checksum-validated import with an authorized repository custodian:

```powershell
php backend\artisan research:import-studies --owner=custodian@example.invalid --source=<reviewed-source-directory>
```

The importer validates catalog coverage and SHA-256 values, rejects symlinks and path escapes, validates the OOXML package, preserves author order, and uses the checksum as immutable import identity. Rerunning the command updates only records previously imported with the same owner and checksum. Title collisions or owner changes are rejected.

Use `--source=<reviewed-source-directory>` to select an approved private source directory. Canonical DOCX files are copied to `storage/app/private/research/<document-id>`. The browser receives only catalog metadata and abstract provenance. Vite denies direct canonical and `/@fs/` access to all backend private storage. Imports create no similarity result and no notification. Imported records are archived/public by explicit repository-operator instruction; `submitted_at` and `approved_at` remain null, while `archived_at` records import time.

## Researcher workflow constraints

Researcher progress reports are limited to non-imported, ongoing records in `draft`, `submitted`, `under_review`, `revision_required`, or `approved`; archived records cannot receive new progress. A researcher may request title validation only for non-imported records in `draft`, `submitted`, `under_review`, or `revision_required`. A revision can be resubmitted only after a current `revised_manuscript` has been uploaded after that revision was requested. Assignment changes notify newly assigned active reviewers and the researcher only when the active assignment set changes; revised uploads and resubmissions notify current active reviewers. Notifications contain the research title/reference and an authorized internal record link, never private-file paths or actor UUIDs.

## Run the application

The root scripts are the supported development entry points:

```powershell
npm run dev
```

This starts the Vite frontend and Laravel API together. The API is also available through the explicit root script:

```powershell
npm run start:api
```

For separate terminals:

```powershell
php backend\artisan serve --host=127.0.0.1 --port=3001
npm run dev:web
```

Open `http://localhost:5173`. The frontend uses relative `/api` requests and Vite proxies them to Laravel on port `3001`. The public repository endpoints are `GET /api/repository`, `GET /api/repository/{researchDocument}`, and sessionless `POST /api/repository/similarity`. The similarity endpoint accepts exactly `{"q":"..."}` (2--200 characters), compares that unpersisted query against all and only nondeleted archived/public titles and ready indexed manuscript content independently, then calculates `(title cosine * 0.30) + (content cosine * 0.70)`. It returns no persisted similarity result. If content is unavailable, no official overall is reported. It is limited by trusted client IP to two requests per minute and 20 per hour. FastText support is optional there and never changes the official calculation. The complete route surface is defined in `backend/routes/web.php`.

## Weighted similarity worker

`POST /api/research/{researchDocument}/similarity/check` accepts only `{}` and requires an active, authenticated actor authorized to view the source internally. It compares the source title and extracted manuscript with all and only archived/public records using separate TF-IDF/cosine components and the same 30/70 policy. FastText is supporting context only. PDF and DOCX are supported; legacy DOC is reported as unsupported. Missing or failed extraction produces no official weighted overall instead of a fake zero.

Install its isolated Python dependencies and configure a FastText model outside private document storage:

```powershell
py -m pip install -r backend\requirements-test.txt
$env:SIMILARITY_FASTTEXT_MODEL_PATH = 'C:\models\cc.en.300.bin'
```

Laravel invokes `app/Services/similarity/cli.py` as a fixed argument process (not a shell command) and exchanges bounded JSON through stdin/stdout. The worker has no database or private-document path input. If FastText or its model is absent, authoritative weighted TF-IDF/cosine scoring continues and the supporting score is `null`. Invalid child output or timeout returns `502 SIMILARITY_PROCESS_FAILED` and writes nothing. Successful result rows are committed atomically and do not change research workflow status.

## Testing and formatting

The backend test script clears configuration and runs the Laravel test suite. PHPUnit uses an in-memory SQLite database, so these commands do not test against the local MariaDB data:

```powershell
composer --working-dir=backend test
npm run test:backend
```

The root npm commands verify both npm workspaces. To check only the active frontend, add `--workspace=@researchnav/frontend` to the corresponding npm command.

```powershell
npm test
npm run lint
npm run build
npm run format:check
```

Laravel Pint is installed as a backend development dependency:

```powershell
composer --working-dir=backend exec pint -- --test
py -m pytest backend\app\Services\similarity\tests
```

Use `composer --working-dir=backend exec pint` when an automatic backend formatting pass is intentionally requested. Do not run destructive database reset commands as part of routine testing.

## Deployment checklist

No Dockerfile, deployment manifest, or hosting-specific deployment command is present in the active backend configuration inspected here. A deployment must therefore provide PHP 8.5 or another PHP version satisfying `^8.3`, Composer dependencies, a MariaDB-compatible database, private writable file storage, and the required environment variables through the hosting platform's secret store.

For a release, install backend and workspace dependencies, build the frontend into `frontend/dist`, and apply only pending migrations:

```powershell
composer install --working-dir=backend --no-dev --optimize-autoloader
npm install
npm run build
php backend\artisan migrate --force
```

Set production `APP_ENV`, `APP_DEBUG=false`, HTTPS origins, database credentials, Google client configuration, session configuration, and private storage before starting the PHP application. Do not run the local development seeders in production. The `composer setup` script also contains `migrate --force`, but review its full effect and the target backup before using it on an existing production database.

## Operations and known limitations

- Run `php backend\artisan migrate:status` before and after schema changes. Back up the database before migrations, role changes, category changes, or recovery work.
- `document_files` are private local files by default. A database backup alone does not back up `storage/app/private`; back up both metadata and private storage.
- `monitoring_logs` record document activity and status history. `audit_logs` record actor, action, entity metadata, request IP, and user agent. They serve different operational purposes and both are immutable through their models.
- Similarity results store trusted normalized scores. They do not calculate vectors, create vector tables, or automatically approve, reject, archive, or otherwise change research workflow state. Mock similarity scores are test fixtures only.
- Laravel derives `classification`, `overall_flagged`, `title_match_alert`, `adviser_review_required`, and `flag_reason` from fixed-point scores. Overall scores at 70% or titles at 90% require adviser review, but never automatically approve or reject research.
- Run `php backend\artisan similarity:history-report --json` to count older algorithm rows without modifying them. New checks append `title-content-weighted-v1` rows; historical scores and versions remain unchanged.
- Review permission is assignment-scoped for advisers and instructors through active `research_review_assignments` rows. Research office personnel and administrators have the broader review authority implemented by `DomainAuthorization`.
- The public query requires all three conditions: `submission_status` is `approved` or `archived`, `archive_status` is `archived`, and `visibility` is `public`.
- The built-in notification table is written by the custom database channel. Its polymorphic notifiable columns have no database FK to users; `research_document_id` is the separate nullable FK.
- The previous Express/PostgreSQL backend remains legacy reference code only. It is not active in the normal `npm run dev`, `npm run start:api`, migration, or backend test commands.

## Manuscript-content search setup

After `php backend\artisan migrate`, run the initial projection backfill once:

```powershell
php backend\artisan repository:reindex-manuscripts
```

The command is idempotent. Use `--force` to re-extract current ready
projections, `--retry-failed` to retry failures, or `--document=<id>` for a
targeted rebuild. The scheduler runs the retry command every ten minutes;
production must invoke `php backend\artisan schedule:run` every minute.

The non-secret configuration is:

```env
MANUSCRIPT_SEARCH_PYTHON_BINARY=/srv/researchnav/.venv/bin/python
MANUSCRIPT_SEARCH_CLI_PATH=/srv/researchnav/backend/app/Services/manuscript_text_cli.py
MANUSCRIPT_SEARCH_TIMEOUT_SECONDS=30
MANUSCRIPT_SEARCH_MAXIMUM_INPUT_BYTES=26214400
MANUSCRIPT_SEARCH_MAXIMUM_OUTPUT_BYTES=8388608
MANUSCRIPT_SEARCH_MAXIMUM_TEXT_CHARACTERS=1000000
MANUSCRIPT_SEARCH_EXTRACTOR_VERSION=manuscript-text/1
```

Set the Python value to a fixed, controlled executable. PDF and DOCX are
supported; DOC is unsupported and scanned/OCR-dependent PDFs have no
extractable text. Projection statuses are `pending`, `ready`, `no_source`,
`unsupported`, and `failed`; failures clear stale body text and leave metadata
searchable. The public GET endpoint returns metadata only, never body text,
snippets, or scores. Invalid query input uses the normal API validation error;
otherwise search is metadata-plus-ready-body retrieval, not plagiarism or
similarity scoring.

The migration `down` path drops derived projections. For a reviewed rollback or
rebuild, back up first, reapply the migration with `php backend\artisan migrate`,
then run `php backend\artisan repository:reindex-manuscripts` (use `--force` for
a full extraction rebuild). Keep private files with database backups.

Term probing can reveal whether a queried term is present in public indexed
content. Treat the endpoint as a privacy disclosure surface. Production must
use restrictive private-storage ACLs, encryption for the database and backups,
and preferably OS/container isolation for the PDF/DOCX parser process. The
worker is already bounded behind a strict JSON process boundary.

Backend feature tests use in-memory SQLite and therefore exercise a LIKE
fallback, not MariaDB FULLTEXT natural-language/BM25-family ranking. Validate
the migration, FULLTEXT index, token behavior, and representative queries
against live MariaDB before release.
