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
  it("renders the canonical navigation and keeps assigned actors read-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/files") || url.endsWith("/feedback")) {
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
        role="adviser"
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
      "Research actors",
      "Documents",
      "Feedback",
      "Defense Monitoring Forms",
    ]) {
      expect(screen.getByRole("button", { name: item })).toBeInTheDocument();
    }
    expect(screen.getByText("Read-only record")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /edit research title|delete research project|manage assignments|remove/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Proposal Defense")).not.toBeInTheDocument();
    expect(screen.queryByText("Final Defense")).not.toBeInTheDocument();

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
});
