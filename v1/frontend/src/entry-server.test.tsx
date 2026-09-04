// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { render } from "./entry-server";
import { serializeInitialState } from "./ssr";

const record = {
  id: 7,
  title: "SERVER RENDERED STUDY",
  authors: [
    {
      author_name: "SSR Author",
      author_order: 1,
      is_corresponding_author: true,
    },
  ],
  publication_year: 2026,
  institution_name: "Example College",
  academic_unit: "Institute of Computing",
  degree_program: "Computer Science",
  category: { name: "Repositories" },
  abstract: "Rendered before hydration.",
  keywords: ["ssr"],
  research_stage: "completed",
};

describe("SSR entry", () => {
  it("does not apply literal repository filtering for an initial similarity query", async () => {
    const result = await render("/catalog?q=SERVER", {
      apiOrigin: "http://api.example.test",
      fetcher: vi.fn(async (input: RequestInfo | URL) => {
        if (new URL(String(input)).pathname === "/api/auth/session") {
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            { status: 401 },
          );
        }
        return new Response(
          JSON.stringify({ data: [record], links: { next: null } }),
          { headers: { "Set-Cookie": "unexpected=1; Path=/" } },
        );
      }),
    });

    expect(result.statusCode).toBe(200);
    expect(result.appHtml).toContain("Calculating similarity results");
    expect(result.appHtml).not.toContain("SERVER RENDERED STUDY");
    expect(result.serializedState).toContain("SERVER RENDERED STUDY");
    expect(result.setCookies).toEqual([]);
  });

  it("forwards the session cookie and renders the authenticated dashboard", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/session") {
          expect(new Headers(init?.headers).get("cookie")).toBe(
            "researchnav_sid=session-value",
          );
          return new Response(
            JSON.stringify({
              user: {
                email: "researcher@example.test",
                role: "researcher",
                accessStatus: "active",
                isAdmin: false,
              },
            }),
          );
        }
        expect(new Headers(init?.headers).has("cookie")).toBe(false);
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      },
    );

    const result = await render("/app", {
      apiOrigin: "http://api.example.test",
      cookie: "researchnav_sid=session-value",
      fetcher,
    });

    expect(result.appHtml).toContain("My research.");
    expect(result.appHtml).toContain("researcher@example.test");
    expect(result.appHtml).not.toContain("Loading ResearchNAV");
  });

  it("redirects anonymous dashboard visits to the landing page", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/session") {
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      },
    );

    const result = await render("/app", {
      apiOrigin: "http://api.example.test",
      fetcher,
    });

    expect(result.statusCode).toBe(302);
    expect(result.redirectTo).toBe("/");
    expect(result.appHtml).toBe("");
  });

  it("redirects anonymous research-route visits to the landing page", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL): Promise<Response> => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/session") {
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      },
    );

    const result = await render("/research/7", {
      apiOrigin: "http://api.example.test",
      fetcher,
    });

    expect(result.statusCode).toBe(302);
    expect(result.redirectTo).toBe("/");
    expect(result.appHtml).toBe("");
  });

  it("escapes script-breaking values in initial state", () => {
    const serialized = serializeInitialState({
      version: 1,
      url: { pathname: "/", search: "" },
      session: { status: "anonymous" },
      repository: {
        status: "error",
        records: [],
        message: "</script><script>alert(1)</script>",
      },
    });

    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script\\u003e");
  });
});
