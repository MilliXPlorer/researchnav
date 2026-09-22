import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DocxPreviewWorkspace from "./DocxPreviewWorkspace";

afterEach(() => vi.unstubAllGlobals());

describe("DocxPreviewWorkspace", () => {
  it("renders extracted DOCX paragraphs without annotation controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                schema_version: 1,
                research_document_id: 42,
                document_file_id: 10,
                document_file_version: 2,
                filename: "chapter.docx",
                mime_type:
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                paragraphs: [
                  {
                    index: 0,
                    text: "Read this paragraph in the app.",
                    truncated: false,
                  },
                ],
                truncated: false,
              },
            }),
          ),
      ),
    );

    render(
      <DocxPreviewWorkspace
        researchDocumentId={42}
        file={{
          id: 10,
          research_document_id: 42,
          document_type: "attachment",
          version_number: 2,
          original_filename: "chapter.docx",
          file_extension: "docx",
          mime_type:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          file_size: 100,
          is_current: true,
          uploaded_at: null,
        }}
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("Read this paragraph in the app."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Highlights and PDF page controls are not available/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Save annotation")).not.toBeInTheDocument();
  });
});
