import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SharedMonitoring from "./SharedMonitoring";

const monitoring = {
  research_document_id: 42,
  title: "Community access study",
  researchers: ["Ada Lovelace", "Grace Hopper"],
  editable_stages: [
    "before_proposal_defense",
    "after_proposal_defense",
    "before_final_defense",
    "after_final_defense",
  ],
  stages: {
    before_proposal_defense: {
      sections: [
        { designation: "Adviser", entry: null },
        { designation: "Statistician", entry: null },
      ],
      verified_by: null,
      verified_at: null,
    },
    after_proposal_defense: {
      sections: [
        {
          designation: "Panel 1",
          assigned_actor_name: "Assigned Panelist",
          entry: null,
          entries: [
            {
              id: 10,
              activity_date: "2026-09-13",
              saved_at: "2026-09-13 14:25:36",
              activity: "Proposal review",
              remarks: "Revise chapter one",
              status: "completed",
              signature_status: "signed",
              signature_url: "/signature/10",
              verified_by: null,
              verified_at: null,
              is_owned: true,
            },
            {
              id: 11,
              activity_date: "2026-09-14",
              activity: "Revision review",
              remarks: "Accepted",
              status: "completed",
              signature_status: "signed",
              signature_url: "/signature/11",
              verified_by: null,
              verified_at: null,
              is_owned: true,
            },
          ],
        },
      ],
      verified_by: null,
      verified_at: null,
    },
    before_final_defense: {
      sections: [
        {
          designation: "Adviser",
          entry: null,
          entries: [],
        },
      ],
      verified_by: null,
      verified_at: null,
    },
    after_final_defense: {
      sections: [
        {
          designation: "Panel 1",
          entry: {
            id: 12,
            activity_date: "2026-09-15",
            activity: "Final manuscript approved",
            remarks: "Ready for binding",
            status: "completed",
            signature_status: "signed",
            signature_url: "/signature/12",
            verified_by: null,
            verified_at: null,
            is_owned: true,
          },
          entries: [
            {
              id: 12,
              activity_date: "2026-09-15",
              activity: "Final manuscript approved",
              remarks: "Ready for binding",
              status: "completed",
              signature_status: "signed",
              signature_url: "/signature/12",
              verified_by: null,
              verified_at: null,
              is_owned: true,
            },
          ],
        },
      ],
      verified_by: null,
      verified_at: null,
    },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("shared monitoring", () => {
  it("uses plain-language headings and lets an assigned panelist sign", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/monitoring/research") {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 42,
                title: monitoring.title,
                research_stage: "ongoing",
                researchers: monitoring.researchers,
              },
            ],
          }),
        );
      }
      return new Response(JSON.stringify({ data: monitoring }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SharedMonitoring role="panel" />);

    expect(await screen.findAllByText("Panel 1")).toHaveLength(2);
    expect(screen.getAllByText("Proposal review")).toHaveLength(3);
    expect(screen.getAllByText("Revision review")).toHaveLength(3);
    expect(screen.getAllByText("Assigned Panelist")).toHaveLength(2);
    expect(screen.getAllByText("2026-09-13 14:25:36")).toHaveLength(3);
    expect(screen.queryByText("Research actor")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Print defense monitoring form" }),
    ).toHaveTextContent("");
    expect(
      screen.getByRole("button", { name: "Add new defense monitoring entry" }),
    ).toHaveTextContent("");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove defense monitoring entry" }),
    );
    expect(
      screen.getByRole("heading", { name: "Remove defense monitoring entry" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Entry to remove")).toHaveValue("11");
    fireEvent.click(
      screen.getByRole("button", { name: "Update my latest entry" }),
    );
    expect(
      screen.getByRole("button", { name: "Save and sign" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Draw your signature")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload signature image")).toHaveAttribute(
      "accept",
      "image/png,image/jpeg",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add new defense monitoring entry" }),
    );
    expect(
      screen.getByRole("heading", { name: "Add defense monitoring activity" }),
    ).toBeInTheDocument();
  });

  it("prints the currently selected defense monitoring form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: monitoring }))),
    );
    const print = vi.fn();
    vi.stubGlobal("print", print);

    render(
      <SharedMonitoring role="instructor" researchDocumentId={42} embedded />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Print defense monitoring form",
      }),
    );
    expect(print).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getAllByText("Community access study")).toHaveLength(3),
    );
    const printPages = document.querySelector(".monitoring-print-pages");
    expect(
      printPages?.querySelectorAll(".official-monitoring-sheet"),
    ).toHaveLength(1);
    expect(
      Array.from(printPages?.querySelectorAll("img") ?? []).map((image) =>
        image.getAttribute("src"),
      ),
    ).toEqual([
      "/src/form_templates/monitoring-before-proposal-1.png",
    ]);
  });

  it("does not expose mutations in a read-only monitoring workspace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: monitoring }))),
    );

    render(
      <SharedMonitoring
        role="instructor"
        researchDocumentId={42}
        embedded
        readOnly
      />,
    );

    await screen.findByRole("tab", { name: "Before Proposal Defense" });
    expect(
      screen.queryByRole("button", { name: "Verify completed form" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Add new defense monitoring entry",
      }),
    ).not.toBeInTheDocument();
  });

  it("switches between Proposal and Final Defense while retaining Before and After tabs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: monitoring }))),
    );

    render(
      <SharedMonitoring role="instructor" researchDocumentId={42} embedded />,
    );

    expect(
      await screen.findByRole("button", { name: "Proposal Defense" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("tab", { name: "Before Proposal Defense" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "After Proposal Defense" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Adviser").length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("tab", { name: "After Proposal Defense" }),
    );
    expect(screen.getAllByText("Proposal review").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Final Defense" }));
    expect(
      screen.getByRole("tab", { name: "Before Final Defense" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "After Final Defense" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Adviser").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("tab", { name: "After Final Defense" }));
    const finalImages = Array.from(
      document.querySelectorAll(".official-monitoring-sheet img"),
    ).map((image) => image.getAttribute("src"));

    expect(finalImages).toContain(
      "/src/form_templates/monitoring-after-final-1.png",
    );
    expect(
      screen.getAllByText("Final manuscript approved").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("tab", { name: "After Proposal Defense" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Proposal Defense" }));
    expect(
      screen.getByRole("tab", { name: "Before Proposal Defense" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
