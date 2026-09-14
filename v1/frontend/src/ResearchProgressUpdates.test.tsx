import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResearchProgressUpdates from "./ResearchProgressUpdates";

afterEach(() => vi.unstubAllGlobals());

describe("ResearchProgressUpdates", () => {
  it("groups the newest ten researcher updates by assigned folder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("/api/monitoring/progress-updates");
        return new Response(
          JSON.stringify({
            data: [
              {
                research_document_id: 4,
                title: "Community preparedness",
                research_stage: "ongoing",
                progress_updates: Array.from({ length: 11 }, (_, index) => ({
                  id: index + 1,
                  activity_type: "RESEARCHER_PROGRESS_REPORTED",
                  performer_name: "Ada Lovelace",
                  status: "on_track",
                  remarks: `Update ${index + 1}`,
                  activity_date: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
                })),
              },
              {
                research_document_id: 5,
                title: "Empty assigned folder",
                research_stage: "title_proposal",
                progress_updates: [],
              },
            ],
          }),
        );
      }),
    );

    render(<ResearchProgressUpdates role="adviser" />);

    expect(
      await screen.findByRole("heading", { name: "Research Progress Updates" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Update 11")).toBeInTheDocument();
    expect(screen.queryByText("Update 1")).not.toBeInTheDocument();
    expect(screen.getAllByText("Ada Lovelace")).toHaveLength(10);
    expect(
      screen.getByText("No research progress updates yet."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /do not submit a manuscript for review or complete an official defense monitoring form/i,
      ),
    ).toBeInTheDocument();
  });
});
