import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  archive_status: "not_archived",
  visibility: "private",
  publication_year: 2026,
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
    return new Response(
      JSON.stringify({
        data: {
          section_id: 2,
          research_document_id: research.id,
          defense_type: "proposal",
          instructor: {
            user_id: "i1",
            name: "Dr. Lina Cruz",
            email: "i@test",
            team_role: "instructor",
          },
          researchers: [],
          adviser: {
            user_id: "a1",
            name: "Prof. Mara Lim",
            email: "a@test",
            team_role: "adviser",
          },
          research_office_representative: {
            user_id: "o1",
            name: "Rina Office",
            email: "o@test",
            team_role: "research_office_representative",
          },
          chair: {
            user_id: "c1",
            name: "Paolo Chair",
            email: "c@test",
            team_role: "chair",
          },
          panel_members: [
            {
              user_id: "p1",
              name: "Pia Panelist",
              email: "p@test",
              team_role: "panel_member",
            },
          ],
          support_assignments: {
            editor: {
              user_id: "e1",
              name: "Eddie Editor",
              email: "e@test",
              assignment_role: "research_editor",
              status: "accepted",
            },
            statistician: {
              user_id: "s1",
              name: "Noel Reyes",
              email: "s@test",
              assignment_role: "statistician",
              status: "accepted",
            },
            librarian: {
              user_id: "l1",
              name: "Libby Reyes",
              email: "l@test",
              assignment_role: "librarian",
              status: "accepted",
            },
          },
          pre_defense_ready: true,
          post_defense_ready: false,
          complete: false,
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
  ])(
    "shows every assigned team role in the shared %s workspace",
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
      fireEvent.click(
        await screen.findByRole("button", { name: "Research Team" }),
      );
      fireEvent.click(
        await screen.findByRole("tab", { name: "After defense" }),
      );

      for (const name of [
        "Dr. Lina Cruz",
        "Prof. Mara Lim",
        "Rina Office",
        "Paolo Chair",
        "Pia Panelist",
      ]) {
        expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
      }
    },
  );

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
            expect(JSON.parse(String(init?.body))).toEqual({
              decision: "accept",
            });
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
        await screen.findByText("Assignment request pending · Ari Santos"),
      ).toBeInTheDocument();
      const accept = screen.getByRole("button", { name: "Accept" });
      const decline = screen.getByRole("button", { name: "Decline" });
      expect(accept).toHaveClass(
        "support-assignment-action",
        "support-assignment-accept",
      );
      expect(decline).toHaveClass(
        "support-assignment-action",
        "support-assignment-decline",
      );
      expect(accept.parentElement).toHaveClass("support-assignment-actions");
      fireEvent.click(accept);

      await waitFor(() =>
        expect(
          screen.queryByText("Assignment request pending · Ari Santos"),
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
    let finishSave!: (response: Response) => void;
    let failSave = true;
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
          if (failSave) {
            return new Promise<Response>((resolve) => {
              finishSave = resolve;
            });
          }
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

    const view = render(<AssignedResearchFolders role="research-office" />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open research folder Coastal Resilience Study",
      }),
    );
    const workspace = await screen.findByTestId("study-workspace");
    await waitFor(() =>
      expect(
        workspace.querySelector(".project-overview-stats"),
      ).toHaveTextContent("Researchers1Documents0Folders7"),
    );
    expect(
      workspace.querySelectorAll(".project-overview-stats > div"),
    ).toHaveLength(3);
    expect(screen.queryByText("Document folders")).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Research Team" }),
    );

    const representative = await screen.findByRole("button", {
      name: "Representative",
    });
    expect(
      screen.getByRole("button", { name: "Save assignment" }),
    ).toBeDisabled();
    expect(
      screen.queryByText("People assigned to this study"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Student researcher")).toBeInTheDocument();
    fireEvent.click(representative);
    expect(representative).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("option", { name: /Taylor Lee/ }));
    expect(representative).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Save assignment" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(representative).toBeDisabled();
    finishSave(
      new Response(JSON.stringify({ message: "Assignment unavailable" }), {
        status: 422,
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "assignment could not be saved. Please try again.",
    );
    expect(representative).toHaveTextContent("Taylor Lee");
    failSave = false;
    fireEvent.click(screen.getByRole("button", { name: "Save assignment" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Research Representative assignment saved.",
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/office/research/${research.id}/representative`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Save assignment" }),
    ).toBeDisabled();
    // Simulate the saved assignment returned by the existing team endpoint on reload.
    const savedRepresentative = {
      user_id: "rep-1",
      name: "Taylor Lee",
      email: "taylor@example.test",
      team_role: "research_office_representative",
    };
    Object.assign(team, {
      research_office_representative: savedRepresentative,
    });
    view.unmount();
    render(
      <AssignedResearchFolders
        role="research-office"
        initialResearchDocumentId={research.id}
        destination={{ tab: "team" }}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Representative" }),
    ).toHaveTextContent("Taylor Lee");
    expect(
      screen.getByRole("button", { name: "Save assignment" }),
    ).toBeDisabled();
  });

  it("confirms the header review action, supports cancel and Escape, and waits for the backend", async () => {
    let finishTransition!: (response: Response) => void;
    const submittedResearch = {
      ...research,
      submission_status: "submitted",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/research/${research.id}`) {
          return new Response(JSON.stringify({ data: submittedResearch }));
        }
        if (url === `/api/research/${research.id}/status`) {
          expect(init?.method).toBe("PATCH");
          expect(init?.body).toBe(
            JSON.stringify({ submission_status: "under_review" }),
          );
          return new Promise<Response>((resolve) => {
            finishTransition = resolve;
          });
        }
        return assignedStudyFetch(input);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AssignedResearchFolders
        role="research-office"
        initialResearchDocumentId={research.id}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Research workspace" }),
    ).toBeInTheDocument();
    const overview = screen
      .getByTestId("study-workspace")
      .querySelector(".project-overview-grid")!;
    expect(
      within(overview as HTMLElement)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual(["Research workspace", "Study members", "Latest documents"]);
    expect(
      screen.queryByRole("heading", { name: "Research status" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Research details")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive status")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", {
      name: "Move to Under Review",
    });
    expect(trigger).toHaveAttribute("title", "Move to Under Review");
    expect(trigger.querySelector("svg")).toHaveClass("lucide-clock3");
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/status"),
      ),
    ).toHaveLength(0);
    expect(screen.getByText("Submitted")).toBeVisible();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Move to Under Review?",
    });
    expect(
      within(dialog).getByRole("heading", {
        name: "Move to Under Review?",
      }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(
      within(dialog).getByText(
        "Are you sure you want to change this research status from Submitted to Under Review?",
      ),
    ).toBeVisible();
    const working = within(dialog).getByRole("button", { name: "Working…" });
    expect(working).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    expect(trigger).toBeDisabled();
    fireEvent.click(working);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeVisible();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/status"),
      ),
    ).toHaveLength(1);
    finishTransition(
      new Response(
        JSON.stringify({
          data: { ...submittedResearch, submission_status: "under_review" },
        }),
      ),
    );

    expect(
      await screen.findByText("Research moved to under review."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Under Review").length).toBeGreaterThan(0);
    expect(screen.getByText("Under Review")).toHaveClass("is-under-review");
    expect(
      screen.queryByRole("button", { name: "Move to Under Review" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve research" }),
    ).toBeInTheDocument();
  });

  it("archives with the selected visibility and refreshes surrounding research state", async () => {
    const onResearchChanged = vi.fn();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `/api/research/${research.id}`) {
          return new Response(JSON.stringify({ data: research }));
        }
        if (url === `/api/research/${research.id}/archive`) {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBe(JSON.stringify({ visibility: "public" }));
          return new Response(
            JSON.stringify({
              data: {
                ...research,
                submission_status: "archived",
                archive_status: "archived",
                visibility: "public",
              },
            }),
          );
        }
        return assignedStudyFetch(input);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AssignedResearchFolders
        role="research-office"
        initialResearchDocumentId={research.id}
        onResearchChanged={onResearchChanged}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Archive research" }),
    );
    fireEvent.change(screen.getByLabelText("Archive visibility"), {
      target: { value: "public" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Archive research",
      }),
    );

    expect(await screen.findByText("Research archived.")).toBeInTheDocument();
    expect(screen.getAllByText("Archived").length).toBeGreaterThan(0);
    expect(onResearchChanged).toHaveBeenCalledTimes(1);
  });

  it("closes the confirmation and exposes a workflow error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `/api/research/${research.id}`) {
          return new Response(
            JSON.stringify({
              data: { ...research, submission_status: "submitted" },
            }),
          );
        }
        if (url === `/api/research/${research.id}/status`) {
          return new Response(JSON.stringify({ error: "INVALID_TRANSITION" }), {
            status: 422,
          });
        }
        return assignedStudyFetch(input);
      }),
    );

    render(
      <AssignedResearchFolders
        role="research-office"
        initialResearchDocumentId={research.id}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Move to Under Review" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Confirm",
      }),
    );

    expect(
      await screen.findByRole("alert", {
        name: "",
      }),
    ).toHaveTextContent("The research status could not be updated");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Move to Under Review" }),
    ).toBeEnabled();
  });

  it("returns a direct Research Office deep link to Assigned Research", async () => {
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => assignedStudyFetch(input)),
    );

    render(
      <AssignedResearchFolders
        role="research-office"
        initialResearchDocumentId={research.id}
        navigate={navigate}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Back to Assigned Research" }),
    );

    expect(navigate).toHaveBeenCalledWith(
      "/app/research-office/assigned-research",
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
