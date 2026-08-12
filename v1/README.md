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
React/Vite (http://localhost:5173)
    -> relative /api requests
    -> Vite /api proxy
Laravel (http://127.0.0.1:3001)
    -> Eloquent and database-backed sessions
MariaDB (127.0.0.1:3307)
```

Laravel owns authentication, authorization, validation, database access, and private document storage. The frontend owns browser presentation and state only. Private import documents live under `backend/storage/app/private/research_studies/<institute>/` and are never frontend assets. The current corpus is under `ics/`.

Production should expose the frontend and `/api` on one HTTPS origin, with the edge proxy routing `/api/*` to Laravel before the SPA fallback. This preserves the existing HTTP-only session and origin-validation model without broad CORS rules.

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

Open `http://localhost:5173`. Frontend requests use relative `/api` URLs and Vite proxies them to Laravel at `http://127.0.0.1:3001`.

Each application can also run from its own directory:

```powershell
npm run dev --workspace=@researchnav/frontend
php backend\artisan serve --host=127.0.0.1 --port=3001
```

## Authentication

1. React receives a Google ID token.
2. React sends it to `POST /api/auth/google`.
3. Laravel verifies the audience and verified email.
4. Laravel stores the user ID in an HTTP-only database session named `researchnav.sid`.
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
