import type { ResearchRecord, UserSession } from "./types";

export interface InitialState {
  version: 1;
  url: {
    pathname: string;
    search: string;
  };
  session:
    | { status: "authenticated"; user: UserSession }
    | { status: "anonymous" }
    | { status: "unresolved" };
  repository:
    | { status: "ready"; records: ResearchRecord[] }
    | { status: "error"; records: []; message: string }
    | { status: "unresolved"; records: [] };
}

export function createBrowserInitialState(): InitialState {
  const location =
    typeof window === "undefined"
      ? { pathname: "/", search: "" }
      : window.location;

  return {
    version: 1,
    url: { pathname: location.pathname, search: location.search },
    session: { status: "unresolved" },
    repository: { status: "unresolved", records: [] },
  };
}

export function serializeInitialState(state: InitialState): string {
  return JSON.stringify(state)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function parseInitialState(value: string): InitialState {
  const state = JSON.parse(value) as Partial<InitialState>;
  if (
    state.version !== 1 ||
    !state.url ||
    typeof state.url.pathname !== "string" ||
    typeof state.url.search !== "string" ||
    !state.session ||
    !state.repository
  ) {
    throw new Error("INVALID_INITIAL_STATE");
  }

  return state as InitialState;
}
