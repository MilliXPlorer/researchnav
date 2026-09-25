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
            { review_role: "research-office", name: "Rina Office" },
            {
              review_role: "panel",
              designation: "panel_chair",
              name: "Paolo Chair",
            },
            {
              review_role: "panel",
              designation: "panel_1",
              name: "Pia Panelist",
            },
            { review_role: "research_editor", name: "Eddie Editor" },
            { review_role: "statistician", name: "Noel Reyes" },
            { review_role: "librarian", name: "Libby Reyes" },
          ],
        },
      }),
    );
  }
  if (url === `/api/research/${research.id}/team?defense_type=proposal`) {
    return new Response(JSON.stringify({ data: {
      section_id: 2, research_document_id: research.id, defense_type: "proposal",
      instructor: { user_id: "i1", name: "Dr. Lina Cruz", email: "i@test", team_role: "instructor" },
      researchers: [], adviser: { user_id: "a1", name: "Prof. Mara Lim", email: "a@test", team_role: "adviser" },
      research_office_representative: { user_id: "o1", name: "Rina Office", email: "o@test", team_role: "research_office_representative" },
      chair: { user_id: "c1", name: "Paolo Chair", email: "c@test", team_role: "chair" },
      panel_members: [{ user_id: "p1", name: "Pia Panelist", email: "p@test", team_role: "panel_member" }],
      support_assignments: {
        editor: { user_id: "e1", name: "Eddie Editor", email: "e@test", assignment_role: "research_editor", status: "accepted" },
        statistician: { user_id: "s1", name: "Noel Reyes", email: "s@test", assignment_role: "statistician", status: "accepted" },
        librarian: { user_id: "l1", name: "Libby Reyes", email: "l@test", assignment_role: "librarian", status: "accepted" },
      }, pre_defense_ready: true, post_defense_ready: false, complete: false,
    } }));
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
    "uses the shared workspace for an assigned %s study",
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
        "Research Team",
        "Documents",
        "Defense Monitoring Forms",
      ]) {
        expect(screen.getByRole("button", { name: item })).toBeInTheDocument();
      }
      expect(
        screen.queryByRole("button", { name: "Feedback" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Assigned record")).toBeInTheDocument();
      expect(screen.queryByText("Read only")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: /edit research title|delete research project|manage assignments|remove|post feedback/i,
        }),
      ).not.toBeInTheDocument();
    },
  );

  it.each<Role>([
    "adviser",
    "instructor",
    "panel",
    "statistician",
    "research_editor",
    "librarian",
  ])("shows every assigned team role in the shared %s workspace", async (role) => {
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
    fireEvent.click(
      await screen.findByRole("button", { name: "Research Team" }),
    );

  for (const name of [
      "Dr. Lina Cruz",
      "Prof. Mara Lim",
      "Rina Office",
      "Paolo Chair",
      "Pia Panelist",
      "Eddie Editor",
      "Noel Reyes",
      "Libby Reyes",
    ]) {
      expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
    }
  });

  it.each<Role>(["statistician", "research_editor", "librarian"])(
    "lets %s accept a pending assignment before opening its folder",
    async (role) => {
      let accepted = false;
      const pendingResearch = {
        ...research,
        assignment_id: 81,
        assignment_status: "requested",
      };
      const fetchMock = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (url === "/api/monitoring/research") {
            return new Response(
              JSON.stringify({
                data: [
                  accepted
                    ? { ...pendingResearch, assignment_status: "accepted" }
                    : pendingResearch,
                ],
              }),
            );
          }
          if (url === "/api/support-assignments/81/respond") {
            expect(init?.method).toBe("PATCH");
            expect(JSON.parse(String(init?.body))).toEqual({ decision: "accept" });
            accepted = true;
            return new Response(
              JSON.stringify({
                data: { id: 81, status: "accepted" },
              }),
            );
          }
          throw new Error(`Unexpected request: ${url}`);
        },
      );
      vi.stubGlobal("fetch", fetchMock);

      render(<AssignedResearchFolders role={role} />);

      expect(
        await screen.findByText("Assignment request pending"),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Accept" }));

      await waitFor(() =>
        expect(
          screen.queryByText("Assignment request pending"),
        ).not.toBeInTheDocument(),
      );
      expect(fetchMock).not.toHaveBeenCalledWith(
        `/api/research/${research.id}`,
        expect.anything(),
      );
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

    const search = screen.getByLabelText("Search assigned studies");
    fireEvent.change(search, { target: { value: "coastal" } });

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
    expect(screen.getByLabelText("Search assigned studies")).toHaveValue(
      "coastal",
    );
  });

  it.each<Role>([
    "adviser",
    "panel",
    "statistician",
    "research_editor",
    "librarian",
  ])(
    "searches assigned studies by title and researcher for %s",
    async (role) => {
      const secondResearch = {
        ...research,
        id: 18,
        title: "Mountain Agriculture Study",
        institute: "Institute of Agriculture",
        research_stage: "final",
        researchers: ["Bea Flores"],
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          expect(String(input)).toBe("/api/monitoring/research");
          return new Response(
            JSON.stringify({ data: [research, secondResearch] }),
          );
        }),
      );

      render(<AssignedResearchFolders role={role} />);

      const search = await screen.findByLabelText("Search assigned studies");
      expect(search).toHaveAttribute(
        "placeholder",
        "Search assigned studies...",
      );
      fireEvent.change(search, { target: { value: "  mountain  " } });
      expect(
        screen.getByRole("button", {
          name: "Open research folder Mountain Agriculture Study",
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Open research folder Coastal Resilience Study",
        }),
      ).not.toBeInTheDocument();

      fireEvent.change(search, { target: { value: "ari santos" } });
      expect(
        screen.getByRole("button", {
          name: "Open research folder Coastal Resilience Study",
        }),
      ).toBeInTheDocument();

      fireEvent.change(search, { target: { value: "missing study" } });
      expect(
        screen.getByText("No assigned studies match your search."),
      ).toBeInTheDocument();

      fireEvent.change(search, { target: { value: "" } });
      expect(
        screen.getByRole("button", {
          name: "Open research folder Mountain Agriculture Study",
        }),
      ).toBeInTheDocument();
    },
  );

  it("combines Research Office search with stage and institute filters", async () => {
    const officeResearch = [
      research,
      {
        ...research,
        id: 18,
        title: "Coastal Farming Study",
        institute: "Institute of Agriculture",
        research_stage: "final",
        researchers: ["Bea Flores"],
      },
      {
        ...research,
        id: 19,
        title: "Forest Systems Study",
        institute: "Institute of Science",
        research_stage: "final",
        researchers: ["Cara Yu"],
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: officeResearch }))),
    );

    render(<AssignedResearchFolders role="research-office" />);

    const search = await screen.findByLabelText("Search assigned studies");
    fireEvent.change(search, { target: { value: "coastal" } });
    fireEvent.change(screen.getByLabelText("Research stage filter"), {
      target: { value: "final" },
    });
    fireEvent.change(screen.getByLabelText("Institute filter"), {
      target: { value: "Institute of Agriculture" },
    });

    expect(
      screen.getByRole("button", {
        name: "Open research folder Coastal Farming Study",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open research folder Coastal Resilience Study",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open research folder Forest Systems Study",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByLabelText("Research stage filter")).toHaveValue("");
    expect(screen.getByLabelText("Institute filter")).toHaveValue("");
    expect(
      screen.getByRole("button", {
        name: "Open research folder Coastal Resilience Study",
      }),
    ).toBeInTheDocument();
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
      await screen.findByRole("button", { name: "Research Team" }),
    );

    const representative = await screen.findByRole("button", {
      name: "Representative",
    });
    fireEvent.click(representative);
    expect(representative).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("option", { name: /Taylor Lee/ }));
    expect(representative).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/office/research/${research.id}/representative`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Save assignment" }),
    ).toBeDisabled();
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
