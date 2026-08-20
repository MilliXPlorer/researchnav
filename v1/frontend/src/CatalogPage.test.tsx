import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CatalogPage from "./CatalogPage";
import type { ResearchRecord } from "./types";

const fallbackRecord: ResearchRecord = {
  id: "fallback",
  title: "Literal fallback result",
  authors: "Fallback Author",
  year: 2026,
  institutionName: "Example College",
  academicUnit: "Example Unit",
  degreeProgram: "Example Program",
  institute: "Example Unit",
  program: "Example Program",
  category: "Example Category",
  abstract:
    "This record must not be client-filtered during a similarity search.",
  keywords: ["literal"],
  researchStage: "Completed",
};

function resource(
  id: number,
  title: string,
  querySimilarityScore: string | null = "0.987654",
) {
  return {
    id,
    title,
    authors: [
      {
        author_name: "Public Author",
        author_order: 1,
        is_corresponding_author: true,
      },
    ],
    publication_year: 2026,
    institution_name: "Example College",
    academic_unit: "Example Unit",
    degree_program: "Example Program",
    category: { name: "Example Category" },
    abstract: "Algorithm-scored public metadata.",
    keywords: ["algorithm"],
    research_stage: "completed",
    query_similarity_score: querySimilarityScore,
  };
}

function renderCatalog(initialSearch?: string) {
  return render(
    <CatalogPage
      onSignIn={vi.fn()}
      navigate={vi.fn()}
      records={[fallbackRecord]}
      initialSearch={initialSearch}
    />,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("CatalogPage public similarity search", () => {
  it("requests an initial catalog q and preserves the backend ranking order", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              resource(2, "Backend-ranked first", "0.100000"),
              resource(1, "Backend-ranked second", "0.900000"),
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderCatalog("?q=water");

    await screen.findByRole("heading", { name: "Backend-ranked first" });
    const resultTitles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(resultTitles).toEqual([
      "Backend-ranked first",
      "Backend-ranked second",
    ]);
    expect(
      screen.queryByText("Literal fallback result"),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/repository/similarity",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ q: "water" }),
      }),
    );
  });

  it("displays the exact query score on the card and selected metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [resource(1, "Exact query score", "0.987654321")],
            }),
          ),
      ),
    );

    renderCatalog("?q=exact");

    expect(await screen.findByText("98.7654%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View full metadata/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("98.7654%")).toBeInTheDocument();
    expect(within(dialog).queryByText("1.0000%")).not.toBeInTheDocument();
  });

  it("omits zero-scoring studies from ranked search results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                resource(1, "Shares terms with the query", "0.512300"),
                resource(2, "Shares nothing with the query", "0.000000"),
              ],
            }),
          ),
      ),
    );

    renderCatalog("?q=water");

    expect(
      await screen.findByText("Shares terms with the query"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Shares nothing with the query"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0.0000%")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /View full metadata/ }),
    ).toHaveLength(1);
  });

  it("explains an empty ranked search instead of listing zero scores", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [resource(1, "Shares nothing with the query", "0.000000")],
            }),
          ),
      ),
    );

    renderCatalog("?q=quantum");

    expect(
      await screen.findByRole("heading", {
        name: "No studies share terms with this search",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("0.0000%")).not.toBeInTheDocument();
  });

  it("does not calculate a score until search is submitted", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderCatalog();

    fireEvent.change(screen.getByLabelText("Search the repository"), {
      target: { value: "typed but not submitted" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Search to calculate")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View full metadata/ }));
    expect(
      within(screen.getByRole("dialog")).getByText("Search to calculate"),
    ).toBeInTheDocument();
  });

  it("shows unavailable rather than a fabricated percentage for missing and failed scores", async () => {
    const missingScoreFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                ...resource(1, "Missing score", null),
                query_similarity_score: undefined,
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", missingScoreFetch);

    const { unmount } = renderCatalog("?q=missing");
    expect(
      await screen.findByText("Similarity unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText("0.0000%")).not.toBeInTheDocument();
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE" }), {
            status: 503,
          }),
      ),
    );
    renderCatalog("?q=failed");

    expect(
      await screen.findByRole("heading", {
        name: "Similarity search unavailable",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("0.0000%")).not.toBeInTheDocument();
  });

  it("ignores an older request when a newer submitted query wins the race", async () => {
    const pending = new Map<string, (response: Response) => void>();
    const fetchMock = vi.fn(
      (_path: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          const q = JSON.parse(String(init?.body)).q as string;
          pending.set(q, resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderCatalog();

    const input = screen.getByLabelText("Search the repository");
    fireEvent.change(input, { target: { value: "older" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(pending.has("older")).toBe(true));

    fireEvent.change(input, { target: { value: "newer" } });
    fireEvent.submit(screen.getByRole("search"));
    await waitFor(() => expect(pending.has("newer")).toBe(true));

    await act(async () => {
      pending.get("newer")?.(
        new Response(JSON.stringify({ data: [resource(2, "Newer result")] })),
      );
    });
    expect(await screen.findByText("Newer result")).toBeInTheDocument();

    await act(async () => {
      pending.get("older")?.(
        new Response(JSON.stringify({ data: [resource(1, "Older result")] })),
      );
    });
    expect(screen.queryByText("Older result")).not.toBeInTheDocument();
  });
});
