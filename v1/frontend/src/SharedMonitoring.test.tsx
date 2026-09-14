import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SharedMonitoring from "./SharedMonitoring";

const monitoring = {
  research_document_id: 42,
  title: "Community access study",
  researchers: ["Ada Lovelace", "Grace Hopper"],
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
    ).toEqual(["/src/form_templates/monitoring-pre-defense.png"]);
  });
});
