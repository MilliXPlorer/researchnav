import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminResearchWorkspace from "./AdminResearchWorkspace";
import type {
  DocumentFileResource,
  FeedbackResource,
  InternalResearchResource,
  MonitoringLogResource,
  ResearchAuthorResource,
  ResearchRevisionResource,
  ReviewAssignmentResource,
  SimilarityResultResource,
  TitleValidationResource,
} from "./api";

const research = (
  overrides: Partial<InternalResearchResource> = {},
): InternalResearchResource => ({
  id: 42,
  submitted_by: "owner-42",
  title: "Internal study",
  abstract: "Internal abstract",
  keywords: "internal, study",
  publication_year: 2026,
  research_stage: "ongoing",
  submission_status: "draft",
  archive_status: "not_archived",
  visibility: "private",
  ...overrides,
});

const revision = (
  overrides: Partial<ResearchRevisionResource> = {},
): ResearchRevisionResource => ({
  id: 9,
  research_document_id: 42,
  requested_by: "adviser-1",
  document_file_id: null,
  revision_number: 2,
  revision_remarks: "Clarify methods.",
  revision_status: "requested",
  requested_at: null,
  submitted_at: null,
  resolved_at: null,
  ...overrides,
});

const validation = (
  overrides: Partial<TitleValidationResource> = {},
): TitleValidationResource => ({
  id: 7,
  research_document_id: 42,
  similarity_result_id: null,
  validated_by: null,
  validation_status: "pending",
  adviser_remarks: null,
  validated_at: null,
  created_at: null,
  updated_at: null,
  ...overrides,
});

const author = (
  overrides: Partial<ResearchAuthorResource> = {},
): ResearchAuthorResource => ({
  id: 3,
  user_id: null,
  author_name: "First Author",
  author_order: 1,
  is_corresponding_author: true,
  ...overrides,
});
const similarityResult = (
  overrides: Partial<SimilarityResultResource> = {},
): SimilarityResultResource => ({
  id: 12,
  source_research_id: 42,
  matched_research_id: 43,
  source_title: "Internal study",
  matched_title: "Related study",
  tfidf_score: null,
  title_similarity_score: "0.71",
  title_similarity_percentage: "71.00",
  title_weight: "0.300000000000",
  title_weighted_contribution: "21.30",
  content_similarity_score: "0.71",
  content_similarity_percentage: "71.00",
  content_weight: "0.700000000000",
  content_weighted_contribution: "49.70",
  overall_similarity_score: "0.71",
  overall_similarity_percentage: "71.00",
  classification: "high",
  overall_flagged: true,
  title_match_alert: false,
  adviser_review_required: true,
  flag_reason: "overall_high_similarity",
  cosine_score: "0.71",
  fasttext_score: null,
  final_similarity_score: "0.71",
  score_status: "scored",
  threshold: "0.70",
  contextual_analysis: null,
  matched_terms: null,
  analysis_type: "document",
  algorithm_version: "combined-title-content-tfidf-cosine-v1",
  analyzed_at: null,
  ...overrides,
});
const reviewer = (): ReviewAssignmentResource => ({
  id: 4,
  reviewer_id: "11111111-1111-4111-8111-111111111111",
  review_role: "adviser",
  is_active: true,
  assigned_by: "office-1",
});
const file = (): DocumentFileResource => ({
  id: 5,
  research_document_id: 42,
  document_type: "final_manuscript",
  version_number: 1,
  original_filename: "study.pdf",
  file_extension: "pdf",
  mime_type: "application/pdf",
  file_size: 12,
  is_current: true,
  uploaded_at: null,
});
const feedbackItem = (
  overrides: Partial<FeedbackResource> = {},
): FeedbackResource => ({
  id: 6,
  research_document_id: 42,
  user_id: "reviewer-1",
  document_file_id: null,
  comment: "Clarify the sample.",
  feedback_type: "suggestion",
  feedback_status: "open",
  created_at: null,
  ...overrides,
});
const monitoringItem = (): MonitoringLogResource => ({
  id: 8,
  research_document_id: 42,
  performed_by: "office-1",
  activity_type: "RESEARCH_CREATED",
  remarks: "Research created.",
  previous_status: null,
  new_status: "draft",
  monitoring_status: "open",
  activity_date: null,
});

function installApi({
  initialResearch = research(),
  revisions = [] as ResearchRevisionResource[],
  validations = [] as TitleValidationResource[],
  similarityResults = [] as SimilarityResultResource[],
  authors = [] as ResearchAuthorResource[],
  reviewers = [] as ReviewAssignmentResource[],
  files = [] as DocumentFileResource[],
  feedback = [] as FeedbackResource[],
  monitoring = [] as MonitoringLogResource[],
  failPath,
  failMethod,
  failReloadAfterMutation = false,
}: {
  initialResearch?: InternalResearchResource;
  revisions?: ResearchRevisionResource[];
  validations?: TitleValidationResource[];
  similarityResults?: SimilarityResultResource[];
  authors?: ResearchAuthorResource[];
  reviewers?: ReviewAssignmentResource[];
  files?: DocumentFileResource[];
  feedback?: FeedbackResource[];
  monitoring?: MonitoringLogResource[];
  failPath?: string;
  failMethod?: string;
  failReloadAfterMutation?: boolean;
} = {}) {
  let currentResearch = initialResearch;
  let currentRevisions = revisions;
  let currentValidations = validations;
  let currentAuthors = authors;
  let currentReviewers = reviewers;
  let currentFiles = files;
  let currentFeedback = feedback;
  let mutationOccurred = false;
  const fetchMock = vi.fn(
    async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const path = String(input);
      if (path === failPath && (!failMethod || init?.method === failMethod)) {
        return new Response(JSON.stringify({ error: "CHANGE_FAILED" }), {
          status: 422,
        });
      }
      if (
        failReloadAfterMutation &&
        mutationOccurred &&
        path === "/api/research/42" &&
        !init?.method
      ) {
        return new Response(JSON.stringify({ error: "RELOAD_FAILED" }), {
          status: 500,
        });
      }
      if (path === "/api/research/42/similarity") {
        return new Response(JSON.stringify({ data: similarityResults }));
      }
      if (path === "/api/research/42/revisions") {
        return new Response(JSON.stringify({ data: currentRevisions }));
      }
      if (path === "/api/research/42/validation") {
        return new Response(JSON.stringify({ data: currentValidations }));
      }
      if (path === "/api/research/42/authors" && init?.method !== "PUT") {
        return new Response(JSON.stringify({ data: currentAuthors }));
      }
      if (path === "/api/research/42/reviewers" && init?.method !== "PUT") {
        return new Response(JSON.stringify({ data: currentReviewers }));
      }
      if (path === "/api/research/42/files" && init?.method !== "POST") {
        return new Response(JSON.stringify({ data: currentFiles }));
      }
      if (path === "/api/research/42/feedback" && init?.method !== "POST") {
        return new Response(JSON.stringify({ data: currentFeedback }));
      }
      if (path === "/api/research/42/monitoring") {
        return new Response(JSON.stringify({ data: monitoring }));
      }
      if (path === "/api/research/42" && init?.method === "PATCH") {
        currentResearch = {
          ...currentResearch,
          ...JSON.parse(String(init?.body)),
        };
      }
      if (path === "/api/research/42/submit") {
        mutationOccurred = true;
        currentResearch = {
          ...currentResearch,
          submission_status: "submitted",
        };
      }
      if (path === "/api/research/42/status") {
        currentResearch = {
          ...currentResearch,
          submission_status: JSON.parse(String(init?.body)).submission_status,
        };
      }
      if (path === "/api/research/42/archive") {
        currentResearch = {
          ...currentResearch,
          submission_status: "archived",
          archive_status: "archived",
          visibility: JSON.parse(String(init?.body)).visibility,
        };
      }
      if (path === "/api/research/42/revisions/9/resubmit") {
        currentRevisions = currentRevisions.map((item) =>
          item.id === 9 ? { ...item, revision_status: "resubmitted" } : item,
        );
        currentResearch = {
          ...currentResearch,
          submission_status: "under_review",
        };
      }
      if (path === "/api/research/42/validation/7") {
        currentValidations = currentValidations.map((item) =>
          item.id === 7
            ? {
                ...item,
                ...JSON.parse(String(init?.body)),
              }
            : item,
        );
      }
      if (path === "/api/research/42/authors" && init?.method === "PUT") {
        currentAuthors = JSON.parse(String(init.body)).authors.map(
          (item: ResearchAuthorResource, index: number) => ({
            ...item,
            id: index + 20,
            author_order: index + 1,
          }),
        );
        return new Response(JSON.stringify({ data: currentAuthors }));
      }
      if (path === "/api/research/42/reviewers" && init?.method === "PUT") {
        currentReviewers = JSON.parse(String(init.body)).reviewers.map(
          (item: ReviewAssignmentResource, index: number) => ({
            ...item,
            id: index + 20,
            is_active: true,
            assigned_by: "office-1",
          }),
        );
        return new Response(JSON.stringify({ data: currentReviewers }));
      }
      if (path === "/api/research/42/feedback" && init?.method === "POST") {
        currentFeedback = [
          {
            id: 21,
            research_document_id: 42,
            user_id: "office-1",
            feedback_status: "open",
            created_at: null,
            document_file_id: null,
            ...JSON.parse(String(init.body)),
          },
          ...currentFeedback,
        ];
        return new Response(JSON.stringify({ data: currentFeedback[0] }));
      }
      if (path === "/api/research/42/feedback/6") {
        currentFeedback = currentFeedback.map((item) => ({
          ...item,
          ...JSON.parse(String(init?.body)),
        }));
        return new Response(JSON.stringify({ data: currentFeedback[0] }));
      }
      if (path === "/api/research/42/files" && init?.method === "POST") {
        const uploaded = { ...file(), id: 22, original_filename: "final.pdf" };
        currentFiles = [...currentFiles, uploaded];
        return new Response(JSON.stringify({ data: uploaded }));
      }
      return new Response(JSON.stringify({ data: currentResearch }));
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("AdminResearchWorkspace", () => {
  it("loads the selected internal record, revisions, and title validations", async () => {
    const fetchMock = installApi({
      revisions: [revision()],
      validations: [validation()],
      authors: [author()],
      reviewers: [reviewer()],
      files: [file()],
      feedback: [feedbackItem()],
      monitoring: [monitoringItem()],
    });
    render(
      <AdminResearchWorkspace researchDocumentId="42" navigate={vi.fn()} />,
    );

    expect(
      screen.getByLabelText("Loading internal research record"),
    ).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("owner-42")).toBeInTheDocument();
    expect(screen.getByText("Revision 2")).toBeInTheDocument();
    expect(screen.getByText("Validation #7")).toBeInTheDocument();
    expect(screen.getByText(/1\. First Author/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Download study.pdf" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Clarify the sample/)).toBeInTheDocument();
    expect(screen.getByText(/RESEARCH CREATED/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/revisions",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/validation",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/similarity",
      expect.objectContaining({ credentials: "include" }),
    );
    for (const path of [
      "authors",
      "reviewers",
      "files",
      "feedback",
      "monitoring",
    ]) {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/research/42/${path}`,
        expect.objectContaining({ credentials: "include" }),
      );
    }
  });

  it("loads successfully after StrictMode replays the mount effect", async () => {
    installApi();
    render(
      <StrictMode>
        <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />
      </StrictMode>,
    );

    expect(await screen.findByText("owner-42")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Internal study" }),
    ).toBeInTheDocument();
  });

  it("saves ordered authors and the full active reviewer list", async () => {
    const fetchMock = installApi({
      authors: [author()],
      reviewers: [reviewer()],
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    await screen.findByText(/First Author/);

    fireEvent.change(screen.getByLabelText("Author name"), {
      target: { value: "Second Author" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add author" }));
    fireEvent.click(screen.getByRole("button", { name: "Save authors" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/authors",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            authors: [
              {
                user_id: null,
                author_name: "First Author",
                is_corresponding_author: true,
              },
              {
                user_id: null,
                author_name: "Second Author",
                is_corresponding_author: false,
              },
            ],
          }),
        }),
      ),
    );
    await screen.findByRole("status");

    fireEvent.change(screen.getByLabelText("Reviewer UUID"), {
      target: { value: "22222222-2222-4222-8222-222222222222" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "instructor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add reviewer" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save active reviewers" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/reviewers",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({
            reviewers: [
              { reviewer_id: reviewer().reviewer_id, review_role: "adviser" },
              {
                reviewer_id: "22222222-2222-4222-8222-222222222222",
                review_role: "instructor",
              },
            ],
          }),
        }),
      ),
    );
  });

  it("does not add a nested main landmark to the dashboard workspace", async () => {
    installApi();
    render(
      <main>
        <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />
      </main>,
    );

    await screen.findByRole("heading", { name: "Internal study" });
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("renders ordered authors read-only outside editable states", async () => {
    installApi({
      initialResearch: research({ submission_status: "submitted" }),
      authors: [
        author({ id: 4, author_name: "Second Author", author_order: 2 }),
        author({ id: 3, author_name: "First Author", author_order: 1 }),
      ],
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );

    const first = await screen.findByText(/1\. First Author/);
    const second = screen.getByText(/2\. Second Author/);
    expect(first.compareDocumentPosition(second)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Author name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save authors" }),
    ).not.toBeInTheDocument();
  });

  it("provides authenticated file downloads, restricted approved upload, and feedback actions", async () => {
    const fetchMock = installApi({
      initialResearch: research({ submission_status: "approved" }),
      files: [file()],
      feedback: [feedbackItem()],
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    expect(
      await screen.findByRole("link", { name: "Download study.pdf" }),
    ).toHaveAttribute("href", "/api/research/42/files/5/download");
    expect(
      Array.from(
        (screen.getByLabelText("Document type") as HTMLSelectElement).options,
      ).map((option) => option.value),
    ).toEqual(["final_manuscript", "attachment"]);

    const selected = new File(["pdf"], "final.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("File"), {
      target: { files: [selected] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload file" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/files",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
      ),
    );
    await screen.findByRole("status");

    fireEvent.change(screen.getByLabelText("Comment"), {
      target: { value: "Please revise." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add feedback" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            comment: "Please revise.",
            feedback_type: "comment",
          }),
        }),
      ),
    );
    await screen.findByRole("status");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Acknowledge" }).at(-1)!,
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/feedback/6",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ feedback_status: "acknowledged" }),
        }),
      ),
    );
  });

  it.each(["draft", "revision_required"] as const)(
    "allows every backend document type while %s",
    async (submission_status) => {
      const fetchMock = installApi({
        initialResearch: research({ submission_status }),
      });
      render(
        <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
      );

      const documentType = (await screen.findByLabelText(
        "Document type",
      )) as HTMLSelectElement;
      expect(
        Array.from(documentType.options).map((option) => option.value),
      ).toEqual([
        "title_proposal",
        "draft",
        "chapter",
        "revised_manuscript",
        "final_manuscript",
        "attachment",
      ]);
      fireEvent.change(documentType, { target: { value: "chapter" } });
      fireEvent.change(screen.getByLabelText("File"), {
        target: {
          files: [
            new File(["chapter"], "chapter.pdf", {
              type: "application/pdf",
            }),
          ],
        },
      });
      fireEvent.click(screen.getByRole("button", { name: "Upload file" }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/research/42/files",
          expect.objectContaining({
            method: "POST",
            body: expect.any(FormData),
          }),
        ),
      );
      const uploadCall = fetchMock.mock.calls.find(
        ([path, init]) =>
          path === "/api/research/42/files" &&
          (init as RequestInit).method === "POST",
      );
      expect(
        ((uploadCall?.[1] as RequestInit).body as FormData).get(
          "document_type",
        ),
      ).toBe("chapter");
    },
  );

  it("resets an incompatible upload type after authoritative status changes", async () => {
    installApi();
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );

    fireEvent.change(await screen.findByLabelText("Document type"), {
      target: { value: "chapter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit research" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Move to under review" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve research" }),
    );

    expect(await screen.findByLabelText("Document type")).toHaveValue(
      "final_manuscript",
    );
  });

  it("saves editable metadata and refreshes the authoritative record", async () => {
    const fetchMock = installApi();
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    await screen.findByDisplayValue("Internal study");

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Saved title" },
    });
    fireEvent.change(screen.getByLabelText("Publication year"), {
      target: { value: "2025" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save metadata" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            title: "Saved title",
            abstract: "Internal abstract",
            keywords: "internal, study",
            publication_year: 2025,
            research_stage: "ongoing",
          }),
        }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Metadata saved and refreshed.",
    );
  });

  it.each([
    ["draft", "Submit research", "/api/research/42/submit", "POST", {}],
    [
      "submitted",
      "Move to under review",
      "/api/research/42/status",
      "PATCH",
      { submission_status: "under_review" },
    ],
    [
      "under_review",
      "Approve research",
      "/api/research/42/status",
      "PATCH",
      { submission_status: "approved" },
    ],
  ] as const)(
    "runs the %s workflow action",
    async (status, button, path, method, body) => {
      const fetchMock = installApi({
        initialResearch: research({ submission_status: status }),
      });
      render(
        <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
      );
      fireEvent.click(await screen.findByRole("button", { name: button }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          path,
          expect.objectContaining({ method, body: JSON.stringify(body) }),
        ),
      );
    },
  );

  it("archives approved research with the selected visibility", async () => {
    const fetchMock = installApi({
      initialResearch: research({ submission_status: "approved" }),
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    fireEvent.change(await screen.findByLabelText("Archive visibility"), {
      target: { value: "public" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive research" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/archive",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ visibility: "public" }),
        }),
      ),
    );
  });

  it("does not offer archive actions for an already archived approved record", async () => {
    installApi({
      initialResearch: research({
        submission_status: "approved",
        archive_status: "archived",
      }),
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );

    expect(
      await screen.findByText(
        "No workflow action is available for this record state.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archive research" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Archive visibility"),
    ).not.toBeInTheDocument();
  });

  it("allows acknowledged feedback to be resolved, then hides its actions", async () => {
    const fetchMock = installApi({
      feedback: [feedbackItem({ feedback_status: "acknowledged" })],
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );

    expect(
      await screen.findByRole("button", { name: "Resolve" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Acknowledge" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/feedback/6",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ feedback_status: "resolved" }),
        }),
      ),
    );
    expect(await screen.findByText(/Resolved/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resolve" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Acknowledge" }),
    ).not.toBeInTheDocument();
  });

  it("resubmits only the latest eligible revision", async () => {
    const fetchMock = installApi({
      initialResearch: research({ submission_status: "revision_required" }),
      revisions: [
        revision({ id: 8, revision_number: 1, revision_status: "resubmitted" }),
        revision(),
      ],
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Resubmit revision 2" }),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/revisions/9/resubmit",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({}) }),
      ),
    );
  });

  it("records an explicit title-validation decision with optional remarks", async () => {
    const fetchMock = installApi({ validations: [validation()] });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    fireEvent.change(
      await screen.findByLabelText("Decision for validation 7"),
      { target: { value: "revision_required" } },
    );
    fireEvent.change(screen.getByLabelText("Remarks for validation 7"), {
      target: { value: "Narrow the title." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save decision" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/validation/7",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            validation_status: "revision_required",
            adviser_remarks: "Narrow the title.",
          }),
        }),
      ),
    );
  });

  it("limits pending validation links to loaded source results and shows completed history", async () => {
    const fetchMock = installApi({
      validations: [
        validation(),
        validation({
          id: 8,
          validation_status: "approved",
          adviser_remarks: "Title is sufficiently distinct.",
          similarity_result_id: 12,
          validated_by: "adviser-1",
          validated_at: "2026-08-18T10:00:00.000Z",
        }),
      ],
      similarityResults: [
        similarityResult(),
        similarityResult({
          id: 13,
          source_research_id: 99,
          matched_title: "A different record's result",
        }),
      ],
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );

    const linkedResult = await screen.findByLabelText(
      "Similarity result for validation 7",
    );
    expect(linkedResult).toHaveTextContent("#12 — Related study");
    expect(linkedResult).not.toHaveTextContent("A different record's result");
    fireEvent.change(screen.getByLabelText("Decision for validation 7"), {
      target: { value: "approved" },
    });
    fireEvent.change(linkedResult, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Save decision" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research/42/validation/7",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            validation_status: "approved",
            similarity_result_id: 12,
          }),
        }),
      ),
    );
    expect(screen.getByText("Validation #8")).toBeInTheDocument();
    expect(
      screen.getByText("Title is sufficiently distinct."),
    ).toBeInTheDocument();
    expect(screen.getByText("adviser-1")).toBeInTheDocument();
    expect(screen.getAllByText(/#12 — Related study/)).toHaveLength(2);
    expect(
      screen.queryByLabelText("Decision for validation 8"),
    ).not.toBeInTheDocument();
  });

  it("does not expose invalid workflow actions", async () => {
    installApi({
      initialResearch: research({ submission_status: "archived" }),
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    expect(
      await screen.findByText(
        "No workflow action is available for this record state.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit research" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archive research" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the authoritative display unchanged when a mutation fails", async () => {
    installApi({ failPath: "/api/research/42/submit" });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit research" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The requested change could not be completed.",
    );
    expect(screen.getByText("Status").parentElement).toHaveTextContent("Draft");
  });

  it("restores server authors after a rejected author replacement", async () => {
    installApi({
      authors: [author()],
      failPath: "/api/research/42/authors",
      failMethod: "PUT",
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    fireEvent.change(await screen.findByLabelText("Author name"), {
      target: { value: "Unsaved Author" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add author" }));
    fireEvent.click(screen.getByRole("button", { name: "Save authors" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The authoritative record was restored.",
    );
    expect(screen.queryByText(/Unsaved Author/)).not.toBeInTheDocument();
    expect(screen.getByText(/First Author/)).toBeInTheDocument();
  });

  it("restores server reviewers after a rejected reviewer replacement", async () => {
    installApi({
      reviewers: [reviewer()],
      failPath: "/api/research/42/reviewers",
      failMethod: "PUT",
    });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save active reviewers" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The authoritative record was restored.",
    );
    expect(
      screen.getByText(/11111111-1111-4111-8111-111111111111/),
    ).toHaveTextContent("Adviser");
    expect(screen.queryByText("(inactive)")).not.toBeInTheDocument();
  });

  it("fails closed when a successful mutation cannot reload authoritative context", async () => {
    installApi({ failReloadAfterMutation: true });
    render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit research" }),
    );

    expect(
      await screen.findByText("authoritative record could not be reloaded", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit research" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("keeps only the latest out-of-order record load", async () => {
    const pending = new Map<number, Array<(response: Response) => void>>();
    const fetchMock = vi.fn((input: URL | RequestInfo) => {
      const path = String(input);
      if (path.endsWith("/similarity")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [] })));
      }
      const id = Number(path.match(/research\/(\d+)/)?.[1]);
      return new Promise<Response>((resolve) => {
        pending.set(id, [...(pending.get(id) ?? []), resolve]);
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    await waitFor(() => expect(pending.get(42)).toHaveLength(8));
    view.rerender(
      <AdminResearchWorkspace researchDocumentId={43} navigate={vi.fn()} />,
    );
    await waitFor(() => expect(pending.get(43)).toHaveLength(8));
    // Only the research endpoint needs a record; all child endpoints accept arrays.
    const resolveFor = (id: number) => {
      const calls = fetchMock.mock.calls.filter(([path]) =>
        String(path).includes(`/research/${id}`),
      );
      (pending.get(id) ?? []).forEach((resolve, index) =>
        resolve(
          new Response(
            JSON.stringify({
              data:
                calls[index]?.[0] === `/api/research/${id}`
                  ? research({ id, title: `Record ${id}` })
                  : [],
            }),
          ),
        ),
      );
    };
    await act(async () => resolveFor(43));
    expect(
      await screen.findByRole("heading", { name: "Record 43" }),
    ).toBeInTheDocument();
    await act(async () => resolveFor(42));
    expect(
      screen.getByRole("heading", { name: "Record 43" }),
    ).toBeInTheDocument();
  });

  it("does not apply a pending context load after unmount", async () => {
    const resolvers: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const view = render(
      <AdminResearchWorkspace researchDocumentId={42} navigate={vi.fn()} />,
    );
    await waitFor(() => expect(resolvers).toHaveLength(9));
    view.unmount();
    await act(async () => {
      for (const resolve of resolvers) {
        resolve(new Response(JSON.stringify({ data: research() })));
      }
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
