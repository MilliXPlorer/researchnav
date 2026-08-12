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
SESSION_COOKIE=researchnav.sid
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

Current local baseline recorded for this installation: **16 tables, 2 real users, 8 roles, 5 source-grounded categories, 10 public studies, 28 authors, 10 private DOCX records, 10 monitoring entries, 10 audit entries, no similarity results, and no notifications**. Counts change through normal application use.

Before applying migrations or seeders to a database containing data, inspect the migration status and take a backup. Do not use `migrate:fresh` against a database that contains data that must be preserved. The current local XAMPP recovery note is that older damaged data was preserved at `C:\xampp\mysql\data-corrupt-20260810-1837`. Treat that directory as recovery evidence, not as an active data directory, and back it up before any recovery work.

## Import the reviewed study corpus

The source corpus is `backend/storage/app/private/research_studies/ics`. Institute directories (`ias`, `ibfs`, `icje`, `ics`, `ihs`, and `ite`) keep private imports grouped within backend storage. The ICS corpus contains eleven DOCX files representing ten distinct studies; the two Caralos files are byte-identical and one is deliberately skipped. `catalog.json` contains reviewed title-page metadata and source-grounded abstracts because none of the manuscripts contains a standalone abstract.

Run the checksum-validated import with an active repository custodian:

```powershell
php backend\artisan research:import-studies --owner=millibot011@gmail.com
```

The importer requires exactly ten catalog entries, covers every DOCX file, validates SHA-256 values, rejects symlinks and path escapes, validates the OOXML package, preserves exact author order, and uses the checksum as immutable import identity. Rerunning the command updates only records previously imported with the same owner and checksum. Title collisions or owner changes are rejected.

The command defaults to the private `ics` directory; `--source` can select another institute directory. Canonical DOCX files are copied to `storage/app/private/research/<document-id>`. The browser receives only catalog metadata and abstract provenance. Vite denies direct canonical and `/@fs/` access to all backend private storage. Imports create no similarity result and no notification. Imported records are archived/public by explicit repository-operator instruction; `submitted_at` and `approved_at` remain null, while `archived_at` records import time.

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

Open `http://localhost:5173`. The frontend uses relative `/api` requests and Vite proxies them to Laravel on port `3001`. The public repository endpoints are `GET /api/repository` and `GET /api/repository/{researchDocument}`. The complete route surface is defined in `backend/routes/web.php`.

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
- The `0.700000` threshold and `is_flagged` value are server-derived storage fields. A flag requires an explicit human title-validation decision before any validation or submission decision is made.
- Review permission is assignment-scoped for advisers and instructors through active `research_review_assignments` rows. Research office personnel and administrators have the broader review authority implemented by `DomainAuthorization`.
- The public query requires all three conditions: `submission_status` is `approved` or `archived`, `archive_status` is `archived`, and `visibility` is `public`.
- The built-in notification table is written by the custom database channel. Its polymorphic notifiable columns have no database FK to users; `research_document_id` is the separate nullable FK.
- The previous Express/PostgreSQL backend remains legacy reference code only. It is not active in the normal `npm run dev`, `npm run start:api`, migration, or backend test commands.
