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
  institute: null,
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
    relative_path: "Chapter 2",
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
    relative_path: "Full Manuscript",
    uploaded_at: "2026-08-01T10:00:00.000Z",
  },
];

function response(data: unknown) {
  return new Response(JSON.stringify({ data }));
}

function installApi(
  loadedFiles = files,
  loadedValidations = [
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
  ],
  loadedResearch = research,
) {
  let currentResearch = loadedResearch;
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
      if (path === "/api/research/42/folders") {
        return response([
          "Chapter 1",
          "Chapter 2",
          "Chapter 3",
          "Chapter 4",
          "Chapter 5",
          "Chapter 6",
          "Full Manuscript",
        ]);
      }
      if (path === "/api/research/42/support-assignments") {
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          return response({
            id: 88,
            research_document_id: 42,
            research_title: research.title,
            researchers: ["Ada Lovelace"],
            user_id: body.user_id,
            name: "New Editor",
            assignment_role: body.assignment_role,
            status: "requested",
            created_at: "2026-09-13T01:00:00.000Z",
          });
        }
        return response([
          {
            id: 71,
            research_document_id: 42,
            research_title: research.title,
            researchers: ["Ada Lovelace"],
            user_id: "editor-a",
            name: "Ed Itor",
            assignment_role: "research_editor",
            status: "accepted",
            created_at: "2026-09-10T01:00:00.000Z",
          },
        ]);
      }
      if (path.startsWith("/api/support-assignments/eligible?role=")) {
        return response([
          { id: "editor-b", name: "New Editor", email: "editor@example.test" },
        ]);
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
        return response(loadedValidations);
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
      if (path === "/api/research/42/files/10/annotations") return response([]);
      if (path === "/api/research/42/files/11/preview-content")
        return response({
          schema_version: 1,
          research_document_id: 42,
          document_file_id: 11,
          document_file_version: 1,
          filename: "chapter-two.docx",
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
        });
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
  it("opens an owned deep-linked record without researcher review panels", async () => {
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
    expect(screen.queryByText("Revision history")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Title review decisions"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Similarity results")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Feedback" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request title validation" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("RN-2026-AB12CD34").length).toBeGreaterThan(0);
    expect(screen.getByText("Ina Structor")).toBeInTheDocument();
    expect(screen.getByText("Ada Viser")).toBeInTheDocument();
    expect(screen.getByText("Research workspace")).toBeInTheDocument();
    expect(screen.getByText("Study members")).toBeInTheDocument();
    expect(screen.getByText("Latest documents")).toBeInTheDocument();
    expect(screen.queryByText("Submission timeline")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Research progress" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/continue toward approval/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Report your current progress" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(
      screen.getByRole("complementary", { name: "Document folders" }),
    ).toBeInTheDocument();
    for (const chapter of ["Chapter 4", "Chapter 5", "Chapter 6"]) {
      expect(screen.getAllByText(chapter).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole("button", { name: /^Chapter 2/ }));
    expect(screen.getAllByText("revision-v2.pdf").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Download" })[0],
    ).toHaveAttribute("href", "/api/research/42/files/10/download");
    expect(
      screen.getByRole("button", { name: "Rename revision-v2.pdf" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("link", { name: "Open document" }),
    ).toHaveAttribute("href", "/api/research/42/files/10/preview");
    expect(screen.getByRole("link", { name: "Open document" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(
      screen.queryByRole("button", { name: "Save annotation" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Full Manuscript/ }));
    expect(screen.getAllByText("final.pdf").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Rename final.pdf" }),
    ).not.toBeInTheDocument();
  });

  it("opens a DOCX file in a preview pop-up window", async () => {
    installApi([
      {
        id: 11,
        research_document_id: 42,
        document_type: "revised_manuscript",
        version_number: 1,
        original_filename: "chapter-two.docx",
        file_extension: "docx",
        mime_type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_size: 512,
        is_current: true,
        relative_path: "Chapter 2",
        uploaded_at: "2026-08-02T10:00:01.000Z",
      },
    ]);
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
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    fireEvent.click(screen.getByRole("button", { name: /^Chapter 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));

    expect(
      await screen.findByRole("dialog", {
        name: "Preview of chapter-two.docx",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Read this paragraph in the app."),
    ).toBeInTheDocument();
  });

  it("does not expose legacy pending title-validation requests", async () => {
    installApi(files, [
      {
        id: 5,
        research_document_id: 42,
        similarity_result_id: null,
        validated_by: "researcher@example.test",
        validation_status: "pending",
        adviser_remarks: "Pending request should not be shown.",
        validated_at: null,
        created_at: "2026-08-04T10:00:00.000Z",
        updated_at: "2026-08-04T10:00:00.000Z",
      },
    ]);
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
    expect(
      screen.queryByText("Title review decisions"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Pending request should not be shown."),
    ).not.toBeInTheDocument();
  });

  it("uploads submitted-study files directly to the active folder", async () => {
    const fetchMock = installApi(files, [], {
      ...research,
      submission_status: "submitted",
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));

    expect(
      screen.getByRole("heading", { name: "Upload a document" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Document type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Document folder")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Upload purpose")).toHaveValue(
      "initial_submission",
    );
    expect(
      screen.getByText(/saved directly to Chapter 1/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Full Manuscript/ }));
    fireEvent.change(screen.getByLabelText("Manuscript file"), {
      target: {
        files: [
          new File(["manuscript"], "full-manuscript.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(
        ([path, init]) =>
          String(path) === "/api/research/42/files" && init?.method === "POST",
      );
      expect((uploadCall?.[1]?.body as FormData).get("relative_path")).toBe(
        "Full Manuscript",
      );
      expect((uploadCall?.[1]?.body as FormData).get("document_type")).toBe(
        "chapter",
      );
    });
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
      screen.getByRole("button", { name: "Edit research details" }),
    );
    await screen.findByRole("heading", { name: "Edit submission" });
    expect(screen.getByLabelText("Author name")).toHaveValue("Ada Lovelace");
    expect(screen.queryByLabelText(/User ID/)).not.toBeInTheDocument();

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
    fireEvent.click(screen.getByRole("checkbox", { name: /Climate Action/i }));
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
            institute: null,
            degree_program: null,
            title: "Revision-ready study",
            abstract: "An abstract updated by the research owner.",
            keywords: "ownership, metadata, revision",
            publication_year: 2025,
            sdg_ids: [13],
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
      screen.getByRole("button", { name: "Edit research details" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Edit submission" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Document type")).toHaveValue(
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

  it("organizes uploads by folder and lets researchers change support actors", async () => {
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
    expect(screen.getByText("Ed Itor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(screen.getAllByText("Chapter 2").length).toBeGreaterThan(0);
    for (const chapter of ["Chapter 4", "Chapter 5", "Chapter 6"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${chapter}`) }),
      ).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: /^Chapter 2/ }));
    fireEvent.change(screen.getByLabelText("Upload purpose"), {
      target: { value: "response_to_feedback" },
    });
    fireEvent.change(screen.getByLabelText("Manuscript file"), {
      target: {
        files: [
          new File(["updated"], "chapter-two.pdf", { type: "application/pdf" }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(
        ([path, init]) =>
          String(path) === "/api/research/42/files" && init?.method === "POST",
      );
      expect(uploadCall).toBeDefined();
      expect((uploadCall?.[1]?.body as FormData).get("relative_path")).toBe(
        "Chapter 2",
      );
      expect((uploadCall?.[1]?.body as FormData).get("document_type")).toBe(
        "revised_manuscript",
      );
      expect((uploadCall?.[1]?.body as FormData).get("upload_purpose")).toBe(
        "response_to_feedback",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Research Team" }));
    fireEvent.click(screen.getByRole("button", { name: "Change Editor" }));
    await screen.findByRole("heading", { name: "Change Editor" });
    fireEvent.change(screen.getByLabelText("Select Editor"), {
      target: { value: "editor-b" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send change request" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/support-assignments",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            user_id: "editor-b",
            assignment_role: "research_editor",
            replace_current: true,
          }),
        }),
      ),
    );
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
      screen.getByText("No documents in this folder yet."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Download" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Rename/,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Manuscript file")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Resubmit revision 2/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Edit research details" }),
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
