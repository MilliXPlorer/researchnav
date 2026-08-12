# ResearchNAV Frontend

React/Vite browser application for ResearchNAV. It communicates with the Laravel backend through relative `/api` requests.

```powershell
Copy-Item .env.example .env
npm run dev
npm test
npm run lint
npm run build
```

When invoked from the repository root, use `npm run dev:web` or the `@researchnav/frontend` workspace selector. `DEV_API_PROXY_TARGET` defaults to `http://127.0.0.1:3001` and is used only by the local Vite proxy.

The frontend must not contain research manuscripts, private storage, backend credentials, or server-side authorization logic.
