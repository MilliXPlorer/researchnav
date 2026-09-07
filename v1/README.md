# ResearchNAV

ResearchNAV is split into independently runnable applications:

```text
frontend/  React 19 + TypeScript + Vite
backend/   Laravel 13 API + MariaDB
server/    Legacy Express/PostgreSQL rollback implementation
algorithm/ Standalone Python similarity utility
```

The repository root is an npm workspace and command facade. Normal development starts only the active React frontend and Laravel backend. The legacy Express server is opt-in.

## Architecture

```text
Node/Vite SSR (http://localhost:5173)
    -> server-rendered React + browser hydration
    -> same-origin /api proxy
Laravel (http://127.0.0.1:3001)
    -> Eloquent and database-backed sessions
MariaDB (127.0.0.1:3307)
```

Laravel owns authentication, authorization, validation, database access, and private document storage. The Node frontend server renders React, serves the browser bundle, and streams `/api` traffic to Laravel without becoming an authorization boundary. Private import documents live under `backend/storage/app/private/research_studies/<institute>/` and are never frontend assets. The current corpus is under `ics/`.

Authentication is **Google ID-token SSO only**. AI-generated content, AI recommendations, and AI workflow decisions are excluded from this project; review, title validation, progress, and feedback decisions remain human-recorded actions.

Production should expose only the SSR frontend service on the public HTTPS origin. Its `/api/*` gateway reaches Laravel on a private network and preserves method, body, cookies, origin, status, and streamed downloads. SSR HTML is not cached, and Laravel remains the sole session and authorization authority.

## Requirements

- Node.js and npm
- Composer 2
- PHP 8.3 or newer with `pdo_mysql`
- MariaDB, locally configured on port `3307`

XAMPP PHP 8.0 cannot run Laravel 13. Use a compatible system `php` for Composer and Artisan; XAMPP can still supply MariaDB and phpMyAdmin.

## Install

Run from the repository root:

```powershell
npm install
composer install --working-dir=backend
Copy-Item frontend\.env.example frontend\.env
Copy-Item backend\.env.example backend\.env
php backend\artisan key:generate
```

Set the same Google Web Client ID in `frontend/.env` as `VITE_GOOGLE_CLIENT_ID` and in `backend/.env` as `GOOGLE_CLIENT_ID`.

An existing root `.env` is not automatically loaded after the split. Move only the required values into the package-specific files, then retain or remove the old file according to your local secret-management policy. Never commit any `.env` file.

## Database

Create the local database if needed:

```sql
CREATE DATABASE IF NOT EXISTS researchnav_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

Configure `backend/.env` for MariaDB on `127.0.0.1:3307`, then run non-destructive migrations:

```powershell
php backend\artisan migrate
php backend\artisan migrate:status
```

Do not run `migrate:fresh` against a database containing data that must be preserved. See `backend/DATABASE_SETUP.md` for the complete schema, import, and operations guide.

## Run

Start both active applications:

```powershell
npm run dev
```

Or use separate terminals:

```powershell
npm run dev:api
npm run dev:web
```

Open `http://localhost:5173`. The Node/Vite server renders public catalog HTML before JavaScript runs, hydrates React in the browser, and proxies relative `/api` requests to Laravel at `http://127.0.0.1:3001`.

Each application can also run from its own directory:

```powershell
npm run dev --workspace=@researchnav/frontend
php backend\artisan serve --host=127.0.0.1 --port=3001
```

## SSR Production

Build the browser and server bundles, then start the SSR gateway:

```powershell
npm run build
$env:NODE_ENV="production"
$env:PUBLIC_ORIGIN="https://researchnav.example.edu"
$env:SSR_API_ORIGIN="http://laravel.internal:3001"
npm run start:web
```

`PUBLIC_ORIGIN` is the public HTTPS origin. `SSR_API_ORIGIN` is the private Laravel origin and must never use a `VITE_` prefix. `SSR_API_TIMEOUT_MS` defaults to `5000`; `SSR_MAX_BODY_BYTES` defaults to 27 MiB to accommodate Laravel's 25 MiB document limit. Development defaults to `127.0.0.1:5173`; production containers should set `HOST=0.0.0.0` and expose the service through their public HTTPS endpoint.

The gateway exposes `/_health`, sends `Cache-Control: no-store` and a restrictive CSP on SSR HTML, serves hashed assets from `frontend/dist/client`, and imports the SSR bundle from `frontend/dist/server`. Laravel should use a production PHP server rather than `artisan serve`.

## Authentication

1. React receives a Google ID token.
2. React sends it to `POST /api/auth/google`.
3. Laravel verifies the audience and verified email.
4. Laravel stores the user ID in an HTTP-only database session named `researchnav_sid`.
5. New users remain blocked until an authorized account provisions a role.

Register `http://localhost:5173` as an authorized JavaScript origin for the Google OAuth Web Client ID.

## Verification

Run all npm workspace checks and the Laravel suite from the root:

```powershell
npm test
npm run lint
npm run build
npm run format:check
npm run test:backend
php backend\artisan route:list --path=api
```

Frontend-only commands use `--workspace=@researchnav/frontend`. Explicit legacy checks are available as `npm run test:legacy-api`, `npm run lint:legacy-api`, and `npm run typecheck:legacy-api`.

## Legacy Express

`server/` is retained only for controlled rollback or comparison. It has its own package, environment example, types, and tests and is not started by `npm run dev`.

```powershell
Copy-Item server\.env.example server\.env
npm run dev:legacy-api
```

Do not run Laravel and Express on the same port. Do not run legacy migrations against important PostgreSQL data without a separate data-handling plan. See `server/README.md`.

## Manuscript-content retrieval

`GET /api/repository?q=` is retrieval, not plagiarism detection or similarity
scoring. It searches title, abstract, keywords, and authors, plus `ready`
extracted manuscript bodies, while returning metadata only: no snippets,
scores, or body text. Only non-deleted records with `archive_status = archived`,
`visibility = public`, and `submission_status` of `approved` or `archived` are
eligible.

On MariaDB, body matches use the `manuscript_search_documents` FULLTEXT index in
natural-language mode (BM25-family relevance). The authoritative source is the
latest current `final_manuscript`; a cryptographically and path-verified
canonical import is used only as the fallback. PDF and DOCX are supported. DOC
files and scanned/OCR-dependent PDFs produce no searchable body text. See
`backend/DATABASE_SETUP.md` for indexing, scheduler, environment, privacy, and
deployment requirements.

Content-search deployments must provide private-storage ACLs that prevent direct
web access, encrypt the database and its backups, and use a fixed, controlled
`MANUSCRIPT_SEARCH_PYTHON_BINARY`. The parser already runs behind a bounded JSON
process boundary; OS/container parser isolation is recommended.
