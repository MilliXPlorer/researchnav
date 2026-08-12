import React from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import { getCurrentSession, listPublicResearch, type ApiFetch } from "./api";
import { serializeInitialState, type InitialState } from "./ssr";

interface RenderOptions {
  apiOrigin: string;
  cookie?: string;
  timeoutMs?: number;
  fetcher?: ApiFetch;
}

export interface RenderResult {
  appHtml: string;
  serializedState: string;
  statusCode: number;
  setCookies: string[];
}

function serverApiFetch(
  options: RenderOptions,
  setCookies: string[],
): ApiFetch {
  const apiOrigin = new URL(options.apiOrigin);
  const fetcher = options.fetcher ?? globalThis.fetch;

  return async (input, init) => {
    const requested = new URL(String(input), apiOrigin);
    if (
      requested.origin !== apiOrigin.origin ||
      !requested.pathname.startsWith("/api/")
    ) {
      throw new Error("INVALID_SSR_API_PATH");
    }

    const headers = new Headers(init?.headers);
    if (options.cookie && requested.pathname === "/api/auth/session") {
      headers.set("cookie", options.cookie);
    }
    const response = await fetcher(requested, {
      ...init,
      headers,
      signal: init?.signal ?? AbortSignal.timeout(options.timeoutMs ?? 5_000),
    });
    const responseHeaders = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    if (requested.pathname === "/api/auth/session") {
      const cookies = responseHeaders.getSetCookie?.() ?? [];
      if (cookies.length > 0) setCookies.push(...cookies);
    }

    return response;
  };
}

export async function render(
  requestUrl: string,
  options: RenderOptions,
): Promise<RenderResult> {
  const url = new URL(requestUrl, "http://researchnav.local");
  const setCookies: string[] = [];
  const fetcher = serverApiFetch(options, setCookies);
  const repositoryPromise = listPublicResearch(fetcher)
    .then(
      (records) => ({ status: "ready", records }) as InitialState["repository"],
    )
    .catch(
      () =>
        ({
          status: "error",
          records: [],
          message: "The public catalog is unavailable.",
        }) as InitialState["repository"],
    );

  const session: InitialState["session"] =
    url.pathname === "/app"
      ? await getCurrentSession(fetcher).then((user) =>
          user
            ? ({ status: "authenticated", user } as const)
            : ({ status: "anonymous" } as const),
        )
      : { status: "unresolved" };
  const repository = await repositoryPromise;
  const state: InitialState = {
    version: 1,
    url: { pathname: url.pathname, search: url.search },
    session,
    repository,
  };
  const statusCode =
    repository.status === "error" && session.status !== "authenticated"
      ? 503
      : 200;

  return {
    appHtml: renderToString(<App initialState={state} />),
    serializedState: serializeInitialState(state),
    statusCode,
    setCookies,
  };
}
