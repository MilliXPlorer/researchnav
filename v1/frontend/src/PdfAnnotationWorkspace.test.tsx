import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PdfAnnotationWorkspace from "./PdfAnnotationWorkspace";
import type { DocumentFileResource, PdfAnnotationResource } from "./api";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  destroyDocument: vi.fn(async () => undefined),
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    listPdfAnnotations: mocks.list,
    createPdfAnnotation: mocks.create,
  };
});

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  TextLayer: class {
    render = vi.fn(async () => undefined);
    cancel = vi.fn();
  },
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      destroy: mocks.destroyDocument,
      getPage: async () => ({
        getViewport: () => ({ width: 600, height: 800 }),
        render: () => ({ cancel: vi.fn(), promise: Promise.resolve() }),
        getTextContent: async () => ({
          items: [{ str: "Selectable manuscript text" }],
          styles: {},
        }),
      }),
    }),
    destroy: mocks.destroyDocument,
  }),
}));

const file: DocumentFileResource = {
  id: 7,
  research_document_id: 42,
  document_type: "draft",
  upload_purpose: "initial_submission",
  version_number: 2,
  original_filename: "study.pdf",
  file_extension: "pdf",
  mime_type: "application/pdf",
  file_size: 100,
  is_current: true,
  uploaded_at: "2026-09-21T00:00:00Z",
};

const annotation: PdfAnnotationResource = {
  id: 9,
  research_document_id: 42,
  document_file_id: 7,
  document_file_version: 2,
  author_name: "Dr. Reviewer",
  author_role: "Research Adviser",
  kind: "comment",
  body: "Clarify this claim.",
  anchor: {
    schema_version: 1,
    page_number: 1,
    exact: "Selected paragraph",
    rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.04 }],
  },
  created_at: "2026-09-21T00:00:00Z",
};

describe("PdfAnnotationWorkspace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.list.mockReset();
    mocks.create.mockReset();
  });

  it("shows a consolidated exact-version view to researchers without creation controls", async () => {
    mocks.list.mockResolvedValue([annotation]);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]))),
    );

    render(
      <PdfAnnotationWorkspace
        researchDocumentId={42}
        file={file}
        canAnnotate={false}
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("complementary", {
        name: "Consolidated reviewer annotations",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Clarify this claim.")).toBeInTheDocument();
    expect(screen.getByText("Dr. Reviewer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Comment")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "study.pdf" }),
    ).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith(42, 7);
  });

  it("waits for a PDF selection", async () => {
    mocks.list.mockResolvedValue([]);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]))),
    );

    render(
      <PdfAnnotationWorkspace
        researchDocumentId={42}
        file={file}
        canAnnotate
        onClose={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("complementary", { name: "My annotations" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(/select a line or paragraph/i),
      ).toBeInTheDocument(),
    );
  });
});
