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
});
