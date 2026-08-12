# ResearchNAV Frontend

React/Vite SSR application for ResearchNAV. A Node gateway server-renders routes, hydrates them in the browser, and communicates with Laravel through same-origin relative `/api` requests.

```powershell
Copy-Item .env.example .env
npm run dev
npm test
npm run lint
npm run build
npm start
```

When invoked from the repository root, use `npm run dev:web`, `npm run start:web`, or the `@researchnav/frontend` workspace selector. `SSR_API_ORIGIN` defaults to `http://127.0.0.1:3001`. The production server requires an HTTPS `PUBLIC_ORIGIN`.

`npm run build` creates `dist/client` and `dist/server`. The Node gateway is the public service; Laravel should be reachable only through the gateway or a private network.

The frontend must not contain research manuscripts, private storage, backend credentials, or server-side authorization logic.
