import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssignedResearchFolders from "./AssignedResearchFolders";
import type { Role } from "./types";

const research = {
  id: 17,
  title: "Coastal Resilience Study",
  abstract: "A study of coastal community resilience.",
  institute: "Institute of Science",
  degree_program: "Environmental Science",
  research_stage: "proposal",
  submission_status: "approved",
  researchers: ["Ari Santos"],
  authors: [{ id: 4, author_name: "Ari Santos" }],
};

const monitoring = {
  research_document_id: research.id,
  title: research.title,
  researchers: research.researchers,
  editable_stages: ["after_final_defense"],
  stages: {
    before_proposal_defense: {
      sections: [{ designation: "Adviser", entry: null }],
      verified_by: null,
      verified_at: null,
    },
    after_proposal_defense: {
      sections: [{ designation: "Panel 1", entry: null }],
      verified_by: null,
      verified_at: null,
    },
    before_final_defense: {
      sections: [{ designation: "Adviser", entry: null }],
      verified_by: null,
      verified_at: null,
    },
    after_final_defense: {
      sections: [{ designation: "Panel 1", entry: null }],
      verified_by: null,
      verified_at: null,
    },
  },
};

function assignedStudyFetch(input: RequestInfo | URL) {
  const url = String(input);
  if (url === "/api/monitoring/research") {
    return new Response(JSON.stringify({ data: [research] }));
  }
  if (url === `/api/research/${research.id}`) {
    return new Response(JSON.stringify({ data: research }));
  }
  if (url === `/api/research/${research.id}/people`) {
    return new Response(
      JSON.stringify({
        data: {
          section: {
            id: 2,
            name: "ENV-401",
            academic_year: "2026-2027",
            instructor_name: "Dr. Lina Cruz",
          },
          reviewers: [
            { review_role: "adviser", name: "Prof. Mara Lim" },
            { review_role: "statistician", name: "Noel Reyes" },
          ],
        },
      }),
    );
  }
  if (
    url === `/api/research/${research.id}/files` ||
    url === `/api/research/${research.id}/folders` ||
    url === `/api/research/${research.id}/feedback`
  ) {
    return new Response(JSON.stringify({ data: [] }));
  }
  if (
    url === `/api/research/${research.id}/revisions` ||
    url === `/api/research/${research.id}/monitoring`
  ) {
    return new Response(JSON.stringify({ data: [] }));
  }
  if (url === `/api/research/${research.id}/shared-monitoring`) {
    return new Response(JSON.stringify({ data: monitoring }));
  }
  throw new Error(`Unexpected request: ${url}`);
}

afterEach(() => vi.unstubAllGlobals());

describe("AssignedResearchFolders", () => {
  it.each<Role>([
    "adviser",
    "panel",
    "statistician",
    "research_editor",
    "librarian",
  ])("shows only assignment-scoped folders for %s", async (role) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/monitoring/research");
      return new Response(JSON.stringify({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssignedResearchFolders role={role} />);

    expect(
      await screen.findByRole("heading", {
        name: "No assigned research folders",
      }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: /add|edit|upload|delete/i }),
    ).not.toBeInTheDocument();
  });

  it.each<Role>(["adviser", "panel"])(
    "uses the shared read-only workspace for an assigned %s study",
    async (role) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => assignedStudyFetch(input)),
      );

      render(<AssignedResearchFolders role={role} />);

      fireEvent.click(
        await screen.findByRole("button", {
          name: "Open research folder Coastal Resilience Study",
        }),
      );

      expect(await screen.findByTestId("study-workspace")).toBeInTheDocument();
      expect(
        screen.queryByRole("complementary", {
          name: "Assigned research folders",
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Back to Assigned Research" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Back to Sections" }),
      ).not.toBeInTheDocument();
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
          name: /edit research title|delete research project|manage assignments|remove|post feedback/i,
        }),
      ).not.toBeInTheDocument();
    },
  );

  it("moves from the full-width assigned study list to the workspace and back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => assignedStudyFetch(input)),
    );

    const { container } = render(<AssignedResearchFolders role="adviser" />);

    expect(
      await screen.findByRole("heading", { name: "Assigned Research" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", {
        name: "Assigned research folders",
      }),
    ).toHaveClass("assigned-research-folders");
    expect(
      container.querySelector(".project-documents-layout"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("study-workspace")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open research folder Coastal Resilience Study",
      }),
    );

    const workspace = await screen.findByTestId("study-workspace");
    expect(workspace.closest(".section-page-view")).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", {
        name: "Assigned research folders",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Assigned Research" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Back to Assigned Research" }),
    );

    expect(
      await screen.findByRole("complementary", {
        name: "Assigned research folders",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("study-workspace")).not.toBeInTheDocument();
  });

  it("opens its floating defense menu only on demand and selects Final monitoring", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => assignedStudyFetch(input)),
    );

    render(<AssignedResearchFolders role="panel" />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open research folder Coastal Resilience Study",
      }),
    );
    const trigger = await screen.findByRole("button", {
      name: "Defense Monitoring Forms",
    });
    expect(
      screen.getByRole("button", { name: "Defense Monitoring Forms" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Proposal Defense" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Final Defense" }),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Final Defense" }));

    expect(
      screen.getByRole("button", { name: "Defense Monitoring Forms" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Final Defense" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("tab", { name: "Before Final Defense" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "After Final Defense" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Add new defense monitoring entry",
      }),
    ).toBeInTheDocument();
  });

  it("keeps Research Office representative assignment in the shared actor tab", async () => {
    const sectionResearch = { ...research, section_id: 2 };
    const team = {
      section_id: 2,
      research_document_id: research.id,
      instructor: null,
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
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/research/${research.id}`) {
          return new Response(JSON.stringify({ data: sectionResearch }));
        }
        if (url === `/api/office/research/${research.id}/team`) {
          return new Response(JSON.stringify({ data: team }));
        }
        if (
          url ===
          `/api/office/research/${research.id}/representative-candidates`
        ) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  user_id: "rep-1",
                  name: "Taylor Lee",
                  email: "taylor@example.test",
                  team_role: "research_office_representative",
                },
              ],
            }),
          );
        }
        if (url === `/api/office/research/${research.id}/representative`) {
          expect(init?.method).toBe("PUT");
          expect(init?.body).toBe(JSON.stringify({ user_id: "rep-1" }));
          return new Response(
            JSON.stringify({
              data: {
                ...team,
                research_office_representative: {
                  user_id: "rep-1",
                  name: "Taylor Lee",
                  email: "taylor@example.test",
                  team_role: "research_office_representative",
                },
              },
            }),
          );
        }
        return assignedStudyFetch(input);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AssignedResearchFolders role="research-office" />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open research folder Coastal Resilience Study",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Research actors" }),
    );

    const representative = await screen.findByLabelText("Representative");
    fireEvent.change(representative, { target: { value: "rep-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/office/research/${research.id}/representative`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("reloads assigned folders when the active account changes", async () => {
    let requestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/monitoring/research");
      requestCount += 1;
      return new Response(
        JSON.stringify({
          data:
            requestCount === 1
              ? [
                  {
                    id: 101,
                    title: "Adviser A Study",
                    institute: "Institute of Computing",
                    researchers: ["Researcher A"],
                  },
                ]
              : [
                  {
                    id: 202,
                    title: "Adviser B Study",
                    institute: "Institute of Computing",
                    researchers: ["Researcher B"],
                  },
                ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <AssignedResearchFolders
        role="adviser"
        actorKey="adviser-a@example.test"
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Open research folder Adviser A Study",
      }),
    ).toBeInTheDocument();

    rerender(
      <AssignedResearchFolders
        role="adviser"
        actorKey="adviser-b@example.test"
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Open research folder Adviser B Study",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open research folder Adviser A Study",
      }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
