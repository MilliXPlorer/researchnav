import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RoleSidebarPage from "./RoleSidebarPages";

afterEach(() => vi.unstubAllGlobals());

const archived = (
  id: number,
  title: string,
  score: string | null,
  matchedTerms: string[] = [],
) => ({
  id,
  title,
  authors: [
    {
      author_name: "Dela Cruz",
      author_order: 1,
      is_corresponding_author: true,
    },
  ],
  publication_year: 2026,
  institution_name: "Tangub City Global College",
  academic_unit: "Institute of Computer Studies",
  degree_program: "BS Computer Science",
  category: { name: "Institutional Information Systems" },
  abstract: "Archived abstract.",
  keywords: ["repository"],
  research_stage: "completed",
  query_similarity_score: score,
  query_similarity_percentage:
    score === null ? null : (Number(score) * 100).toFixed(6),
  title_similarity_score: "0.292100",
  title_similarity_percentage: "29.210000",
  title_weight: "0.300000000000",
  title_weighted_contribution: "8.763000",
  content_similarity_score: "0.234400",
  content_similarity_percentage: "23.440000",
  content_weight: "0.700000000000",
  content_weighted_contribution: "16.408000",
  overall_similarity_score: score,
  overall_similarity_percentage:
    score === null ? null : (Number(score) * 100).toFixed(6),
  classification: "low",
  overall_flagged: false,
  title_match_alert: false,
  adviser_review_required: false,
  flag_reason: "not_flagged",
  algorithm_version: "weighted-v1",
  analyzed_at: "2026-09-02T00:00:00.000000Z",
  score_status: "scored",
  matched_terms: matchedTerms,
});

function stubQuery(
  results: unknown[],
  onRequest?: (body: unknown) => void,
  status = 200,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/similarity/query") {
        onRequest?.(init?.body ? JSON.parse(String(init.body)) : null);
        if (status !== 200) {
          return new Response(
            JSON.stringify({ error: "SIMILARITY_PROCESS_FAILED" }),
            { status },
          );
        }
        return new Response(JSON.stringify({ data: results }));
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

function renderCheck() {
  render(
    <RoleSidebarPage
      role="researcher"
      selectedNav="Similarity Check"
      navigate={vi.fn()}
    />,
  );
}

describe("researcher similarity check", () => {
  it("compares the typed keywords rather than an existing submission", async () => {
    let sent: unknown = null;
    stubQuery(
      [
        archived(
          1,
          "INVENTORY MANAGEMENT SYSTEM FOR SMALL BUSINESS",
          "0.842100",
          ["inventory", "management", "system"],
        ),
      ],
      (body) => {
        sent = body;
      },
    );
    renderCheck();

    // No submission list is requested and no submission must be selected first.
    expect(
      screen.queryByText(/no submissions to run a similarity check/i),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "inventory management system" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    await waitFor(() =>
      expect(sent).toEqual({ q: "inventory management system" }),
    );
    expect(sent).not.toHaveProperty("overall_similarity_score");
    expect(sent).not.toHaveProperty("classification");
    expect(
      await screen.findByText("INVENTORY MANAGEMENT SYSTEM FOR SMALL BUSINESS"),
    ).toBeInTheDocument();
    expect(screen.getByText("84.21%")).toBeInTheDocument();
    expect(screen.getByText(/Weight 30\.00%/)).toBeInTheDocument();
    expect(screen.getByText(/Weight 70\.00%/)).toBeInTheDocument();
    expect(
      screen.getByText("inventory, management, system"),
    ).toBeInTheDocument();
  });

  it("uses the backend review decision rather than applying a local threshold", async () => {
    stubQuery([
      {
        ...archived(1, "A WEB-BASED RESEARCH REPOSITORY SYSTEM", "0.780000"),
        classification: "high",
        overall_flagged: true,
        adviser_review_required: true,
        flag_reason: "overall_high_similarity",
      },
      archived(2, "A MOBILE POND WATER QUALITY MONITOR", "0.120000"),
    ]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "web based research repository system" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(await screen.findByText("1 require review")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This result has been flagged for adviser review. The system does not automatically reject the research.",
      ),
    ).toBeInTheDocument();
  });

  it("reports when the service requires no adviser review", async () => {
    stubQuery([archived(1, "A MOBILE POND WATER QUALITY MONITOR", "0.100000")]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "tilapia pond monitoring" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(
      await screen.findByText("No archived study requires adviser review."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ flagged$/)).not.toBeInTheDocument();
  });

  it("will not check until at least two characters are entered", () => {
    stubQuery([]);
    renderCheck();

    const submit = screen.getByRole("button", {
      name: "Check for duplicates",
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "a" },
    });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText("Enter at least two characters to check."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "ab" },
    });
    expect(submit).toBeEnabled();
  });

  it("shows an unavailable score instead of inventing one", async () => {
    stubQuery([archived(1, "AN ARCHIVED STUDY WITHOUT A SCORE", null)]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "archived study" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(
      await screen.findByText("Overall similarity unavailable"),
    ).toBeInTheDocument();
  });

  it("shows all archived public studies including zero-scoring studies", async () => {
    stubQuery([
      archived(1, "A WEB-BASED RESEARCH REPOSITORY SYSTEM", "0.640000", [
        "repository",
      ]),
      archived(2, "A MOBILE POND WATER QUALITY MONITOR", "0.000000"),
      archived(3, "A GEOGRAPHIC MAPPING TOOL FOR EXTENSION", "0.000000"),
    ]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "research repository" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(
      await screen.findByText("A WEB-BASED RESEARCH REPOSITORY SYSTEM"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A MOBILE POND WATER QUALITY MONITOR"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A GEOGRAPHIC MAPPING TOOL FOR EXTENSION"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("0.00%")).toHaveLength(2);
  });

  it("shows every archived public study when all scores are zero", async () => {
    stubQuery([
      archived(1, "A MOBILE POND WATER QUALITY MONITOR", "0.000000"),
      archived(2, "A GEOGRAPHIC MAPPING TOOL FOR EXTENSION", "0.000000"),
    ]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "quantum cryptography" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(
      await screen.findByText("No archived study requires adviser review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("0.00%")).toHaveLength(2);
  });

  it("surfaces a failed check as a retryable error", async () => {
    stubQuery([], undefined, 502);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "inventory management system" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The similarity check could not be completed. No score was produced.",
    );
  });
});
