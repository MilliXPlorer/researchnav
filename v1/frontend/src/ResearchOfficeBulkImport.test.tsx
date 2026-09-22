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
      screen.getByRole("heading", { name: "Upload Manuscript" }),
    ).toBeInTheDocument();
    expect(screen.getByText("System Administrator")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toHaveAttribute(
      "multiple",
    );
    expect(document.querySelector("input[webkitdirectory]")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Select files" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Select folder" }),
    ).toBeInTheDocument();
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
      screen.getByRole("button", { name: "Upload Selected Manuscripts" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Unclassified" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Institute of Computer Studies" }),
    ).toBeInTheDocument();
  });

  it("allows missing metadata to be corrected before the edit control is used", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  file_name: "missing-title.pdf",
                  file_size: 3,
                  mime_type: "application/pdf",
                  status: "needs_review",
                  missing_fields: ["title"],
                  metadata: {
                    ...extractedMetadata,
                    title: "",
                    institute: "Institute of Computer Studies",
                  },
                },
              ],
            }),
          ),
      ),
    );

    render(<ResearchOfficeBulkImport />);
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: [
          new File(["pdf"], "missing-title.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract Metadata" }));

    const title = await screen.findByLabelText("Research Title");
    expect(title).toBeEnabled();
    fireEvent.change(title, { target: { value: "Corrected research title" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save metadata for missing-title.pdf",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Upload Selected Manuscripts" }),
      ).toBeEnabled(),
    );
  });

  it("shows study-based extraction progress and closes it when complete", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    render(<ResearchOfficeBulkImport />);
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: [new File(["pdf"], "one.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract Metadata" }));

    expect(
      screen.getByRole("dialog", { name: "Extracting manuscript metadata" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 of 1 studies")).toBeInTheDocument();
    finish(new Response(JSON.stringify({ data: [] })));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Extracting manuscript metadata",
        }),
      ).not.toBeInTheDocument(),
    );
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
                  metadata: {
                    ...extractedMetadata,
                    keywords: ["research", "import", " Research "],
                    institute: "Institute of Computer Studies",
                  },
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
    fireEvent.click(
      screen.getAllByRole("checkbox", { name: /Quality Education/i })[0],
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Upload Selected Manuscripts" }),
    );

    await waitFor(() => expect(imported).toHaveLength(2));
    expect(imported.map((request) => request.name)).toEqual([
      "first.pdf",
      "second.pdf",
    ]);
    expect(JSON.parse(imported[0].metadata)).toMatchObject({
      ...extractedMetadata,
      institute: "Institute of Computer Studies",
      sdg_ids: [4],
    });
    await waitFor(() =>
      expect(screen.queryByText("Selected files")).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Uploaded")).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Manuscript upload results" }),
    ).toHaveTextContent("2 uploaded · 0 not uploaded");
  });

  it("previews a folder from its ordered front file and uploads the whole folder once", async () => {
    const requests: FormData[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body as FormData;
        if (String(input).endsWith("/preview")) {
          expect((body.get("files[]") as File).name).toBe(
            "Cover&Table_of_Contents.pdf",
          );
          expect(
            (body.getAll("files[]") as File[]).map((file) => file.name),
          ).toEqual(["Cover&Table_of_Contents.pdf", "Manuscript.pdf"]);
          return new Response(
            JSON.stringify({
              data: [
                {
                  file_name: "Front.pdf",
                  file_size: 5,
                  mime_type: "application/pdf",
                  status: "ready",
                  missing_fields: [],
                  metadata: {
                    ...extractedMetadata,
                    institute: "Institute of Computer Studies",
                  },
                },
              ],
            }),
          );
        }
        requests.push(body);
        return new Response(JSON.stringify({ data: { id: 1 } }), {
          status: 201,
        });
      }),
    );
    const front = new File(["front"], "Cover&Table_of_Contents.pdf", {
      type: "application/pdf",
    });
    const manuscript = new File(["body"], "Manuscript.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(front, "webkitRelativePath", {
      value: "Batch/Study A/Cover&Table_of_Contents.pdf",
    });
    Object.defineProperty(manuscript, "webkitRelativePath", {
      value: "Batch/Study A/Manuscript.pdf",
    });

    render(<ResearchOfficeBulkImport />);
    fireEvent.change(document.querySelector("input[webkitdirectory]")!, {
      target: { files: [manuscript, front] },
    });
    expect(screen.getByText("1 study, 2 files selected")).toBeInTheDocument();
    expect(screen.getByText("Study A")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Extract Metadata" }));
    await screen.findByLabelText("Institute");
    expect(
      screen.getByRole("heading", { name: "Study A" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Upload Selected Manuscripts" }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(
      (requests[0].getAll("files[]") as File[]).map((file) => file.name),
    ).toEqual(["Cover&Table_of_Contents.pdf", "Manuscript.pdf"]);
    expect(requests[0].getAll("relative_paths[]")).toEqual([
      "Batch/Study A/Cover&Table_of_Contents.pdf",
      "Batch/Study A/Manuscript.pdf",
    ]);
  });

  it("orders source-code attachments after the manuscript used for metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const files = (init?.body as FormData).getAll("files[]") as File[];
        expect(files.map((file) => file.name)).toEqual([
          "Mental Health Manuscript.pdf",
          "Appendix H SOURCE CODE.pdf",
        ]);
        return new Response(JSON.stringify({ data: [] }));
      }),
    );
    const source = new File(["source"], "Appendix H SOURCE CODE.pdf", {
      type: "application/pdf",
    });
    const manuscript = new File(["study"], "Mental Health Manuscript.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(source, "webkitRelativePath", {
      value: "Batch/Mental Health/Appendix H SOURCE CODE.pdf",
    });
    Object.defineProperty(manuscript, "webkitRelativePath", {
      value: "Batch/Mental Health/Mental Health Manuscript.pdf",
    });

    render(<ResearchOfficeBulkImport />);
    fireEvent.change(document.querySelector("input[webkitdirectory]")!, {
      target: { files: [source, manuscript] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract Metadata" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });

  it("treats year-folder PDFs as separate studies and nested files as one study", () => {
    const first = new File(["first"], "Study-One.pdf", {
      type: "application/pdf",
    });
    const second = new File(["second"], "Study-Two.pdf", {
      type: "application/pdf",
    });
    const front = new File(["front"], "Front.pdf", { type: "application/pdf" });
    const manuscript = new File(["body"], "Manuscript.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(first, "webkitRelativePath", {
      value: "2025/Study-One.pdf",
    });
    Object.defineProperty(second, "webkitRelativePath", {
      value: "2025/Study-Two.pdf",
    });
    Object.defineProperty(front, "webkitRelativePath", {
      value: "2025/Folder Study/Front.pdf",
    });
    Object.defineProperty(manuscript, "webkitRelativePath", {
      value: "2025/Folder Study/Manuscript.pdf",
    });

    render(<ResearchOfficeBulkImport />);
    fireEvent.change(document.querySelector("input[webkitdirectory]")!, {
      target: { files: [first, second, manuscript, front] },
    });

    expect(screen.getByText("3 studies, 4 files selected")).toBeInTheDocument();
  });

  it("reads the complete folder before reporting unsupported files", () => {
    const pdf = new File(["pdf"], "Study.pdf", { type: "application/pdf" });
    const note = new File(["note"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(pdf, "webkitRelativePath", {
      value: "2025/Study.pdf",
    });
    Object.defineProperty(note, "webkitRelativePath", {
      value: "2025/notes.txt",
    });

    render(<ResearchOfficeBulkImport />);
    const folderInput = document.querySelector("input[webkitdirectory]")!;
    expect(folderInput).not.toHaveAttribute("accept");
    fireEvent.change(folderInput, { target: { files: [pdf, note] } });

    expect(screen.getByText("1 study, 1 file selected")).toBeInTheDocument();
    expect(
      screen.getByText("1 unsupported file was skipped:"),
    ).toBeInTheDocument();
    expect(screen.getByText("2025/notes.txt")).toBeInTheDocument();
  });

  it("does not limit a selected year folder to twenty studies", () => {
    const studies = Array.from({ length: 25 }, (_, index) => {
      const file = new File([String(index)], `Study-${index + 1}.pdf`, {
        type: "application/pdf",
      });
      Object.defineProperty(file, "webkitRelativePath", {
        value: `2025/Study-${index + 1}.pdf`,
      });
      return file;
    });

    render(<ResearchOfficeBulkImport />);
    fireEvent.change(document.querySelector("input[webkitdirectory]")!, {
      target: { files: studies },
    });

    expect(
      screen.getByText("25 studies, 25 files selected"),
    ).toBeInTheDocument();
  });

  it("groups each immediate child folder as one study", () => {
    const standalone = Array.from({ length: 4 }, (_, index) => {
      const file = new File([String(index)], `Study-${index + 1}.pdf`, {
        type: "application/pdf",
      });
      Object.defineProperty(file, "webkitRelativePath", {
        value: `CRIM/2025/Study-${index + 1}.pdf`,
      });
      return file;
    });
    const cover = new File(["cover"], "Cover.pdf", { type: "application/pdf" });
    const manuscript = new File(["body"], "Manuscript.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(cover, "webkitRelativePath", {
      value: "CRIM/2025/Folder Study/Cover.pdf",
    });
    Object.defineProperty(manuscript, "webkitRelativePath", {
      value: "CRIM/2025/Folder Study/Manuscript.pdf",
    });

    render(<ResearchOfficeBulkImport />);
    fireEvent.change(document.querySelector("input[webkitdirectory]")!, {
      target: { files: [...standalone, cover, manuscript] },
    });

    expect(screen.getByText("1 study, 6 files selected")).toBeInTheDocument();
  });

  it("keeps a folder as one visible result when metadata extraction fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ message: "Unreadable front matter." }),
            { status: 422 },
          ),
      ),
    );
    const cover = new File(["cover"], "Cover.pdf", { type: "application/pdf" });
    const manuscript = new File(["body"], "Manuscript.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(cover, "webkitRelativePath", {
      value: "2025/Folder Study/Cover.pdf",
    });
    Object.defineProperty(manuscript, "webkitRelativePath", {
      value: "2025/Folder Study/Manuscript.pdf",
    });

    render(<ResearchOfficeBulkImport />);
    fireEvent.change(document.querySelector("input[webkitdirectory]")!, {
      target: { files: [cover, manuscript] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract Metadata" }));

    expect(
      await screen.findByRole("heading", { name: "Folder Study" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByText("Unreadable front matter.")).toBeInTheDocument();
  });
});
