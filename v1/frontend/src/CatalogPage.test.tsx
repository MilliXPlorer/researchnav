import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CatalogPage from "./CatalogPage";
import type { ResearchRecord, UserSession } from "./types";

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

const authenticatedSession: UserSession = {
  email: "ada@example.test",
  role: "researcher",
  accessStatus: "active",
  isAdmin: false,
  firstName: "Ada",
  middleName: null,
  lastName: "Lovelace",
  studentEmployeeId: "2026-001",
  displayName: "Ada Lovelace",
  profilePhotoUrl: null,
};

function resource(
  id: number,
  title: string,
  querySimilarityScore: string | null = "0.987654",
) {
  const percentage =
    querySimilarityScore === null
      ? null
      : (Number(querySimilarityScore) * 100).toFixed(6);
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
    query_title_similarity_score: querySimilarityScore,
    query_title_similarity_percentage: percentage,
    query_content_similarity_score: "0.123456",
    query_content_similarity_percentage: "12.345600",
    query_similarity_score: querySimilarityScore,
    query_similarity_percentage: percentage,
    title_similarity_score: "0.292100",
    title_similarity_percentage: "29.210000",
    title_weight: "0.300000000000",
    title_weighted_contribution: "8.763000",
    content_similarity_score: "0.234400",
    content_similarity_percentage: "23.440000",
    content_weight: "0.700000000000",
    content_weighted_contribution: "16.408000",
    overall_similarity_score: querySimilarityScore,
    overall_similarity_percentage: percentage,
    classification: "low",
    overall_flagged: false,
    title_match_alert: false,
    adviser_review_required: false,
    flag_reason: "not_flagged",
    algorithm_version: "weighted-v1",
    analyzed_at: "2026-09-02T00:00:00.000000Z",
    score_status: "scored",
  };
}

function renderCatalog(initialSearch?: string, session?: UserSession | null) {
  return render(
    <CatalogPage
      onSignIn={vi.fn()}
      session={session}
      navigate={vi.fn()}
      records={[fallbackRecord]}
      initialSearch={initialSearch}
    />,
  );
}

beforeEach(() => window.history.replaceState({}, "", "/catalog"));
afterEach(() => vi.unstubAllGlobals());

describe("CatalogPage public similarity search", () => {
  it("shows the manuscript sign-in card only to unauthenticated users", () => {
    const { unmount } = renderCatalog(undefined, null);

    expect(
      screen.getByRole("heading", { name: "Need the full manuscript?" }),
    ).toBeInTheDocument();
    unmount();

    const { container } = renderCatalog(undefined, authenticatedSession);

    expect(
      screen.queryByRole("heading", { name: "Need the full manuscript?" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector(".catalog-layout")).toHaveClass(
      "is-authenticated",
    );
  });

  it("shows final manuscript unavailable in metadata for authenticated users without a final manuscript", () => {
    renderCatalog(undefined, authenticatedSession);

    fireEvent.click(screen.getByRole("button", { name: /View full metadata/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Author, F.")).toBeInTheDocument();
    expect(within(dialog).getByText("Fallback Author")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Final manuscript unavailable"),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText("Sign in to download"),
    ).not.toBeInTheDocument();
  });

  it("places the search tip directly below the filters", () => {
    const { container } = renderCatalog();
    const toolbar = container.querySelector(".catalog-toolbar");

    expect(toolbar?.nextElementSibling).toHaveClass("catalog-search-tip");
    expect(toolbar?.nextElementSibling).toHaveTextContent("Search tip");
  });

  it("shows a typeable year range, category, and institute metadata filters", () => {
    renderCatalog();

    expect(
      screen.getByLabelText("Filter from publication year"),
    ).toHaveAttribute("list");
    expect(screen.getByLabelText("Filter to publication year")).toHaveAttribute(
      "list",
    );
    expect(
      screen.getByRole("combobox", { name: /filter by category/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /filter by institute/i }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("combobox", { name: /filter by institute/i }),
      ).getAllByRole("option"),
    ).toHaveLength(7);
    expect(
      screen.queryByRole("textbox", { name: /author/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /keyword/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply" }),
    ).not.toBeInTheDocument();
  });

  it("stores an inclusive publication-year range in the catalog URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [], links: { next: null } })),
      ),
    );
    renderCatalog();

    const from = screen.getByLabelText("Filter from publication year");
    const to = screen.getByLabelText("Filter to publication year");
    fireEvent.change(from, { target: { value: "2022" } });
    fireEvent.change(to, { target: { value: "2024" } });

    expect(window.location.search).toContain("year_from=2022");
    expect(window.location.search).toContain("year_to=2024");
    expect(from).toHaveAttribute("max", "2024");
    expect(to).toHaveAttribute("min", "2022");
    expect(
      await screen.findByText("No studies match these filters"),
    ).toBeInTheDocument();
  });

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

  it("allows similarity results to be sorted by publication year", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  ...resource(1, "More relevant older study", "0.900000"),
                  publication_year: 2020,
                },
                {
                  ...resource(2, "Less relevant newer study", "0.700000"),
                  publication_year: 2026,
                },
              ],
            }),
          ),
      ),
    );

    renderCatalog("?q=water");
    await screen.findByText("More relevant older study");
    fireEvent.change(screen.getByRole("combobox", { name: "Sort studies" }), {
      target: { value: "newest" },
    });

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual([
      "Less relevant newer study",
      "More relevant older study",
    ]);
  });

  it("displays only the overall score, API classification, and alert statuses on the card", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  ...resource(1, "Exact query score", "1.000000"),
                  manuscript_date_label: "May 2026",
                  title_similarity_score: "1.000000",
                  title_similarity_percentage: "100.000000",
                  title_weighted_contribution: "30.000000",
                  content_similarity_score: "1.000000",
                  content_similarity_percentage: "100.000000",
                  content_weighted_contribution: "70.000000",
                  classification: "high",
                  overall_flagged: true,
                  adviser_review_required: true,
                  title_match_alert: true,
                  flag_reason: "overall_and_title_match",
                },
              ],
            }),
          ),
      ),
    );

    renderCatalog("?q=exact");

    expect(await screen.findByText("Overall Similarity")).toBeInTheDocument();
    expect(screen.queryByText("Title similarity")).not.toBeInTheDocument();
    expect(screen.queryByText("Content similarity")).not.toBeInTheDocument();
    expect(screen.getByText("100.00%")).toBeInTheDocument();
    expect(screen.getByText("Classification: HIGH")).toBeInTheDocument();
    expect(screen.getByText("Adviser review required")).toBeInTheDocument();
    expect(
      screen.getByText("Near-exact title match alert"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View full metadata/ }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("img", {
        name: "Overall similarity: 100.00%, classification HIGH",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", {
        name: "Title similarity: 100.00%",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", {
        name: "Content similarity: 100.00%",
      }),
    ).toBeInTheDocument();
    const metadataLabels = Array.from(
      dialog.querySelectorAll(".metadata-grid > div > dt"),
      (label) => label.textContent,
    );
    expect(metadataLabels.indexOf("Similarity overview")).toBeGreaterThan(
      metadataLabels.indexOf("Final binding date"),
    );
    expect(metadataLabels).toEqual([
      "Year",
      "Institute",
      "Researchers",
      "Final binding date",
      "Similarity overview",
    ]);
    expect(within(dialog).queryByText("Title Weight")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Content Weight"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Title contribution to overall"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Content contribution to overall"),
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Calculation")).not.toBeInTheDocument();
  });

  it("shows a content-only match as zero title with the content score as overall", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  ...resource(1, "Content-only result", "0.456000"),
                  title_similarity_score: "0.000000",
                  title_similarity_percentage: "0.000000",
                  content_similarity_score: "0.456000",
                  content_similarity_percentage: "45.600000",
                  overall_similarity_score: "0.456000",
                  overall_similarity_percentage: "45.600000",
                },
              ],
            }),
          ),
      ),
    );

    renderCatalog("?q=content");

    expect(await screen.findByText("Content-only result")).toBeInTheDocument();
    expect(screen.getByText("45.60%")).toBeInTheDocument();
  });

  it("preserves the backend order and does not client-filter zero-scoring results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                resource(1, "Shares terms with the query", "0.512300"),
                resource(2, "Shares nothing with the query", "0.000000"),
                resource(3, "Has a tiny nonzero match", "0.000001"),
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
      screen.getByText("Shares nothing with the query"),
    ).toBeInTheDocument();
    expect(screen.getByText("Has a tiny nonzero match")).toBeInTheDocument();
    expect(screen.getAllByText("0.00%")).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: /View full metadata/ }),
    ).toHaveLength(3);
  });

  it("keeps an API-returned zero score visible rather than inventing an empty state", async () => {
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
        name: "Shares nothing with the query",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("0.00%")).toBeInTheDocument();
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
                overall_similarity_score: undefined,
                overall_similarity_percentage: undefined,
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", missingScoreFetch);

    const { unmount } = renderCatalog("?q=missing");
    expect(await screen.findByText("Overall Similarity")).toBeInTheDocument();
    expect(
      screen.getByText("Overall similarity unavailable", { exact: false }),
    ).toBeInTheDocument();
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
    expect(screen.queryByText("0.00%")).not.toBeInTheDocument();
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
