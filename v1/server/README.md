# Legacy Express Backend

This package is the inactive Express/PostgreSQL rollback implementation. The supported backend is Laravel in `../backend`.

To run the legacy server intentionally:

```powershell
Copy-Item .env.example .env
npm run dev
```

From the repository root, use `npm run dev:legacy-api`. Do not run it with Laravel when both are configured for port `3001`, and do not run legacy migrations against important PostgreSQL data without a separate migration and backup plan.

Package checks:

```powershell
npm test
npm run lint
npm run typecheck
```
