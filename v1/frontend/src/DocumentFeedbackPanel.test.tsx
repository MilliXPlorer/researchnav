import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocumentFeedbackPanel from "./DocumentFeedbackPanel";

const file = {
  id: 10,
  research_document_id: 42,
  document_type: "chapter" as const,
  version_number: 2,
  original_filename: "chapter-1-v2.pdf",
  file_extension: "pdf",
  mime_type: "application/pdf",
  file_size: 1024,
  is_current: true,
  relative_path: "Chapter 1",
  uploaded_at: "2026-09-20T10:00:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("DocumentFeedbackPanel", () => {
  it("shows only feedback linked to the selected document", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  id: 1,
                  research_document_id: 42,
                  user_id: "reviewer-1",
                  document_file_id: 10,
                  comment: "Clarify the conceptual framework.",
                  feedback_type: "suggestion",
                  feedback_status: "open",
                  reviewer_name: "Ada Viser",
                  reviewer_role: "adviser",
                  created_at: "2026-09-21T08:00:00.000Z",
                },
                {
                  id: 2,
                  research_document_id: 42,
                  user_id: "reviewer-1",
                  document_file_id: 11,
                  comment: "Feedback for another file.",
                  feedback_type: "comment",
                  feedback_status: "open",
                  created_at: "2026-09-21T09:00:00.000Z",
                },
              ],
            }),
          ),
      ),
    );

    render(
      <DocumentFeedbackPanel
        researchDocumentId={42}
        file={file}
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("Clarify the conceptual framework."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Feedback for another file."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Post feedback" }),
    ).not.toBeInTheDocument();
  });

  it("posts feedback with the selected document id", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              data: {
                id: 3,
                research_document_id: 42,
                document_file_id: 10,
                comment: "Revise the opening section.",
              },
            }),
          );
        }
        return new Response(JSON.stringify({ data: [] }));
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DocumentFeedbackPanel
        researchDocumentId={42}
        file={file}
        canPostFeedback
        onClose={vi.fn()}
      />,
    );

    await screen.findByText("No feedback yet.");
    fireEvent.change(screen.getByRole("textbox", { name: "Feedback" }), {
      target: { value: "Revise the opening section." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post feedback" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            comment: "Revise the opening section.",
            feedback_type: "comment",
            document_file_id: 10,
          }),
        }),
      ),
    );
  });

  it("lets a researcher acknowledge and mark feedback addressed", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          const input = JSON.parse(String(init.body)) as { action: string };
          return new Response(
            JSON.stringify({
              data: {
                id: 1,
                research_document_id: 42,
                document_file_id: 10,
                comment: "Clarify this section.",
                feedback_type: "suggestion",
                feedback_status: "open",
                researcher_acknowledged_at: "2026-09-21T10:00:00.000Z",
                researcher_addressed_at:
                  input.action === "address"
                    ? "2026-09-21T10:05:00.000Z"
                    : null,
                researcher_action_remarks:
                  input.action === "address" ? "Updated the chapter." : null,
                created_at: "2026-09-21T08:00:00.000Z",
              },
            }),
          );
        }
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 1,
                research_document_id: 42,
                document_file_id: 10,
                comment: "Clarify this section.",
                feedback_type: "suggestion",
                feedback_status: "open",
                created_at: "2026-09-21T08:00:00.000Z",
              },
            ],
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DocumentFeedbackPanel
        researchDocumentId={42}
        file={file}
        researcherActions
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));
    await screen.findByRole("button", { name: "Acknowledged" });
    fireEvent.click(screen.getByRole("button", { name: "Mark addressed" }));
    fireEvent.change(
      await screen.findByRole("textbox", { name: "What did you address?" }),
      { target: { value: "Updated the chapter." } },
    );
    fireEvent.submit(
      screen
        .getByRole("button", { name: "Submit addressed reply" })
        .closest("form")!,
    );

    await waitFor(() => {
      expect(
        document.querySelector(".project-comment-response"),
      ).toHaveTextContent("Updated the chapter.");
    });
    await screen.findByRole("button", { name: "Addressed" });
  });

  it("lets a feedback author resolve and reopen an item", async () => {
    let status: "open" | "resolved" = "open";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          status = (
            JSON.parse(String(init.body)) as { feedback_status: typeof status }
          ).feedback_status;
        }
        return new Response(
          JSON.stringify({
            data:
              init?.method === "PATCH"
                ? {
                    id: 1,
                    research_document_id: 42,
                    document_file_id: 10,
                    comment: "Clarify this section.",
                    feedback_type: "suggestion",
                    feedback_status: status,
                    created_at: "2026-09-21T08:00:00.000Z",
                  }
                : [
                    {
                      id: 1,
                      research_document_id: 42,
                      document_file_id: 10,
                      comment: "Clarify this section.",
                      feedback_type: "suggestion",
                      feedback_status: status,
                      created_at: "2026-09-21T08:00:00.000Z",
                    },
                  ],
          }),
        );
      }),
    );

    render(
      <DocumentFeedbackPanel
        researchDocumentId={42}
        file={file}
        canPostFeedback
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Resolve feedback" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Reopen feedback" }),
    );
    expect(
      await screen.findByText("Open", { selector: ".document-feedback-pill" }),
    ).toBeInTheDocument();
  });
});
