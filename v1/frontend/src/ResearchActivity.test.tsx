import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResearchActivity from "./ResearchActivity";

afterEach(() => vi.unstubAllGlobals());

function stubEndpoints({
  feedback = [] as unknown[],
  revisions = [] as unknown[],
  monitoring = [] as unknown[],
  failing = false,
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (failing) return new Response("{}", { status: 500 });
      const path = String(input);
      if (path.endsWith("/feedback"))
        return new Response(JSON.stringify({ data: feedback }));
      if (path.endsWith("/revisions"))
        return new Response(JSON.stringify({ data: revisions }));
      if (path.endsWith("/monitoring"))
        return new Response(JSON.stringify({ data: monitoring }));
      return new Response("{}", { status: 404 });
    }),
  );
}

describe("ResearchActivity", () => {
  it("shows adviser feedback, revision requests, and monitoring history", async () => {
    stubEndpoints({
      feedback: [
        {
          id: 1,
          research_document_id: 42,
          user_id: "9",
          document_file_id: null,
          comment: "Tighten the problem statement.",
          feedback_type: "revision_request",
          feedback_status: "open",
          created_at: "2026-05-02T01:00:00.000Z",
        },
      ],
      revisions: [
        {
          id: 5,
          revision_number: 2,
          revision_remarks: "Revise chapter 3.",
          revision_status: "requested",
        },
      ],
      monitoring: [
        {
          id: 7,
          research_document_id: 42,
          performed_by: "9",
          activity_type: "status_changed",
          remarks: "Returned to the researcher.",
          previous_status: "under_review",
          new_status: "revision_required",
          monitoring_status: "open",
          activity_date: "2026-05-02T02:00:00.000Z",
        },
      ],
    });

    render(<ResearchActivity researchDocumentId={42} />);

    expect(
      await screen.findByText("Tighten the problem statement."),
    ).toBeInTheDocument();
    expect(screen.getByText("Revision Request")).toBeInTheDocument();
    expect(screen.getByText("Revise chapter 3.")).toBeInTheDocument();
    expect(screen.getByText("Returned to the researcher.")).toBeInTheDocument();
    expect(
      screen.getByText("Under Review → Revision Required"),
    ).toBeInTheDocument();
  });

  it("reports empty sections without inventing activity", async () => {
    stubEndpoints();
    render(<ResearchActivity researchDocumentId={42} />);

    expect(
      await screen.findByText("No feedback has been recorded yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No revisions have been requested for this record."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No monitoring activity has been recorded yet."),
    ).toBeInTheDocument();
  });

  it("surfaces a retryable error when the record cannot be read", async () => {
    stubEndpoints({ failing: true });
    render(<ResearchActivity researchDocumentId={42} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
