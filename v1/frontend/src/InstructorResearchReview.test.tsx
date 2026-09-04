import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InstructorResearchReview from "./InstructorResearchReview";

afterEach(() => vi.unstubAllGlobals());

const submission = {
  research_document_id: 42,
  title: "A Reviewed Research Title",
  research_stage: "title_proposal" as const,
  submission_status: "under_review" as const,
  submitter: "Student Researcher",
  updated_at: "2026-08-20T10:00:00.000Z",
};

function stubReviewApi() {
  const requests: Array<{ path: string; method: string; body: string | null }> =
    [];
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      requests.push({
        path,
        method,
        body: typeof init?.body === "string" ? init.body : null,
      });

      if (path === "/api/research/42" && method === "GET")
        return new Response(
          JSON.stringify({
            data: {
              id: 42,
              submitted_by: "student",
              title: submission.title,
              abstract: "Research abstract.",
              keywords: "research, review",
              publication_year: 2026,
              research_stage: "title_proposal",
              submission_status: "under_review",
              archive_status: "not_archived",
              visibility: "private",
            },
          }),
        );
      if (path.endsWith("/files"))
        return new Response(JSON.stringify({ data: [] }));
      if (path.endsWith("/similarity"))
        return new Response(JSON.stringify({ data: [] }));
      if (path.endsWith("/feedback") && method === "GET")
        return new Response(JSON.stringify({ data: [] }));
      if (path.endsWith("/feedback") && method === "POST")
        return new Response(JSON.stringify({ data: { id: 1 } }), {
          status: 201,
        });
      if (path.endsWith("/revisions") && method === "GET")
        return new Response(JSON.stringify({ data: [] }));
      if (path.endsWith("/revisions") && method === "POST")
        return new Response(JSON.stringify({ data: { id: 2 } }), {
          status: 201,
        });
      if (path.endsWith("/monitoring"))
        return new Response(JSON.stringify({ data: [] }));
      if (path.endsWith("/validation") && method === "GET")
        return new Response(JSON.stringify({ data: [] }));
      if (path.endsWith("/recommendation") && method === "POST")
        return new Response(
          JSON.stringify({ data: { id: 7, validation_status: "approved" } }),
          { status: 201 },
        );
      return new Response("{}", { status: 404 });
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return requests;
}

describe("InstructorResearchReview", () => {
  it("shows reviewer evidence and records comments without transitioning workflow", async () => {
    const requests = stubReviewApi();
    render(
      <InstructorResearchReview submission={submission} onUpdated={vi.fn()} />,
    );

    expect(await screen.findByText("Research abstract.")).toBeInTheDocument();
    expect(screen.getByText("Before proposal defense")).toBeInTheDocument();
    expect(
      screen.getByText("No similarity results are available yet."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Clarify the research gap." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add remark" }));

    await screen.findByText("Comment added to the review history.");
    expect(requests).toContainEqual(
      expect.objectContaining({
        path: "/api/research/42/feedback",
        method: "POST",
        body: JSON.stringify({
          comment: "Clarify the research gap.",
          feedback_type: "comment",
          document_file_id: null,
        }),
      }),
    );
    expect(requests.some((request) => request.path.endsWith("/status"))).toBe(
      false,
    );
  });

  it("requests formal revisions and records advisory title recommendations", async () => {
    const requests = stubReviewApi();
    render(
      <InstructorResearchReview submission={submission} onUpdated={vi.fn()} />,
    );
    await screen.findByText("Research abstract.");

    fireEvent.change(screen.getByLabelText("Required changes"), {
      target: { value: "Revise the methodology." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));
    await screen.findByText(
      "Revision requested and the researcher was notified.",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record recommendation" }),
    );
    await screen.findByText("Title recommendation recorded.");

    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.path === "/api/research/42/revisions" &&
            request.method === "POST",
        ),
      ).toBe(true),
    );
    expect(requests).toContainEqual(
      expect.objectContaining({
        path: "/api/research/42/recommendation",
        method: "POST",
      }),
    );
    expect(requests.some((request) => request.path.endsWith("/status"))).toBe(
      false,
    );
  });
});
