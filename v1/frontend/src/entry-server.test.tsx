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
  it("renders public repository content before hydration", async () => {
    const result = await render("/catalog?q=SERVER", {
      apiOrigin: "http://api.example.test",
      fetcher: vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: [record], links: { next: null } }),
            { headers: { "Set-Cookie": "unexpected=1; Path=/" } },
          ),
      ),
    });

    expect(result.statusCode).toBe(200);
    expect(result.appHtml).toContain("SERVER RENDERED STUDY");
    expect(result.serializedState).toContain("SERVER RENDERED STUDY");
    expect(result.setCookies).toEqual([]);
  });

  it("forwards the session cookie and renders the authenticated dashboard", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        if (path === "/api/auth/session") {
          expect(new Headers(init?.headers).get("cookie")).toBe(
            "researchnav.sid=session-value",
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
      cookie: "researchnav.sid=session-value",
      fetcher,
    });

    expect(result.appHtml).toContain("Welcome back");
    expect(result.appHtml).toContain("researcher@example.test");
    expect(result.appHtml).not.toContain("Loading ResearchNAV");
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
