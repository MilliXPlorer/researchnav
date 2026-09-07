import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResearchOfficeBulkImport from "./ResearchOfficeBulkImport";

afterEach(() => vi.unstubAllGlobals());

const extractedMetadata = {
  title: "Reviewed manuscript",
  researchers: ["Researcher One"],
  abstract: "A complete abstract.",
  keywords: ["research", "import"],
  year: 2026,
  final_binding_date: "December 2026",
};

describe("ResearchOfficeBulkImport", () => {
  it("labels the bulk-capable workflow for its current workspace", () => {
    render(<ResearchOfficeBulkImport contextLabel="System Administrator" />);

    expect(
      screen.getByRole("heading", { name: "Import Manuscript" }),
    ).toBeInTheDocument();
    expect(screen.getByText("System Administrator")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      "multiple",
    );
  });

  it("requires an institute and offers the approved institute choices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  file_name: "one.pdf",
                  file_size: 3,
                  mime_type: "application/pdf",
                  status: "ready",
                  missing_fields: [],
                  metadata: extractedMetadata,
                },
              ],
            }),
          ),
      ),
    );

    render(<ResearchOfficeBulkImport />);
    const input = document.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, {
      target: {
        files: [new File(["pdf"], "one.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract Metadata" }));

    expect(await screen.findByText("Missing information")).toBeInTheDocument();
    expect(
      screen.getByText("Institute", { selector: "span" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import Selected Manuscripts" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Unclassified" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Institute of Computer Studies" }),
    ).toBeInTheDocument();
  });

  it("imports ready manuscripts one at a time with their reviewed metadata", async () => {
    const imported: Array<{ name: string; metadata: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body as FormData;
        if (String(input).endsWith("/preview")) {
          const file = body.get("files[]") as File;
          return new Response(
            JSON.stringify({
              data: [
                {
                  file_name: file.name,
                  file_size: file.size,
                  mime_type: file.type,
                  status: "ready",
                  missing_fields: [],
                  metadata: extractedMetadata,
                },
              ],
            }),
          );
        }

        const file = body.get("file") as File;
        imported.push({
          name: file.name,
          metadata: body.get("metadata") as string,
        });
        return new Response(JSON.stringify({ data: { id: file.name } }), {
          status: 201,
        });
      }),
    );

    render(<ResearchOfficeBulkImport />);
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input!, {
      target: {
        files: [
          new File(["first"], "first.pdf", { type: "application/pdf" }),
          new File(["second"], "second.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract Metadata" }));
    await screen.findAllByLabelText("Institute");

    for (const select of screen.getAllByLabelText("Institute")) {
      fireEvent.change(select, {
        target: { value: "Institute of Computer Studies" },
      });
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Import Selected Manuscripts" }),
    );

    await waitFor(() => expect(imported).toHaveLength(2));
    expect(imported.map((request) => request.name)).toEqual([
      "first.pdf",
      "second.pdf",
    ]);
    expect(JSON.parse(imported[0].metadata)).toMatchObject({
      ...extractedMetadata,
      institute: "Institute of Computer Studies",
    });
    expect(await screen.findAllByText("Imported")).toHaveLength(2);
  });
});
