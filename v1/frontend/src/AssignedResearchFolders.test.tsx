import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssignedResearchFolders from "./AssignedResearchFolders";
import type { Role } from "./types";

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

  it("uses the Instructor workspace navigation for an assigned study", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/monitoring/research") {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 17,
                  title: "Coastal Resilience Study",
                  institute: "Institute of Science",
                  researchers: ["Ari Santos"],
                },
              ],
            }),
          );
        }
        if (url === "/api/research/17/files") {
          return new Response(JSON.stringify({ data: [] }));
        }
        if (url === "/api/research/17/people") {
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
        if (url === "/api/research/17") {
          return new Response(
            JSON.stringify({
              data: {
                id: 17,
                title: "Coastal Resilience Study",
                abstract: "A study of coastal community resilience.",
                institute: "Institute of Science",
                degree_program: "Environmental Science",
                research_stage: "proposal",
                submission_status: "approved",
                authors: [{ id: 4, author_name: "Ari Santos" }],
              },
            }),
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<AssignedResearchFolders role="adviser" />);

    expect(
      screen.queryByRole("navigation", {
        name: "Research study workspace",
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Open research folder Coastal Resilience Study",
      }),
    );
    expect(
      await screen.findByRole("navigation", {
        name: "Research study workspace",
      }),
    ).toBeInTheDocument();
    for (const tab of [
      "Overview",
      "Research actors",
      "Documents",
      "Feedback",
      "Defense Monitoring Forms",
    ]) {
      expect(screen.getByRole("button", { name: tab })).toBeInTheDocument();
    }
    expect(screen.getByText("Read-only record")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add|edit|upload|delete|submit/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Research actors" }));
    expect(screen.getByText("Dr. Lina Cruz")).toBeInTheDocument();
    expect(screen.getByText("Prof. Mara Lim")).toBeInTheDocument();
    expect(screen.getByText("Noel Reyes")).toBeInTheDocument();
  });

  it("expands Defense Monitoring Forms into Proposal and Final Defense", async () => {
    const research = {
      id: 17,
      title: "Coastal Resilience Study",
      institute: "Institute of Science",
      degree_program: "Environmental Science",
      research_stage: "proposal",
      submission_status: "approved",
      researchers: ["Ari Santos"],
      authors: [{ id: 4, author_name: "Ari Santos" }],
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (
        path.startsWith("/api/research?") ||
        path === "/api/monitoring/research"
      ) {
        return new Response(JSON.stringify({ data: [research] }));
      }
      if (path === `/api/research/${research.id}`) {
        return new Response(JSON.stringify({ data: research }));
      }
      if (path.includes("/files") || path.includes("/people")) {
        return new Response(JSON.stringify({ data: [] }));
      }
      return new Response(JSON.stringify({ data: research }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssignedResearchFolders role="panel" />);

    fireEvent.click(await screen.findByText(research.title));
    const parent = await screen.findByRole("button", {
      name: "Defense Monitoring Forms",
    });
    expect(parent).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(parent);
    expect(parent).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Proposal Defense" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Final Defense" }),
    ).toBeInTheDocument();
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
