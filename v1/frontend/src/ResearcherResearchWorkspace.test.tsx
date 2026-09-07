import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RoleWorkspace from "./RoleWorkspaces";

const research = {
  id: 42,
  submission_reference: "RN-2026-AB12CD34",
  submitted_by: "researcher@example.test",
  category_id: 2,
  title: "Revision-ready study",
  normalized_title: null,
  abstract: "An owned research record.",
  keywords: "research",
  publication_year: 2026,
  institution_name: null,
  institution_location: null,
  academic_unit: null,
  degree_program: null,
  manuscript_date_label: null,
  abstract_provenance: null,
  research_stage: "ongoing",
  submission_status: "revision_required",
  archive_status: "not_archived",
  visibility: "private",
  submitted_at: "2026-08-01T10:00:00.000Z",
  approved_at: null,
  archived_at: null,
  authors: [
    {
      id: 1,
      user_id: null,
      author_name: "Ada Lovelace",
      author_order: 1,
      is_corresponding_author: true,
    },
  ],
  category: {
    id: 2,
    name: "Education",
    slug: "education",
    description: null,
    is_active: true,
  },
};

const files = [
  {
    id: 10,
    research_document_id: 42,
    document_type: "revised_manuscript",
    version_number: 2,
    original_filename: "revision-v2.pdf",
    file_extension: "pdf",
    mime_type: "application/pdf",
    file_size: 1024,
    is_current: true,
    uploaded_at: "2026-08-02T10:00:01.000Z",
  },
  {
    id: 9,
    research_document_id: 42,
    document_type: "final_manuscript",
    version_number: 1,
    original_filename: "final.pdf",
    file_extension: "pdf",
    mime_type: "application/pdf",
    file_size: 2048,
    is_current: true,
    uploaded_at: "2026-08-01T10:00:00.000Z",
  },
];

function response(data: unknown) {
  return new Response(JSON.stringify({ data }));
}

function installApi(loadedFiles = files) {
  let currentResearch = research;
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/research/42") {
        if (init?.method === "PATCH") {
          currentResearch = {
            ...currentResearch,
            ...(JSON.parse(String(init.body)) as typeof research),
          };
        }
        return response(currentResearch);
      }
      if (path === "/api/research/42/files") {
        if (init?.method === "POST") return response(files[0]);
        return response(loadedFiles);
      }
      if (path === "/api/research/42/revisions") {
        return response([
          {
            id: 6,
            research_document_id: 42,
            requested_by: "adviser@example.test",
            document_file_id: 10,
            revision_number: 2,
            revision_remarks: "Address the methodology comments.",
            revision_status: "requested",
            requested_at: "2026-08-02T10:00:00.000Z",
            submitted_at: null,
            resolved_at: null,
          },
        ]);
      }
      if (path === "/api/research/42/validation") {
        if (init?.method === "POST") return response({});
        return response([
          {
            id: 4,
            research_document_id: 42,
            similarity_result_id: null,
            validated_by: "adviser@example.test",
            validation_status: "revision_required",
            adviser_remarks: "Clarify the title.",
            validated_at: null,
            created_at: "2026-08-02T10:00:00.000Z",
            updated_at: "2026-08-03T10:00:00.000Z",
          },
        ]);
      }
      if (path === "/api/research/42/people") {
        return response({
          section: {
            id: 3,
            name: "ICS 4A",
            academic_year: "2026-2027",
            instructor_name: "Ina Structor",
          },
          reviewers: [{ review_role: "adviser", name: "Ada Viser" }],
        });
      }
      if (
        path === "/api/research/42/feedback" ||
        path === "/api/research/42/monitoring"
      )
        return response([]);
      if (path === "/api/research/42/similarity") return response([]);
      if (path === "/api/research/42/monitoring" && init?.method === "POST")
        return response({});
      if (path === "/api/categories") return response([research.category]);
      if (path === "/api/research/42/revisions/6/resubmit") return response({});
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("researcher research workspace", () => {
  it("opens an owned deep-linked record with revision, file, validation, activity, and similarity panels", async () => {
    installApi();
    render(
      <RoleWorkspace
        role="researcher"
        navigate={vi.fn()}
        selectNav={vi.fn()}
        dashboardScope="researcher:researcher@example.test"
        dashboardState={{
          status: "loading",
          scope: "researcher:researcher@example.test",
        }}
        onRetry={vi.fn()}
        researchDocumentId="42"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Revision-ready study" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Revision history")).toBeInTheDocument();
    expect(screen.getByText("Title-validation history")).toBeInTheDocument();
    expect(screen.getByText("revision-v2.pdf")).toBeInTheDocument();
    expect(screen.getByText("final.pdf")).toBeInTheDocument();
    expect(screen.getByText("RN-2026-AB12CD34")).toBeInTheDocument();
    expect(screen.getByText(/Instructor: Ina Structor/)).toBeInTheDocument();
    expect(screen.getByText(/Adviser: Ada Viser/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Download" })[0],
    ).toHaveAttribute("href", "/api/research/42/files/10/download");
    expect(
      screen.getByRole("button", { name: "Rename revision-v2.pdf" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Rename final.pdf" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Preview PDF/ })).toHaveAttribute(
      "href",
      "/api/research/42/files/10/preview",
    );
  });

  it("updates the owned study abstract and related metadata", async () => {
    const fetchMock = installApi();
    render(
      <RoleWorkspace
        role="researcher"
        navigate={vi.fn()}
        selectNav={vi.fn()}
        dashboardScope="researcher:researcher@example.test"
        dashboardState={{
          status: "loading",
          scope: "researcher:researcher@example.test",
        }}
        onRetry={vi.fn()}
        researchDocumentId="42"
      />,
    );

    await screen.findByRole("heading", { name: "Revision-ready study" });
    fireEvent.click(
      screen.getByRole("button", { name: "Edit metadata and authors" }),
    );
    await screen.findByRole("heading", { name: "Edit submission" });

    fireEvent.change(screen.getByLabelText("Abstract"), {
      target: { value: "An abstract updated by the research owner." },
    });
    fireEvent.change(screen.getByLabelText("Keywords"), {
      target: { value: "ownership, metadata, revision" },
    });
    fireEvent.change(screen.getByLabelText("Publication year"), {
      target: { value: "2025" },
    });
    fireEvent.change(screen.getByLabelText("Research stage"), {
      target: { value: "completed" },
    });
    fireEvent.change(screen.getByLabelText("Author name"), {
      target: { value: "Ada Lovelace and Research Team" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            category_id: 2,
            title: "Revision-ready study",
            abstract: "An abstract updated by the research owner.",
            keywords: "ownership, metadata, revision",
            publication_year: 2025,
            research_stage: "completed",
            authors: [
              {
                author_name: "Ada Lovelace and Research Team",
                user_id: null,
                is_corresponding_author: true,
              },
            ],
          }),
        }),
      ),
    );
    expect(
      await screen.findByText("An abstract updated by the research owner."),
    ).toBeInTheDocument();
  });

  it("uses revised_manuscript for editable revisions and resubmits the latest request", async () => {
    const fetchMock = installApi();
    render(
      <RoleWorkspace
        role="researcher"
        navigate={vi.fn()}
        selectNav={vi.fn()}
        dashboardScope="researcher:researcher@example.test"
        dashboardState={{
          status: "loading",
          scope: "researcher:researcher@example.test",
        }}
        onRetry={vi.fn()}
        researchDocumentId="42"
      />,
    );

    await screen.findByRole("heading", { name: "Revision-ready study" });
    fireEvent.click(
      screen.getByRole("button", { name: "Edit metadata and authors" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Edit submission" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Document type")[1]).toHaveValue(
      "revised_manuscript",
    );
    expect(
      screen.queryByRole("button", { name: "Save and submit" }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("PDF or DOCX (maximum 25 MB)"), {
      target: { files: [new File(["revision"], "revision.docx")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(
        ([path, init]) =>
          String(path) === "/api/research/42/files" && init?.method === "POST",
      );
      expect(uploadCall).toBeDefined();
      expect((uploadCall?.[1]?.body as FormData).get("document_type")).toBe(
        "revised_manuscript",
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Resubmit revision 2/ }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/revisions/6/resubmit",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });

  it("explains why resubmission remains disabled until a current revised manuscript is loaded", async () => {
    installApi([]);
    render(
      <RoleWorkspace
        role="researcher"
        navigate={vi.fn()}
        selectNav={vi.fn()}
        dashboardScope="researcher:researcher@example.test"
        dashboardState={{
          status: "loading",
          scope: "researcher:researcher@example.test",
        }}
        onRetry={vi.fn()}
        researchDocumentId="42"
      />,
    );

    expect(
      await screen.findByText(/Upload a current revised manuscript/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resubmit revision 2/ }),
    ).toBeDisabled();
  });

  it("shows an error instead of mock data when the live Researcher detail page fails", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "RESEARCH_TABLE_UNAVAILABLE" }), {
          status: 500,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RoleWorkspace
        role="researcher"
        navigate={vi.fn()}
        selectNav={vi.fn()}
        dashboardScope="researcher:researcher@example.test"
        dashboardState={{
          status: "loading",
          scope: "researcher:researcher@example.test",
        }}
        onRetry={vi.fn()}
        researchDocumentId="42"
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your research record could not be loaded",
    );
    expect(screen.queryByText("Demo data - read only")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Resubmit revision/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps live record details when only the files endpoint is unavailable", async () => {
    installApi();
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (String(input) === "/api/research/42/files" && !init?.method) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "FILES_TABLE_UNAVAILABLE" }), {
              status: 500,
            }),
          );
        }
        return originalFetch(input, init);
      }),
    );
    render(
      <RoleWorkspace
        role="researcher"
        navigate={vi.fn()}
        selectNav={vi.fn()}
        dashboardScope="researcher:researcher@example.test"
        dashboardState={{
          status: "loading",
          scope: "researcher:researcher@example.test",
        }}
        onRetry={vi.fn()}
        researchDocumentId="42"
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Revision-ready study" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Some research sections are unavailable: Files",
    );
    expect(
      screen.getByText("No files have been uploaded."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Rename/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("New file or replacement"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resubmit revision 2/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit metadata and authors" }),
    ).toBeEnabled();
  });

  it("keeps a missing Researcher record as not found instead of fabricating it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      ),
    );
    render(
      <RoleWorkspace
        role="researcher"
        navigate={vi.fn()}
        selectNav={vi.fn()}
        dashboardScope="researcher:researcher@example.test"
        dashboardState={{
          status: "loading",
          scope: "researcher:researcher@example.test",
        }}
        onRetry={vi.fn()}
        researchDocumentId="999"
      />,
    );

    expect(
      await screen.findByText(
        "Your research record could not be loaded. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Demo data - read only")).not.toBeInTheDocument();
  });
});
