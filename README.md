# ResearchNAV

ResearchNAV is a React, Express, and PostgreSQL research repository prototype with server-verified Google SSO and role-based dashboard access.

## Authentication flow

1. Google Identity Services returns an ID token to the browser.
2. The browser sends that token to `POST /api/auth/google`.
3. The Express API verifies the token with Google and looks up the normalized Gmail in PostgreSQL.
4. The API stores only the user ID in an HTTP-only PostgreSQL-backed session cookie.
5. New accounts are created as blocked Researchers.
6. A Gmail pre-provisioned by an Administrator or Coordinator is activated when that same Google account signs in.
7. Middleware selects and protects the assigned dashboard. Administrators bypass role checks.

Provisioning authority is fixed:

- System Administrator creates Research Coordinator accounts.
- Research Coordinator creates Research Instructor accounts.
- Invited accounts receive email and remain pending until the invited Gmail signs in.

## Google Console

1. Open the Google Cloud Console and select or create a project.
2. Configure the OAuth consent screen with audience **External**.
3. Create an OAuth 2.0 Client ID with application type **Web application**.
4. Add `http://localhost:5173` under **Authorized JavaScript origins**.
5. Add the production web origin before deployment.
6. Under **Audience**, publish the app to **Production** so any Google account can authenticate. While the app remains in Testing, only listed test users can sign in.
7. This implementation uses the Google Identity Services ID-token flow, so it does not require a client secret or redirect URI.

Any verified Gmail may authenticate, but first-time accounts remain pending until a System Administrator assigns Coordinator access or a Coordinator assigns Instructor access. Google authentication does not grant a ResearchNAV role automatically.

Put the Web Client ID in both `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`. Never commit `.env`.

## Local setup

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run admin:bootstrap
npm run dev
```

On PowerShell, create `.env` from `.env.example` using your normal local workflow, then fill in:

- `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`
- `DATABASE_URL`
- A random `SESSION_SECRET` of at least 32 characters
- `BOOTSTRAP_ADMIN_EMAIL`, set to the first System Administrator Gmail

Run `npm run admin:bootstrap` once after the migration. Administrator promotion is not performed during sign-in, so removing or changing environment values cannot silently promote a Google account.

The web app runs on `http://localhost:5173`; the API runs on `http://localhost:3001` and is proxied under `/api` during development.

## Same-Wi-Fi access

Vite listens on the local network. Set `APP_ORIGINS` to the host computer's current Wi-Fi origin, restart `npm run dev`, and open that address from another device on the same network. For example:

```env
APP_ORIGINS=http://192.168.1.2:5173
```

```text
http://192.168.1.2:5173
```

Allow Node.js through Windows Firewall on private networks if prompted. A DHCP-assigned address can change after reconnecting to Wi-Fi, so update `APP_ORIGINS` when needed. Google's documented plain-HTTP development exception applies to `localhost`; if Google rejects the LAN IP as an authorized JavaScript origin, use an HTTPS deployment or tunnel for sign-in.

For an ngrok tunnel, append its exact HTTPS origin to `APP_ORIGINS`. Vite derives its external host allowlist from these origins. Register the generated URL under Google's **Authorized JavaScript origins** as well. Free dynamic ngrok URLs can change, so update both places after starting a new tunnel.

In production, set `DATABASE_SSL=true`, supply `DATABASE_CA` when your provider requires a custom CA, use an HTTPS `APP_URL`, and replace the local session secret with a generated high-entropy value.

## Invitation email

SMTP is optional in development and required in production. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`. For Gmail SMTP, use an account with two-step verification and an app password, or use the institution's approved SMTP provider.

## Commands

```bash
npm run dev
npm run db:migrate
npm run build
npm run lint
npm run format:check
npm test
```
