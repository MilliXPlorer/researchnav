import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SimilarityResultResource } from "./api";
import SimilarityResults from "./SimilarityResults";

const result = (
  id: number,
  score: string,
  isFlagged: boolean,
  overrides: Partial<SimilarityResultResource> = {},
): SimilarityResultResource => ({
  id,
  source_research_id: 42,
  matched_research_id: id + 100,
  source_title: "Private source title",
  matched_title: `Matched study ${id}`,
  tfidf_score: null,
  title_similarity_score: score,
  title_similarity_percentage: "29.210000",
  title_weight: "0.300000000000",
  title_weighted_contribution: "8.763000",
  content_similarity_score: score,
  content_similarity_percentage: "23.440000",
  content_weight: "0.700000000000",
  content_weighted_contribution: "16.408000",
  overall_similarity_score: score,
  overall_similarity_percentage: "25.170000",
  classification: "low",
  overall_flagged: isFlagged,
  title_match_alert: false,
  adviser_review_required: isFlagged,
  flag_reason: isFlagged ? "overall_high_similarity" : "not_flagged",
  cosine_score: "0.5",
  fasttext_score: "0.5",
  final_similarity_score: score,
  score_status: "scored",
  threshold: "0.7",
  contextual_analysis: "Terms are used in a related research context.",
  matched_terms: ["private term"],
  analysis_type: "document",
  algorithm_version: "combined-title-content-tfidf-cosine-v1",
  analyzed_at: null,
  ...overrides,
});

describe("SimilarityResults", () => {
  it("keeps checking disabled until a research record is selected", () => {
    render(<SimilarityResults />);

    expect(
      screen.getByText(
        "Select a research record to review manuscript similarity",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run manuscript similarity check" }),
    ).toBeDisabled();
  });

  it("renders the API's weighted result exactly to two decimals", async () => {
    render(
      <SimilarityResults
        researchDocumentId={42}
        fetchPersistedResults={vi.fn(async () => [
          result(2, "0.251700", false),
        ])}
      />,
    );

    expect(
      await screen.findByRole("list", { name: "Ranked manuscript matches" }),
    ).toBeInTheDocument();
    const matches = screen.getAllByRole("listitem");
    expect(matches[0]).toHaveTextContent("Matched study 2");
    expect(matches[0]).toHaveTextContent("Overall Similarity: 25.17%");
    expect(matches[0]).toHaveTextContent("Classification: LOW");
    expect(matches[0]).toHaveTextContent("Title: 29.21%");
    expect(matches[0]).toHaveTextContent("Weight: 30.00%");
    expect(matches[0]).toHaveTextContent("Contribution: 8.76 points");
    expect(matches[0]).toHaveTextContent("Content: 23.44%");
    expect(matches[0]).toHaveTextContent("Weight: 70.00%");
    expect(matches[0]).toHaveTextContent("Contribution: 16.41 points");
    expect(matches[0]).toHaveTextContent(
      "Displayed overall ≈ 8.76 + 16.41 ≈ 25.17%",
    );
    expect(matches[0]).toHaveTextContent(
      "The system detected low similarity based on the configured comparison method.",
    );
    expect(matches[0]).toHaveTextContent(
      "Low similarity does not prove originality.",
    );
    expect(
      screen.getAllByText("Contextual similarity note:")[0],
    ).toBeInTheDocument();
    expect(screen.queryByText("Private source title")).not.toBeInTheDocument();
    expect(screen.queryByText("0.251700")).not.toBeInTheDocument();
  });

  it("uses backend review and near-exact title safeguards without applying local thresholds", async () => {
    render(
      <SimilarityResults
        researchDocumentId={42}
        fetchPersistedResults={vi.fn(async () => [
          result(1, "0.251700", false, {
            classification: "high",
            overall_flagged: true,
            adviser_review_required: true,
            title_match_alert: true,
            flag_reason: "overall_and_title_match",
          }),
        ])}
      />,
    );

    const match = await screen.findByText("Matched study 1");
    expect(match.parentElement).toHaveTextContent("Classification: HIGH");
    expect(
      screen.getByText("Near-exact title match alert"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This result has been flagged for adviser review. The system does not automatically reject the research.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a real check error without rendering a zero-percent score", async () => {
    const checkTitleSimilarity = vi.fn(async () => {
      throw new Error("REQUEST_FAILED_501");
    });
    render(
      <SimilarityResults
        researchDocumentId={42}
        fetchPersistedResults={vi.fn(async () => [])}
        checkTitleSimilarity={checkTitleSimilarity}
      />,
    );

    await screen.findByText("No persisted manuscript-similarity candidates");
    fireEvent.click(
      screen.getByRole("button", { name: "Run manuscript similarity check" }),
    );

    expect(
      await screen.findByText(
        "The manuscript similarity check could not be completed. Confirm that a current text-based PDF or DOCX is available, then try again.",
      ),
    ).toHaveAttribute("role", "alert");
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    await waitFor(() => expect(checkTitleSimilarity).toHaveBeenCalledWith(42));
  });

  it("keeps server-ranked unavailable content results and does not show an equation", async () => {
    const unavailable = {
      ...result(2, "0", false),
      score_status: "content_unavailable" as const,
      final_similarity_score: null,
      content_similarity_score: null,
      content_similarity_percentage: null,
      content_weight: null,
      content_weighted_contribution: null,
      overall_similarity_score: null,
      overall_similarity_percentage: null,
      classification: null,
    };
    render(
      <SimilarityResults
        researchDocumentId={42}
        fetchPersistedResults={vi.fn(async () => [unavailable])}
      />,
    );

    expect(await screen.findByText("Matched study 2")).toBeInTheDocument();
    expect(
      screen.getByText("Content analysis unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Overall Similarity:").parentElement,
    ).toHaveTextContent("Overall similarity unavailable");
    expect(screen.queryByText(/Overall =/)).not.toBeInTheDocument();
  });

  it("offers a catalog action for each matched title when supplied", async () => {
    const onOpenCatalog = vi.fn();
    render(
      <SimilarityResults
        researchDocumentId={42}
        fetchPersistedResults={vi.fn(async () => [result(1, "0.58", false)])}
        onOpenCatalog={onOpenCatalog}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Search catalog" }),
    );
    expect(onOpenCatalog).toHaveBeenCalledWith("Matched study 1");
  });

  it("does not apply an earlier check after switching research records", async () => {
    let resolveCheckA: (() => void) | undefined;
    const checkTitleSimilarity = vi.fn((id: string | number) =>
      id === 42
        ? new Promise<void>((resolve) => {
            resolveCheckA = resolve;
          })
        : Promise.resolve(),
    );
    const fetchPersistedResults = vi.fn(async (id: string | number) =>
      id === 43 ? [result(43, "0.81", false)] : [],
    );
    const view = render(
      <SimilarityResults
        researchDocumentId={42}
        checkTitleSimilarity={checkTitleSimilarity}
        fetchPersistedResults={fetchPersistedResults}
      />,
    );

    await screen.findByText("No persisted manuscript-similarity candidates");
    fireEvent.click(
      screen.getByRole("button", { name: "Run manuscript similarity check" }),
    );
    view.rerender(
      <SimilarityResults
        researchDocumentId={43}
        checkTitleSimilarity={checkTitleSimilarity}
        fetchPersistedResults={fetchPersistedResults}
      />,
    );
    expect(await screen.findByText("Matched study 43")).toBeInTheDocument();

    await act(async () => resolveCheckA?.());

    expect(screen.getByText("Matched study 43")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run manuscript similarity check" }),
    ).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retires a pending check when switching A-to-B-to-A", async () => {
    let rejectOldCheck!: (reason?: unknown) => void;
    let resolveFreshCheck!: () => void;
    const oldCheck = new Promise<void>((_, reject) => {
      rejectOldCheck = reject;
    });
    const freshCheck = new Promise<void>((resolve) => {
      resolveFreshCheck = resolve;
    });
    let checkCount = 0;
    const checkTitleSimilarity = vi.fn(() => {
      checkCount += 1;
      return checkCount === 1 ? oldCheck : freshCheck;
    });
    const fetchPersistedResults = vi.fn(async (id: string | number) => {
      if (id === 43) return [result(43, "0.81", false)];
      return checkCount > 1 ? [result(99, "0.72", false)] : [];
    });
    const view = render(
      <SimilarityResults
        researchDocumentId={42}
        checkTitleSimilarity={checkTitleSimilarity}
        fetchPersistedResults={fetchPersistedResults}
      />,
    );

    await screen.findByText("No persisted manuscript-similarity candidates");
    fireEvent.click(
      screen.getByRole("button", { name: "Run manuscript similarity check" }),
    );
    expect(
      screen.getByRole("button", { name: "Checking manuscript…" }),
    ).toBeDisabled();

    view.rerender(
      <SimilarityResults
        researchDocumentId={43}
        checkTitleSimilarity={checkTitleSimilarity}
        fetchPersistedResults={fetchPersistedResults}
      />,
    );
    expect(await screen.findByText("Matched study 43")).toBeInTheDocument();
    view.rerender(
      <SimilarityResults
        researchDocumentId={42}
        checkTitleSimilarity={checkTitleSimilarity}
        fetchPersistedResults={fetchPersistedResults}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Run manuscript similarity check",
      }),
    ).toBeEnabled();
    expect(screen.queryByText("Matched study 43")).not.toBeInTheDocument();

    await act(async () => rejectOldCheck(new Error("STALE_CHECK_FAILED")));

    expect(screen.queryByText("Matched study 43")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Run manuscript similarity check" }),
    );
    expect(checkTitleSimilarity).toHaveBeenCalledTimes(2);

    await act(async () => resolveFreshCheck());

    expect(await screen.findByText("Matched study 99")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run manuscript similarity check" }),
    ).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
