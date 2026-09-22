import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StudyWorkspace from "./StudyWorkspace";

vi.mock("./SharedMonitoring", () => ({
  default: ({
    defenseType,
    readOnly,
  }: {
    defenseType: string;
    readOnly?: boolean;
  }) => (
    <div data-testid="shared-monitoring">
      {defenseType}:{readOnly ? "read-only" : "editable"}
    </div>
  ),
}));

afterEach(() => vi.unstubAllGlobals());

describe("StudyWorkspace", () => {
  it("opens a notification destination at the exact file feedback panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/files")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 31,
                  original_filename: "chapter-one.pdf",
                  mime_type: "application/pdf",
                  relative_path: "Chapter 1",
                  version_number: 1,
                  is_current: true,
                  upload_purpose: "initial_submission",
                  uploaded_at: "2026-09-21T08:00:00Z",
                },
              ],
            }),
          );
        }
        if (url.endsWith("/folders")) {
          return new Response(JSON.stringify({ data: ["Chapter 1"] }));
        }
        if (url.endsWith("/feedback")) {
          return new Response(JSON.stringify({ data: [] }));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const { container } = render(
      <StudyWorkspace
        role="adviser"
        researchDocumentId={17}
        title="Coastal Resilience Study"
        context={["Institute of Science"]}
        researchers={[]}
        canPostFeedback
        destination={{
          tab: "documents",
          folder: "Chapter 1",
          fileId: 31,
          panel: "feedback",
        }}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "chapter-one.pdf" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Documents" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      container.querySelector(".project-document-row.is-targeted"),
    ).toHaveTextContent("chapter-one.pdf");
    expect(
      await screen.findByText("No feedback for this document yet."),
    ).toBeInTheDocument();
  });

  it("renders the canonical navigation and keeps assigned actors read-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/files")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 31,
                  original_filename: "chapter-one.pdf",
                  mime_type: "application/pdf",
                  relative_path: "Chapter 1",
                  version_number: 1,
                  is_current: true,
                  upload_purpose: "initial_submission",
                  uploaded_at: "2026-09-21T08:00:00Z",
                },
              ],
            }),
          );
        }
        if (url.endsWith("/feedback")) {
          return new Response(JSON.stringify({ data: [] }));
        }
        if (url.endsWith("/folders")) {
          return new Response(JSON.stringify({ data: ["Manuscript"] }));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <StudyWorkspace
        role="statistician"
        researchDocumentId={17}
        title="Coastal Resilience Study"
        context={["Institute of Science", "Proposal", "Approved", "Read only"]}
        researchers={[{ id: "4", name: "Ari Santos" }]}
        people={{
          section: {
            id: 2,
            name: "ENV-401",
            academic_year: "2026-2027",
            instructor_name: "Dr. Lina Cruz",
          },
          reviewers: [{ review_role: "adviser", name: "Prof. Mara Lim" }],
        }}
        badgeLabel="Read-only record"
        monitoringReadOnly
      />,
    );

    expect(await screen.findByTestId("study-workspace")).toBeInTheDocument();
    for (const item of [
      "Overview",
      "Research Team",
      "Documents",
      "Defense Monitoring Forms",
    ]) {
      expect(screen.getByRole("button", { name: item })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Feedback" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Read-only record")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /edit research title|delete research project|manage assignments|remove/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Proposal Defense")).not.toBeInTheDocument();
    expect(screen.queryByText("Final Defense")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    expect(await screen.findByText("chapter-one.pdf")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "File feedback" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open annotations" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Defense Monitoring Forms" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Final Defense" }));

    expect(screen.getByTestId("shared-monitoring")).toHaveTextContent(
      "final:read-only",
    );
    expect(screen.queryByText("Proposal Defense")).not.toBeInTheDocument();
    expect(screen.queryByText("Final Defense")).not.toBeInTheDocument();
  });

  it("keeps the final defense team unassigned until it is managed separately", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/files")) {
          return new Response(JSON.stringify({ data: [] }));
        }
        if (url.endsWith("/folders")) {
          return new Response(JSON.stringify({ data: [] }));
        }
        if (url.endsWith("/feedback")) {
          return new Response(JSON.stringify({ data: [] }));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const emptyTeam = {
      section_id: 5,
      research_document_id: 793,
      defense_type: "proposal" as const,
      instructor: null,
      researchers: [],
      adviser: null,
      research_office_representative: null,
      chair: null,
      panel_members: [],
      support_assignments: {
        editor: null,
        statistician: null,
        librarian: null,
      },
      pre_defense_ready: false,
      post_defense_ready: false,
      complete: false,
    };

    render(
      <StudyWorkspace
        role="instructor"
        researchDocumentId={793}
        title="Section project"
        context={["Thesis 2"]}
        researchers={[]}
        projectTeam={emptyTeam}
        people={{
          section: {
            id: 5,
            name: "Thesis 2",
            academic_year: "2026-2027",
            instructor_name: "Jun Rey Sta. Rita",
          },
          reviewers: [{ review_role: "adviser", name: "Genevieve Hilot" }],
        }}
      />,
    );

    expect(await screen.findByTestId("study-workspace")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Research Team" }));

    // Proposal view still falls back to the assigned contacts.
    expect(await screen.findAllByText("Genevieve Hilot")).not.toHaveLength(0);

    // Final view must not mirror the proposal contacts.
    fireEvent.change(screen.getByLabelText("Defense team"), {
      target: { value: "final" },
    });
    expect(screen.queryByText("Genevieve Hilot")).not.toBeInTheDocument();
    expect(screen.queryByText("Jun Rey Sta. Rita")).not.toBeInTheDocument();
  });
});
