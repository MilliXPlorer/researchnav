import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage";
import type { ResearchRecord } from "./types";

const record: ResearchRecord = {
  id: "1",
  title: "A public study",
  authors: "Example Author",
  year: 2026,
  institutionName: "Example College",
  degreeProgram: "Bachelor of Science in Computer Science",
  institute: "Institute of Computer Studies",
  program: "Bachelor of Science in Computer Science",
  category: "Information Systems",
  abstract: "An example abstract.",
  keywords: ["repository"],
  researchStage: "Completed",
};

describe("LandingPage", () => {
  it("activates the About, Contact, and Data privacy footer controls", () => {
    render(
      <LandingPage
        onSignIn={vi.fn()}
        session={null}
        onSessionChange={vi.fn()}
        onLogout={vi.fn()}
        navigate={vi.fn()}
        records={[]}
      />,
    );

    const aboutTrigger = screen.getByRole("button", { name: "About" });
    aboutTrigger.focus();
    fireEvent.click(aboutTrigger);
    const aboutDialog = screen.getByRole("dialog", {
      name: "About ResearchNAV",
    });
    expect(
      within(aboutDialog).getByRole("heading", {
        name: "Built for better research management",
      }),
    ).toBeInTheDocument();
    expect(
      within(aboutDialog).getByText(
        "Organizing research. Connecting knowledge.",
      ),
    ).toBeInTheDocument();
    expect(
      within(aboutDialog).getByText(
        /do not independently determine plagiarism/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(aboutDialog).getByText(
        /brings institutional research into one centralized platform/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(aboutDialog).getByRole("heading", {
        name: "Similarity technology",
      }),
    ).toBeInTheDocument();
    expect(
      within(aboutDialog).getByLabelText("Similarity technologies"),
    ).toHaveTextContent("TF-IDF Cosine Similarity FastText");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    fireEvent.click(
      within(aboutDialog).getByRole("button", {
        name: "Close About ResearchNAV",
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "About ResearchNAV" }),
    ).not.toBeInTheDocument();
    expect(aboutTrigger).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Data privacy" }));
    expect(window.location.hash).toBe("#privacy");
    expect(
      screen.getByRole("dialog", { name: "Terms and Data Privacy" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1. Purpose of the system")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(window.location.hash).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Contact" }));
    expect(
      screen.getByRole("dialog", { name: "Contact Research Office" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "researchnavph@gmail.com" }),
    ).toHaveAttribute("href", "mailto:researchnavph@gmail.com");
  });

  it("closes the About modal with Escape and restores its trigger", async () => {
    render(
      <LandingPage
        onSignIn={vi.fn()}
        session={null}
        onSessionChange={vi.fn()}
        onLogout={vi.fn()}
        navigate={vi.fn()}
        records={[]}
      />,
    );

    const trigger = screen.getByRole("button", { name: "About" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "About ResearchNAV" });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "About ResearchNAV" }),
      ).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it("opens the selected study metadata without navigating to search", async () => {
    const navigate = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                id: 1,
                title: record.title,
                authors: [{ author_name: "Example Author" }],
                publication_year: 2026,
                institution_name: record.institutionName,
                institute: record.institute,
                degree_program: record.program,
                category: { name: record.category },
                abstract: record.abstract,
                keywords: record.keywords,
                research_stage: "completed",
                has_downloadable_manuscript: true,
                sdgs: [],
              },
            }),
          ),
      ),
    );
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

    fireEvent.click(screen.getByRole("button", { name: /View metadata/ }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: record.title }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/repository/1",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "View files" }));
    expect(
      screen.getByRole("dialog", { name: "Sign In Required" }),
    ).toBeInTheDocument();
  });

  it("shows public records by Study ID ascending", () => {
    render(
      <LandingPage
        onSignIn={vi.fn()}
        session={null}
        onSessionChange={vi.fn()}
        onLogout={vi.fn()}
        navigate={vi.fn()}
        records={[
          { ...record, id: "12", title: "Twelfth study" },
          { ...record, id: "3", title: "Third study" },
          { ...record, id: "8", title: "Eighth study" },
          { ...record, id: "1", title: "First study" },
        ]}
      />,
    );

    const cards = screen.getAllByRole("article");
    expect(within(cards[0]).getByText("First study")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Third study")).toBeInTheDocument();
    expect(within(cards[2]).getByText("Eighth study")).toBeInTheDocument();
    expect(screen.queryByText("Twelfth study")).not.toBeInTheDocument();
  });

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

  it("shows the configured institute total in repository statistics", () => {
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
            institute: "Institute of Teacher Education",
            degreeProgram: "Bachelor of Science in Information Technology",
            program: "Bachelor of Science in Information Technology",
          },
          {
            ...record,
            id: "3",
            institute: "",
            degreeProgram: "",
            program: "",
          },
        ]}
      />,
    );

    const statistics = within(screen.getByLabelText("Repository statistics"));
    expect(statistics.getByText("6")).toBeInTheDocument();
    expect(statistics.getByText("institutes represented")).toBeInTheDocument();
  });
});
