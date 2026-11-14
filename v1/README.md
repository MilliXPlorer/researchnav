# ResearchNAV

ResearchNAV is split into independently runnable applications:

```text
frontend/  React 19 + TypeScript + Vite
backend/   Laravel 13 API + MariaDB
server/    Legacy Express/PostgreSQL rollback implementation
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

Similarity runs through Laravel's process boundary using the Python worker in `backend/app/Services/similarity/`; its focused tests are in `backend/app/Services/similarity/tests/`.

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
$env:PUBLIC_ORIGIN="https://researchnavph.tech"
$env:SSR_API_ORIGIN="http://laravel.internal:3001"
npm run start:web
```

`PUBLIC_ORIGIN` is the public HTTPS origin. `SSR_API_ORIGIN` is the private Laravel origin and must never use a `VITE_` prefix. `SSR_API_TIMEOUT_MS` defaults to `5000`; only `POST /api/similarity/content-upload` uses `SSR_CONTENT_UPLOAD_TIMEOUT_MS`, which defaults to `120000`. `SSR_MAX_BODY_BYTES` defaults to 27 MiB to accommodate Laravel's 25 MiB document limit. Development defaults to `127.0.0.1:5173`; production containers should set `HOST=0.0.0.0` and expose the service through their public HTTPS endpoint.

The Content Checker accepts text-based PDF files up to 30 MiB each. Folder checks accept up to 20 PDFs and 100 MiB combined. The PHP web SAPI and reverse proxy must allow the same request: `backend/public/.user.ini` requests `upload_max_filesize=31M`, `post_max_size=105M`, `memory_limit=512M`, and a 120-second execution limit. Confirm that the deployed PHP server honors these values and keep Laravel reachable only through the request-limited SSR/reverse-proxy path.

The gateway exposes `/_health`, sends `Cache-Control: no-store` and a restrictive CSP on SSR HTML, serves hashed assets from `frontend/dist/client`, and imports the SSR bundle from `frontend/dist/server`. Laravel should use a production PHP server rather than `artisan serve`.

### Canonical production domain

The canonical production URL is **https://researchnavph.tech**.
`https://www.researchnavph.tech` only redirects to that URL, preserving the path
and query string. HTTP requests to either hostname also redirect directly to the
canonical HTTPS URL.

Replace the corresponding values in the **deployed backend environment** with:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://researchnavph.tech
FRONTEND_URL=https://researchnavph.tech
APP_ORIGINS=https://researchnavph.tech,https://www.researchnavph.tech
SESSION_DOMAIN=null
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

Keep the existing `APP_KEY`, Google client IDs, database/mail/Supabase credentials,
and other secrets. The existing production guard also requires the configured
production mail transport rather than the local `log` mailer. Host-only sessions
(`SESSION_DOMAIN=null`) work with the same-origin `/api` gateway; an explicit
cookie domain is unnecessary. If the deployment specifically requires a shared
subdomain cookie, use `.researchnavph.tech` instead.

The deployed frontend needs `NODE_ENV=production`,
`PUBLIC_ORIGIN=https://researchnavph.tech`, and the existing private
`SSR_API_ORIGIN`. Keep Laravel private. Configure `TRUSTED_PROXIES` with the actual
gateway/proxy IPs or CIDRs; the backend example's `127.0.0.1` is suitable only
when the immediate proxy connects over loopback. Preserve forwarded HTTPS/host
headers through the proxy chain. Laravel intentionally disables cross-origin
CORS middleware: browser API calls remain same-origin, and `APP_ORIGINS` controls
the existing mutation-origin check rather than exposing a separate public API.

Apply these overrides only in production. Keep `APP_ENV=local`, HTTP URLs and
`SESSION_SECURE_COOKIE=false` for HTTP local development. Retain localhost,
127.0.0.1, configured LAN origins and explicitly configured ngrok origins in the
local `APP_ORIGINS`/`DEV_ALLOWED_ORIGINS` values. Vite derives `allowedHosts` from
`DEV_ALLOWED_ORIGINS`; it is not the production host router.

Deployment steps:

1. In Hostinger DNS, point the apex `@` A record at the production ingress IP and
   set `www` as a CNAME to `researchnavph.tech`. Publish an AAAA record only if
   that ingress serves IPv6. Remove conflicting web records for these names and
   preserve mail/TXT records. DNS alone does not implement the www redirect.
2. Issue and install an SSL certificate covering **both** `researchnavph.tech`
   and `www.researchnavph.tech`, with automatic renewal. The www TLS handshake
   must succeed before its HTTPS redirect can be returned.
3. Adapt [the Nginx example](docs/nginx.conf.example) to the actual SSR listener
   and certificate paths, then enable it on the public ingress. It routes only
   canonical HTTPS traffic to Node and redirects the other three scheme/host
   combinations. Bind Node privately (for example `127.0.0.1:5173` on the same
   host); use a private service address for separate containers.
4. In Google Cloud Console, keep the existing OAuth Web Client ID and add
   `https://researchnavph.tech` to **Authorized JavaScript origins**. Retain
   required development origins. Update the OAuth consent screen's authorized
   domain to `researchnavph.tech` and any configured homepage/privacy/terms links
   to their corresponding new-domain URLs. This Google Identity Services popup
   ID-token flow uses a JavaScript callback, not an OAuth redirect endpoint; no
   `GOOGLE_CLIENT_SECRET` or `GOOGLE_REDIRECT_URI` is required. Since www redirects
   before the app loads, it does not need a Google JavaScript origin.
5. Apply the production environment values, rebuild Laravel's configuration with
   `php backend/artisan config:cache`, and restart the PHP and Node services so
   they load the new environment. Validate Nginx with `nginx -t` before reloading
   it. No database migration is needed for this domain change.
6. Check `https://researchnavph.tech/_health`, HTTP-to-HTTPS and www redirects
   (including a path and query), Google sign-in/logout and session persistence,
   and a newly generated PDF footer. Confirm the session cookie is `Secure` and
   `HttpOnly`. Browsers cannot transfer cookies between different registrable
   domains, so users must sign in again on the new domain.

## Authentication

1. React receives a Google ID token.
2. React sends it to `POST /api/auth/google`.
3. Laravel verifies the audience and verified email.
4. Laravel stores the user ID in an HTTP-only database session named `researchnav_sid`.
5. New users remain blocked until an authorized account provisions a role.

Register `https://researchnavph.tech` for production and `http://localhost:5173`
for local development as authorized JavaScript origins for the existing Google
OAuth Web Client ID. See the production-domain steps above for the console setup.

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
canonical import is used only as a legacy fallback for the existing corpus. New uploads and active extraction support PDF only. DOC
files and scanned/OCR-dependent PDFs produce no searchable body text. See
`backend/DATABASE_SETUP.md` for indexing, scheduler, environment, privacy, and
deployment requirements.

Content-search deployments must provide private-storage ACLs that prevent direct
web access, encrypt the database and its backups, and use a fixed, controlled
`MANUSCRIPT_SEARCH_PYTHON_BINARY`. The parser already runs behind a bounded JSON
process boundary; OS/container parser isolation is recommended.
