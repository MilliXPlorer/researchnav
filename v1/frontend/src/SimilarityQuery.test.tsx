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
    expect(
      await screen.findByText("INVENTORY MANAGEMENT SYSTEM FOR SMALL BUSINESS"),
    ).toBeInTheDocument();
    expect(screen.getByText("84%")).toBeInTheDocument();
    expect(
      screen.getByText("inventory, management, system"),
    ).toBeInTheDocument();
  });

  it("announces when a match reaches the 70 percent review threshold", async () => {
    stubQuery([
      archived(1, "A WEB-BASED RESEARCH REPOSITORY SYSTEM", "0.780000"),
      archived(2, "A MOBILE POND WATER QUALITY MONITOR", "0.120000"),
    ]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "web based research repository system" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(await screen.findByText("1 flagged")).toBeInTheDocument();
    expect(
      screen.getByText(/reached the 70% review threshold/),
    ).toBeInTheDocument();
  });

  it("reports when nothing reaches the threshold", async () => {
    stubQuery([archived(1, "A MOBILE POND WATER QUALITY MONITOR", "0.100000")]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "tilapia pond monitoring" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(
      await screen.findByText(
        "No archived study reached the 70% review threshold.",
      ),
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

    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
  });

  it("hides zero-scoring studies and reports how many were set aside", async () => {
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
      screen.queryByText("A MOBILE POND WATER QUALITY MONITOR"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("A GEOGRAPHIC MAPPING TOOL FOR EXTENSION"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(
      screen.getByText(/2 archived studies share no terms/),
    ).toBeInTheDocument();
  });

  it("reports plainly when every study scores zero", async () => {
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
      await screen.findByText(
        "No archived study shares any terms with these keywords.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
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
