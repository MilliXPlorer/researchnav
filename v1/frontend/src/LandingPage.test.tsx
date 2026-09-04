import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage";
import type { ResearchRecord } from "./types";

const record: ResearchRecord = {
  id: "1",
  title: "A public study",
  authors: "Example Author",
  year: 2026,
  institutionName: "Example College",
  academicUnit: "Institute of Computer Studies",
  degreeProgram: "Bachelor of Science in Computer Science",
  institute: "Institute of Computer Studies",
  program: "Bachelor of Science in Computer Science",
  category: "Information Systems",
  abstract: "An example abstract.",
  keywords: ["repository"],
  researchStage: "Completed",
};

describe("LandingPage", () => {
  it("opens an exact catalog year as a range", () => {
    const navigate = vi.fn();
    render(
      <LandingPage
        onSignIn={vi.fn()}
        session={null}
        onSessionChange={vi.fn()}
        onLogout={vi.fn()}
        navigate={navigate}
        records={[record]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Browse by year"), {
      target: { value: "2026" },
    });

    expect(navigate).toHaveBeenCalledWith(
      "/catalog?year_from=2026&year_to=2026",
    );
  });

  it("counts only distinct, identified programs in repository statistics", () => {
    render(
      <LandingPage
        onSignIn={vi.fn()}
        session={null}
        onSessionChange={vi.fn()}
        onLogout={vi.fn()}
        navigate={vi.fn()}
        records={[
          record,
          {
            ...record,
            id: "2",
            degreeProgram: "Bachelor of Science in Information Technology",
            program: "Bachelor of Science in Information Technology",
          },
          { ...record, id: "3", degreeProgram: "", program: "" },
        ]}
      />,
    );

    const statistics = within(screen.getByLabelText("Repository statistics"));
    expect(statistics.getByText("2")).toBeInTheDocument();
    expect(
      statistics.getByText("academic programs represented"),
    ).toBeInTheDocument();
  });
});
