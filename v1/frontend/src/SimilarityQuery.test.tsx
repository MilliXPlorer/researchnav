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
  institute: "Institute of Computer Studies",
  degree_program: "BS Computer Science",
  category: { name: "Institutional Information Systems" },
  abstract: "Archived abstract.",
  keywords: ["repository"],
  research_stage: "completed",
  query_similarity_score: score,
  query_similarity_percentage:
    score === null ? null : (Number(score) * 100).toFixed(6),
  title_similarity_score: score ?? "0.292100",
  title_similarity_percentage:
    score === null ? "29.210000" : (Number(score) * 100).toFixed(6),
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

function renderCheck(
  mode: "title" | "content" = "title",
  role: "researcher" | "research-office" = "researcher",
) {
  render(
    <RoleSidebarPage
      role={role}
      selectedNav="Similarity Check"
      similarityMode={mode}
      navigate={vi.fn()}
    />,
  );
}

describe("researcher similarity check", () => {
  it("uses the same mode-specific interface for Research Office", () => {
    renderCheck("content", "research-office");

    expect(
      screen.getByRole("heading", { name: "Content checker" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Similarity mode")).not.toBeInTheDocument();
    expect(screen.getByText("Choose manuscript file")).toBeInTheDocument();
  });

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

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "inventory management system" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Title" }));

    await waitFor(() =>
      expect(sent).toEqual({ q: "inventory management system" }),
    );
    expect(sent).not.toHaveProperty("overall_similarity_score");
    expect(sent).not.toHaveProperty("classification");
    expect(
      await screen.findByText("INVENTORY MANAGEMENT SYSTEM FOR SMALL BUSINESS"),
    ).toBeInTheDocument();
    expect(screen.getByText("84.21%")).toBeInTheDocument();
    expect(screen.getByText("Title similarity")).toBeInTheDocument();
    expect(screen.queryByText(/Content similarity/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Shared terms" }),
    ).not.toBeInTheDocument();
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

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "web based research repository system" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Title" }));

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

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "tilapia pond monitoring" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Title" }));

    expect(
      await screen.findByText("No archived study requires adviser review."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ flagged$/)).not.toBeInTheDocument();
  });

  it("will not check until at least two characters are entered", () => {
    stubQuery([]);
    renderCheck();

    const submit = screen.getByRole("button", {
      name: "Check Title",
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "a" },
    });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText("Enter at least two characters to check."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "ab" },
    });
    expect(submit).toBeEnabled();
  });

  it("uses the title component even when the combined score is unavailable", async () => {
    stubQuery([archived(1, "AN ARCHIVED STUDY WITHOUT A SCORE", null)]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "archived study" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Title" }));

    expect(await screen.findByText("29.21%")).toBeInTheDocument();
  });

  it("hides archived public studies with zero title similarity", async () => {
    stubQuery([
      archived(1, "A WEB-BASED RESEARCH REPOSITORY SYSTEM", "0.640000", [
        "repository",
      ]),
      archived(2, "A MOBILE POND WATER QUALITY MONITOR", "0.000000"),
      archived(3, "A GEOGRAPHIC MAPPING TOOL FOR EXTENSION", "0.000000"),
    ]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "research repository" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Title" }));

    expect(
      await screen.findByText("A WEB-BASED RESEARCH REPOSITORY SYSTEM"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("A MOBILE POND WATER QUALITY MONITOR"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("A GEOGRAPHIC MAPPING TOOL FOR EXTENSION"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("list", {
        name: "Archived studies ranked by similarity",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(
      screen.getAllByText(/Low similarity does not prove originality/),
    ).toHaveLength(1);
  });

  it("shows an empty result when all title scores are zero", async () => {
    stubQuery([
      archived(1, "A MOBILE POND WATER QUALITY MONITOR", "0.000000"),
      archived(2, "A GEOGRAPHIC MAPPING TOOL FOR EXTENSION", "0.000000"),
    ]);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "quantum cryptography" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Title" }));

    expect(
      await screen.findByText(
        "No archived study shares any terms with these keywords.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("surfaces a failed check as a retryable error", async () => {
    stubQuery([], undefined, 502);
    renderCheck();

    fireEvent.change(screen.getByLabelText("Research title or keywords"), {
      target: { value: "inventory management system" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Title" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The similarity check could not be completed. No score was produced.",
    );
  });

  it("uploads a manuscript for comparison with cached archived content", async () => {
    let contentRequest = "";
    let contentBody: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/similarity/content-upload") {
          contentRequest = path;
          contentBody = init?.body as FormData;
          return new Response(
            JSON.stringify({
              data: [archived(1, "ARCHIVED MANUSCRIPT", "0.120000")],
              extracted_text: "CHAPTER 1\nExtracted manuscript content",
              file_name: "machine-learning.pdf",
            }),
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );
    renderCheck("content");

    expect(
      screen.getByRole("heading", { name: "Content checker" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    const file = new File(["manuscript"], "machine-learning.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("Manuscript file"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check content" }));

    await waitFor(() =>
      expect(contentRequest).toBe("/api/similarity/content-upload"),
    );
    const submittedBody = contentBody as FormData | null;
    expect(submittedBody).toBeInstanceOf(FormData);
    expect(submittedBody?.get("file")).toBe(file);
    expect(
      await screen.findByText("Top Repository Matches"),
    ).toBeInTheDocument();
    expect(screen.getByText("Content similarity")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Extracted PDF Text" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Extracted manuscript content/),
    ).toBeInTheDocument();
  });

  it("uploads an ordered PDF folder as files[]", async () => {
    let contentBody: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        contentBody = init?.body as FormData;
        return new Response(
          JSON.stringify({
            data: [],
            extracted_text: "CHAPTER 1\nBody",
            file_name: "2 PDF files",
          }),
        );
      }),
    );
    renderCheck("content");
    const files = [
      new File(["cover"], "00-cover.pdf", { type: "application/pdf" }),
      new File(["chapter"], "chapter-1.pdf", { type: "application/pdf" }),
    ];

    const folderInput = screen.getByLabelText("Manuscript folder");
    expect(folderInput).toHaveAttribute("webkitdirectory");

    fireEvent.change(folderInput, {
      target: { files },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check content" }));

    await waitFor(() => expect(contentBody).toBeInstanceOf(FormData));
    const submittedBody = contentBody as FormData | null;
    expect(submittedBody?.get("mode")).toBe("folder");
    expect(submittedBody?.getAll("files[]")).toEqual(files);
  });

  it("rejects a dropped folder when any file is not a PDF", () => {
    renderCheck("content");
    const pdf = new File(["pdf"], "manuscript", {
      type: "application/pdf",
    });
    const extra = new File(["metadata"], ".drag-metadata", {
      type: "application/octet-stream",
    });

    fireEvent.drop(screen.getByText("Choose manuscript file").closest("div")!, {
      dataTransfer: { files: [pdf, extra] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Folder uploads are accepted only when every file is a PDF.",
    );
    expect(
      screen.getByRole("button", { name: "Check content" }),
    ).toBeDisabled();
  });

  it("accepts a dropped folder when every file is a PDF", () => {
    renderCheck("content");
    const files = [
      new File(["cover"], "cover.pdf", { type: "application/pdf" }),
      new File(["chapter"], "chapter.pdf", { type: "application/pdf" }),
    ];

    fireEvent.drop(screen.getByText("Choose manuscript file").closest("div")!, {
      dataTransfer: { files },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("2 PDF files selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check content" })).toBeEnabled();
  });

  it("ignores an empty browser folder placeholder when dropped PDFs are valid", () => {
    renderCheck("content");
    const pdf = new File(["chapter"], "chapter.pdf", {
      type: "application/pdf",
    });
    const directoryPlaceholder = new File([], "", { type: "" });

    fireEvent.drop(screen.getByText("Choose manuscript file").closest("div")!, {
      dataTransfer: { files: [directoryPlaceholder, pdf] },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check content" })).toBeEnabled();
  });

  it("rejects unsupported content files before making a request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderCheck("content");

    fireEvent.change(screen.getByLabelText("Manuscript file"), {
      target: { files: [new File(["notes"], "notes.txt")] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Choose one PDF file.");
    expect(
      screen.getByRole("button", { name: "Check content" }),
    ).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains how to fix an upload with no valid chapter scope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "CONTENT_UPLOAD_INVALID_SCOPE" }),
            {
              status: 422,
            },
          ),
      ),
    );
    renderCheck("content");

    fireEvent.change(screen.getByLabelText("Manuscript file"), {
      target: {
        files: [
          new File(["manuscript"], "chapters.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check content" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not find a valid Chapter 1–5 section in this file. Use a manuscript with a clearly labeled Chapter 1 heading.",
    );
  });
});
