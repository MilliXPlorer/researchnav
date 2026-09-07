import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  getSystemStatus,
  getRoleDashboard,
  getInternalResearch,
  archiveInternalResearch,
  checkTitleQuerySimilarity,
  createFeedback,
  deleteOwnProfilePhoto,
  getOwnProfile,
  listNotifications,
  listAdminAuditLogs,
  listAdminCoordinators,
  listAdminUsers,
  listFeedback,
  listMonitoringLogs,
  listPersistedSimilarityResults,
  listPublicResearch,
  listResearchRevisions,
  listResearchAuthors,
  listResearchFiles,
  listReviewAssignments,
  listTitleValidations,
  listSectionMembers,
  listSectionDocumentMembers,
  addSectionMembers,
  addSectionDocumentMember,
  assignSectionDocuments,
  listAssignableSectionDocuments,
  removeSectionMember,
  removeSectionDocumentMember,
  listInstructorStudents,
  markNotificationRead,
  normalizeNextPath,
  runTitleSimilarityCheck,
  searchPublicResearch,
  searchPublicResearchBySimilarity,
  resubmitResearchRevision,
  returnMethodologyForClarification,
  replaceResearchAuthors,
  replaceReviewAssignments,
  researchFileDownloadUrl,
  recordPrivacyLog,
  saveStatisticianChecklist,
  signOffMethodology,
  submitInternalResearch,
  toResearchRecord,
  transitionInternalResearch,
  listComplianceQueue,
  decideCompliance,
  getInstitutionalReport,
  listOfficeUsers,
  listPrivacyLogs,
  listRepositoryCatalog,
  updateOfficeUserAccess,
  updateOwnProfile,
  updateInternalResearch,
  updateAdminUser,
  updateFeedbackStatus,
  updateTitleValidation,
  uploadResearchFile,
  uploadOwnProfilePhoto,
} from "./api";
import type { RoleDashboard } from "./api";

const profileSession = {
  email: "ada@example.test",
  role: "researcher" as const,
  accessStatus: "active" as const,
  isAdmin: false,
  firstName: "Ada",
  middleName: null,
  lastName: "Lovelace",
  studentEmployeeId: "2026-001",
  displayName: "Ada Lovelace",
  profilePhotoUrl: "/api/profile/photo/version",
};

const resource = (id: number, authorName: string, authorOrder = 1) => ({
  id,
  title: `PUBLIC STUDY ${id}`,
  authors: [
    {
      author_name: "Second Author",
      author_order: 2,
      is_corresponding_author: false,
    },
    {
      author_name: authorName,
      author_order: authorOrder,
      is_corresponding_author: true,
    },
  ],
  publication_year: 2026,
  institution_name: "Example College",
  academic_unit: "Example Unit",
  degree_program: "Example Program",
  category: { name: "Example Category" },
  abstract: "Public abstract.",
  keywords: ["public"],
  research_stage: "completed",
  fasttext_support_score: "0.812345",
});

afterEach(() => vi.unstubAllGlobals());

describe("public repository API", () => {
  it("uses exact Laravel author fields and sorts by author_order", () => {
    const record = toResearchRecord(resource(1, "First Author"));
    expect(record.authors).toBe("First Author, Second Author");
    expect(record.fastTextSupportScore).toBe("0.812345");
    expect(record).not.toHaveProperty("sourceFilename");
  });

  it("accumulates Laravel pages and normalizes an absolute next URL", async () => {
    const fetchMock = vi.fn(async (path: string) => {
      if (path === "/api/repository?per_page=50") {
        return new Response(
          JSON.stringify({
            data: [resource(1, "First Author")],
            links: { next: "https://api.example.test/api/repository?page=2" },
          }),
        );
      }
      return new Response(
        JSON.stringify({
          data: [resource(2, "Third Author")],
          links: { next: null },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listPublicResearch()).resolves.toMatchObject([
      { id: "1", authors: "First Author, Second Author" },
      { id: "2", authors: "Third Author, Second Author" },
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/repository?page=2",
      expect.anything(),
    );
  });

  it("returns an empty repository response without manufacturing records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: [], links: { next: null } })),
      ),
    );
    await expect(listPublicResearch()).resolves.toEqual([]);
  });

  it("sends author, keyword, category, year, and SDG filtering to the repository endpoint", async () => {
    let requestedUrl = "";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          data: [resource(1, "Dela Cruz")],
          links: { next: null },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchPublicResearch({
        author: "Dela Cruz",
        keywords: "inventory",
        category: "Web-based",
        year: 2024,
        sdg: 13,
      }),
    ).resolves.toMatchObject([{ id: "1" }]);

    const requested = new URL(requestedUrl, "http://researchnav.local");
    expect(requested.pathname).toBe("/api/repository");
    expect(requested.searchParams.get("author")).toBe("Dela Cruz");
    expect(requested.searchParams.get("keywords")).toBe("inventory");
    expect(requested.searchParams.get("category")).toBe("Web-based");
    expect(requested.searchParams.get("year")).toBe("2024");
    expect(requested.searchParams.get("sdg")).toBe("13");
  });

  it("omits blank filters instead of sending empty query parameters", async () => {
    let requestedUrl = "";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ data: [], links: { next: null } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await searchPublicResearch({ author: "   ", keywords: "", q: "  " });

    const requested = new URL(requestedUrl, "http://researchnav.local");
    expect(requested.searchParams.has("author")).toBe(false);
    expect(requested.searchParams.has("keywords")).toBe(false);
    expect(requested.searchParams.has("q")).toBe(false);
    expect(requested.searchParams.get("per_page")).toBe("50");
  });

  it("posts the submitted query to the public similarity endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                ...resource(1, "First Author"),
                query_title_similarity_score: "0.700000",
                query_title_similarity_percentage: "70.000000",
                query_content_similarity_score: "0.823456",
                query_content_similarity_percentage: "82.345600",
                query_similarity_score: "0.823456",
                query_similarity_percentage: "82.345600",
                title_similarity_score: "0.292100",
                title_similarity_percentage: "29.210000",
                title_weight: "0.300000000000",
                title_weighted_contribution: "8.763000",
                content_similarity_score: "0.234400",
                content_similarity_percentage: "23.440000",
                content_weight: "0.700000000000",
                content_weighted_contribution: "16.408000",
                overall_similarity_score: "0.251700",
                overall_similarity_percentage: "25.170000",
                classification: "low",
                overall_flagged: false,
                title_match_alert: false,
                adviser_review_required: false,
                flag_reason: "not_flagged",
                algorithm_version: "weighted-v1",
                analyzed_at: "2026-09-02T00:00:00.000000Z",
                score_status: "scored",
              },
            ],
          }),
        ),
    );

    await expect(
      searchPublicResearchBySimilarity("climate adaptation", fetchMock),
    ).resolves.toMatchObject([
      {
        id: "1",
        queryTitleSimilarityScore: "0.700000",
        queryContentSimilarityScore: "0.823456",
        querySimilarityScore: "0.823456",
        overallSimilarityPercentage: "25.170000",
        titleWeight: "0.300000000000",
        contentWeightedContribution: "16.408000",
        classification: "low",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/repository/similarity",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ q: "climate adaptation" }),
        credentials: "include",
      }),
    );
  });

  it("rejects pagination links outside the API boundary", () => {
    expect(() =>
      normalizeNextPath("https://example.test/private/file"),
    ).toThrow("INVALID_PAGINATION_LINK");
  });
});

describe("notification API", () => {
  const notification = {
    id: "f2bc7d6b-28d5-4ebc-8ac3-6d5e7c0b2fc0",
    type: "App\\Notifications\\ResearchActivityNotification",
    event: "RESEARCH_SUBMITTED",
    title: "Research activity",
    message: "Research was submitted for review.",
    action_url: "/research/42",
    research_document_id: 42,
    read_at: null,
    created_at: "2026-08-10T12:00:00.000000Z",
  };

  it("lists Laravel NotificationResource records without manufacturing alerts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: [notification], links: { next: null } }),
          ),
      ),
    );

    await expect(listNotifications()).resolves.toEqual([notification]);
  });

  it("marks the UUID notification through its Laravel read endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              ...notification,
              read_at: "2026-08-10T12:01:00.000000Z",
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(markNotificationRead(notification.id)).resolves.toMatchObject({
      id: notification.id,
      read_at: "2026-08-10T12:01:00.000000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/notifications/${notification.id}/read`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

describe("administrator API", () => {
  it("preserves HTTP status, server code, and validation fields in ApiError", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: "VALIDATION_FAILED",
            errors: { email: ["Invalid email."] },
          }),
          { status: 422 },
        ),
    );
    await expect(listAdminCoordinators(fetchMock)).rejects.toMatchObject({
      name: "ApiError",
      message: "VALIDATION_FAILED",
      status: 422,
      code: "VALIDATION_FAILED",
      fields: { email: ["Invalid email."] },
    } satisfies Partial<ApiError>);
  });

  it("uses exact administrator paths, Laravel query names, and resource envelopes", async () => {
    const response = {
      data: [],
      links: { first: null, last: null, prev: null, next: null },
      meta: {
        current_page: 2,
        from: null,
        last_page: 2,
        links: [],
        path: "/api/admin/users",
        per_page: 25,
        to: null,
        total: 0,
      },
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/admin/coordinators")
        return new Response(JSON.stringify({ users: [] }));
      if (path === "/api/admin/system-status")
        return new Response(JSON.stringify({ data: { schema_version: 1 } }));
      return new Response(JSON.stringify(response));
    });
    await expect(listAdminCoordinators(fetchMock)).resolves.toEqual([]);
    await expect(
      listAdminUsers(
        {
          search: "Ada Lovelace",
          role: "adviser",
          access_status: "active",
          page: 2,
          per_page: 25,
        },
        fetchMock,
      ),
    ).resolves.toEqual(response);
    await expect(
      listAdminAuditLogs(
        { action: "ADMIN_USER_UPDATED", page: 2, per_page: 25 },
        fetchMock,
      ),
    ).resolves.toEqual(response);
    await expect(
      updateAdminUser(
        "uuid/with space",
        { role: "adviser", access_status: "active" },
        fetchMock,
      ),
    ).resolves.toEqual([]);
    await expect(getSystemStatus(fetchMock)).resolves.toEqual({
      schema_version: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users?search=Ada+Lovelace&role=adviser&access_status=active&page=2&per_page=25",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/audit-logs?action=ADMIN_USER_UPDATED&page=2&per_page=25",
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/uuid%2Fwith%20space",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "adviser", access_status: "active" }),
      }),
    );
  });
});

describe("role dashboard API", () => {
  const dashboard: RoleDashboard = {
    schema_version: 1,
    role: "adviser",
    sections: [
      {
        key: "repository_references",
        state: "ready",
        total: 1,
        reason: null,
        items: [
          {
            research_document_id: 1,
            title: "Public dashboard preview",
            research_stage: "completed",
            submission_status: "archived",
            archive_status: "archived",
            visibility: "public",
            publication_year: 2026,
            updated_at: null,
          },
        ],
      },
    ],
  };

  it("loads the dashboard through the exact authenticated endpoint", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: dashboard })),
    );

    await expect(getRoleDashboard("adviser", fetchMock)).resolves.toEqual(
      dashboard,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("rejects a dashboard with an unexpected schema version or role", async () => {
    const schemaMismatch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { ...dashboard, schema_version: 2 } }),
        ),
    );
    const roleMismatch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { ...dashboard, role: "instructor" } }),
        ),
    );

    await expect(getRoleDashboard("adviser", schemaMismatch)).rejects.toThrow(
      "DASHBOARD_ROLE_MISMATCH",
    );
    await expect(getRoleDashboard("adviser", roleMismatch)).rejects.toThrow(
      "DASHBOARD_ROLE_MISMATCH",
    );
  });
});

describe("specialist workspace API routes", () => {
  it("uses canonical statistician, librarian, and office paths with exact methods", async () => {
    const fetchMock = vi.fn(
      async (path: RequestInfo | URL, init?: RequestInit) => {
        void path;
        void init;
        return new Response(JSON.stringify({ data: {} }));
      },
    );

    await saveStatisticianChecklist(
      "7/8",
      { design_fit: true, remarks: "Suitable design." },
      fetchMock,
    );
    await signOffMethodology("7/8", fetchMock);
    await returnMethodologyForClarification(
      "7/8",
      "Clarify the sample frame.",
      fetchMock,
    );
    await listRepositoryCatalog(
      { search: "records", category: 2, page: 3, per_page: 25 },
      fetchMock,
    );
    await listComplianceQueue(fetchMock);
    await decideCompliance(
      42,
      { review_status: "endorsed", format_compliant: true },
      fetchMock,
    );
    await listOfficeUsers(
      { search: "Ada", role: "researcher", page: 2, per_page: 50 },
      fetchMock,
    );
    await updateOfficeUserAccess("office/user", "active", fetchMock);
    await getInstitutionalReport(fetchMock);
    await listPrivacyLogs(fetchMock);
    await recordPrivacyLog(
      { action: "data_export", details: "Requested export." },
      fetchMock,
    );

    expect(
      fetchMock.mock.calls.map(([path, init]) => ({
        path: String(path),
        method: (init as RequestInit).method ?? "GET",
        body: (init as RequestInit).body,
      })),
    ).toEqual([
      {
        path: "/api/statistician/methodology/7%2F8",
        method: "PUT",
        body: JSON.stringify({ design_fit: true, remarks: "Suitable design." }),
      },
      {
        path: "/api/statistician/methodology/7%2F8/sign-off",
        method: "POST",
        body: JSON.stringify({}),
      },
      {
        path: "/api/statistician/methodology/7%2F8/return",
        method: "POST",
        body: JSON.stringify({ remarks: "Clarify the sample frame." }),
      },
      {
        path: "/api/librarian/catalog?search=records&category=2&page=3&per_page=25",
        method: "GET",
        body: undefined,
      },
      { path: "/api/office/compliance", method: "GET", body: undefined },
      {
        path: "/api/office/compliance/42",
        method: "PUT",
        body: JSON.stringify({
          review_status: "endorsed",
          format_compliant: true,
        }),
      },
      {
        path: "/api/office/users?search=Ada&role=researcher&page=2&per_page=50",
        method: "GET",
        body: undefined,
      },
      {
        path: "/api/office/users/office%2Fuser",
        method: "PATCH",
        body: JSON.stringify({ access_status: "active" }),
      },
      { path: "/api/office/reports", method: "GET", body: undefined },
      {
        path: "/api/office/privacy-logs",
        method: "GET",
        body: undefined,
      },
      {
        path: "/api/office/privacy-logs",
        method: "POST",
        body: JSON.stringify({
          action: "data_export",
          details: "Requested export.",
        }),
      },
    ]);
  });
});

describe("administrator internal research API", () => {
  const research = {
    id: 42,
    submitted_by: "owner-42",
    title: "Internal study",
    abstract: "Internal abstract",
    keywords: "internal, study",
    publication_year: 2026,
    research_stage: "ongoing" as const,
    submission_status: "draft" as const,
    archive_status: "not_archived" as const,
    visibility: "private" as const,
  };
  const revision = {
    id: 9,
    revision_number: 2,
    revision_remarks: "Clarify methods.",
    revision_status: "requested" as const,
  };
  const validation = {
    id: 7,
    research_document_id: 42,
    similarity_result_id: null,
    validated_by: null,
    validation_status: "pending" as const,
    adviser_remarks: null,
    validated_at: null,
  };

  it("uses exact methods, relative paths, bodies, and authenticated credentials", async () => {
    const fetchMock = vi.fn(async (path: URL | RequestInfo) => {
      const requestPath = String(path);
      if (requestPath.endsWith("/revisions")) {
        return new Response(JSON.stringify({ data: [revision] }));
      }
      if (requestPath.endsWith("/validation")) {
        return new Response(JSON.stringify({ data: [validation] }));
      }
      return new Response(JSON.stringify({ data: research }));
    });
    const metadata = {
      title: "Revised internal study",
      abstract: "Updated abstract",
      keywords: "revised",
      publication_year: 2027,
      research_stage: "completed" as const,
    };

    await expect(getInternalResearch(42, fetchMock)).resolves.toEqual(research);
    await expect(
      updateInternalResearch(42, metadata, fetchMock),
    ).resolves.toEqual(research);
    await expect(submitInternalResearch(42, fetchMock)).resolves.toEqual(
      research,
    );
    await expect(
      transitionInternalResearch(42, "under_review", fetchMock),
    ).resolves.toEqual(research);
    await expect(
      archiveInternalResearch(42, "public", fetchMock),
    ).resolves.toEqual(research);
    await expect(listResearchRevisions(42, fetchMock)).resolves.toEqual([
      revision,
    ]);
    await expect(resubmitResearchRevision(42, 9, fetchMock)).resolves.toEqual(
      research,
    );
    await expect(listTitleValidations(42, fetchMock)).resolves.toEqual([
      validation,
    ]);
    await expect(
      updateTitleValidation(
        42,
        7,
        {
          validation_status: "approved",
          adviser_remarks: "Looks good.",
          similarity_result_id: 8,
        },
        fetchMock,
      ),
    ).resolves.toEqual(research);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/research/42",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/research/42",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(metadata),
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/research/42/submit",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/research/42/status",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ submission_status: "under_review" }),
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/research/42/archive",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ visibility: "public" }),
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/research/42/revisions",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      "/api/research/42/revisions/9/resubmit",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({}),
        credentials: "include",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      "/api/research/42/validation",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      "/api/research/42/validation/7",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          validation_status: "approved",
          adviser_remarks: "Looks good.",
          similarity_result_id: 8,
        }),
        credentials: "include",
      }),
    );
  });

  it("uses the contextual resource endpoints and preserves multipart upload headers", async () => {
    const author = {
      id: 1,
      user_id: null,
      author_name: "Author",
      author_order: 1,
      is_corresponding_author: true,
    };
    const reviewer = {
      id: 2,
      reviewer_id: "11111111-1111-4111-8111-111111111111",
      review_role: "adviser" as const,
      is_active: true,
      assigned_by: "office",
    };
    const document = {
      id: 3,
      research_document_id: 42,
      document_type: "final_manuscript" as const,
      version_number: 1,
      original_filename: "study.pdf",
      file_extension: "pdf",
      mime_type: "application/pdf",
      file_size: 1,
      is_current: true,
      uploaded_at: null,
    };
    const feedback = {
      id: 4,
      research_document_id: 42,
      user_id: "office",
      document_file_id: null,
      comment: "Review",
      feedback_type: "comment" as const,
      feedback_status: "open" as const,
      created_at: null,
    };
    const monitoring = {
      id: 5,
      research_document_id: 42,
      performed_by: "office",
      activity_type: "RESEARCH_CREATED",
      remarks: null,
      previous_status: null,
      new_status: "draft",
      monitoring_status: "open",
      activity_date: null,
    };
    const fetchMock = vi.fn(
      async (path: URL | RequestInfo, init?: RequestInit) => {
        const value = String(path);
        const data = value.endsWith("/authors")
          ? [author]
          : value.endsWith("/reviewers")
            ? [reviewer]
            : value.endsWith("/files")
              ? init?.method === "POST"
                ? document
                : [document]
              : value.endsWith("/feedback")
                ? init?.method === "POST"
                  ? feedback
                  : [feedback]
                : value.endsWith("/monitoring")
                  ? [monitoring]
                  : feedback;
        return new Response(JSON.stringify({ data }));
      },
    );

    await expect(listResearchAuthors(42, fetchMock)).resolves.toEqual([author]);
    await expect(
      replaceResearchAuthors(
        42,
        [
          {
            user_id: null,
            author_name: "Author",
            is_corresponding_author: true,
          },
        ],
        fetchMock,
      ),
    ).resolves.toEqual([author]);
    await expect(listReviewAssignments(42, fetchMock)).resolves.toEqual([
      reviewer,
    ]);
    await expect(
      replaceReviewAssignments(
        42,
        [{ reviewer_id: reviewer.reviewer_id, review_role: "adviser" }],
        fetchMock,
      ),
    ).resolves.toEqual([reviewer]);
    await expect(listResearchFiles(42, fetchMock)).resolves.toEqual([document]);
    for (const documentType of [
      "title_proposal",
      "draft",
      "chapter",
      "revised_manuscript",
      "final_manuscript",
      "attachment",
    ] as const) {
      await expect(
        uploadResearchFile(
          42,
          new File(["pdf"], "study.pdf", { type: "application/pdf" }),
          documentType,
          fetchMock,
        ),
      ).resolves.toEqual(document);
    }
    await expect(listFeedback(42, fetchMock)).resolves.toEqual([feedback]);
    await expect(
      createFeedback(
        42,
        { comment: "Review", feedback_type: "comment" },
        fetchMock,
      ),
    ).resolves.toEqual(feedback);
    await expect(
      updateFeedbackStatus(42, 4, "resolved", fetchMock),
    ).resolves.toEqual(feedback);
    await expect(listMonitoringLogs(42, fetchMock)).resolves.toEqual([
      monitoring,
    ]);
    expect(researchFileDownloadUrl(42, 3)).toBe(
      "/api/research/42/files/3/download",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/authors",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          authors: [
            {
              user_id: null,
              author_name: "Author",
              is_corresponding_author: true,
            },
          ],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/reviewers",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          reviewers: [
            { reviewer_id: reviewer.reviewer_id, review_role: "adviser" },
          ],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/files",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    const uploadCalls = fetchMock.mock.calls.filter(
      ([path, init]) =>
        String(path).endsWith("/files") &&
        (init as RequestInit).method === "POST",
    );
    expect(uploadCalls).toHaveLength(6);
    uploadCalls.forEach(([, init], index) => {
      expect(
        new Headers((init as RequestInit).headers).has("Content-Type"),
      ).toBe(false);
      expect(
        ((init as RequestInit).body as FormData).get("document_type"),
      ).toBe(
        [
          "title_proposal",
          "draft",
          "chapter",
          "revised_manuscript",
          "final_manuscript",
          "attachment",
        ][index],
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/feedback/4",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ feedback_status: "resolved" }),
      }),
    );
  });
});

describe("similarity API", () => {
  const similarityResult = {
    id: 8,
    source_research_id: 42,
    matched_research_id: 43,
    source_title: "Source title",
    matched_title: "Matched title",
    tfidf_score: null,
    cosine_score: "0.710000",
    fasttext_score: "0.820000",
    final_similarity_score: "0.760000",
    title_similarity_score: "0.760000",
    title_similarity_percentage: "76.000000",
    title_weight: "0.300000000000",
    title_weighted_contribution: "22.800000",
    content_similarity_score: "0.760000",
    content_similarity_percentage: "76.000000",
    content_weight: "0.700000000000",
    content_weighted_contribution: "53.200000",
    overall_similarity_score: "0.760000",
    overall_similarity_percentage: "76.000000",
    classification: "high",
    overall_flagged: true,
    title_match_alert: false,
    adviser_review_required: true,
    flag_reason: "overall_high_similarity",
    threshold: "0.700000",
    contextual_analysis: "Related terms appear in the same research context.",
    matched_terms: ["research"],
    analysis_type: "title",
    analyzed_at: "2026-08-14T12:00:00.000000Z",
  };

  it("loads only persisted results for the selected research document", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [similarityResult] })),
    );

    await expect(
      listPersistedSimilarityResults(42, fetchMock),
    ).resolves.toEqual([similarityResult]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/similarity",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("posts a title similarity check for the selected research document", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(null, { status: 204 });
      },
    );

    await expect(
      runTitleSimilarityCheck("42", fetchMock),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/42/similarity/check",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({}),
        credentials: "include",
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({});
    expect(body).not.toHaveProperty("classification");
    expect(body).not.toHaveProperty("overall_similarity_score");
  });

  it("posts only a submitted query to the authenticated duplicate-check endpoint", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return new Response(JSON.stringify({ data: [] }));
      },
    );

    await expect(
      checkTitleQuerySimilarity("inventory management", fetchMock),
    ).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/similarity/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ q: "inventory management" }),
        credentials: "include",
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).not.toHaveProperty("overall_similarity_score");
    expect(body).not.toHaveProperty("classification");
    expect(body).not.toHaveProperty("overall_flagged");
  });
});

describe("own profile API", () => {
  it("reads and updates the current profile", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: profileSession })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: profileSession })),
      );

    await expect(getOwnProfile(fetchMock)).resolves.toEqual(profileSession);
    await expect(
      updateOwnProfile(
        { first_name: "Ada", middle_name: null, last_name: "Lovelace" },
        fetchMock,
      ),
    ).resolves.toEqual(profileSession);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/profile",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          first_name: "Ada",
          middle_name: null,
          last_name: "Lovelace",
        }),
      }),
    );
  });

  it("uploads and removes the current profile photo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: profileSession })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { ...profileSession, profilePhotoUrl: null },
          }),
        ),
      );
    const photo = new File(["image"], "avatar.png", { type: "image/png" });

    await uploadOwnProfilePhoto(photo, fetchMock);
    await deleteOwnProfilePhoto(fetchMock);

    const uploadInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(uploadInit.method).toBe("POST");
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect((uploadInit.body as FormData).get("photo")).toBe(photo);
    expect(new Headers(uploadInit.headers).has("Content-Type")).toBe(false);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/profile/photo",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("instructor section member API", () => {
  const member = {
    id: "student-id",
    email: "student@example.edu",
    student_employee_id: "2023-0455",
    first_name: "Anna",
    middle_name: null,
    last_name: "Student",
    added_at: "2026-08-18T00:00:00.000000Z",
  };

  it("lists section members through the Laravel members endpoint", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [member] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listSectionMembers(7)).resolves.toEqual([member]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/instructor/sections/7/members",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("adds student researchers with a PUT payload and removes them with a DELETE", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              id: 7,
              name: "CS-101",
              academic_year: null,
              is_active: true,
              documents_count: 0,
              members_count: 1,
              created_at: null,
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(addSectionMembers(7, ["student-id"])).resolves.toMatchObject({
      members_count: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/instructor/sections/7/members",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ user_ids: ["student-id"] }),
      }),
    );

    await expect(removeSectionMember(7, "student-id")).resolves.toMatchObject({
      members_count: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/instructor/sections/7/members/student-id",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("searches active researchers for the student picker", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [member] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listInstructorStudents("ann")).resolves.toEqual([member]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/instructor/students?search=ann",
      expect.objectContaining({ credentials: "include" }),
    );
    await expect(listInstructorStudents()).resolves.toEqual([member]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/instructor/students",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("assigns documents through the matching instructor endpoint", async () => {
    const section = {
      id: 7,
      name: "CS-101",
      academic_year: null,
      is_active: true,
      documents_count: 2,
      members_count: 1,
      created_at: null,
    };
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: section })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(assignSectionDocuments(7, [42, 43])).resolves.toEqual(section);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/instructor/sections/7/documents",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ research_document_ids: [42, 43] }),
      }),
    );
  });

  it("lists research titles available to a class section", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAssignableSectionDocuments(7)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/instructor/sections/7/available-documents",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("opens a research-title folder and manages its assigned students", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [member] })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listSectionDocumentMembers(7, 42)).resolves.toEqual([member]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/instructor/sections/7/documents/42/members",
      expect.objectContaining({ credentials: "include" }),
    );
    await expect(addSectionDocumentMember(7, 42, member.id)).resolves.toEqual([
      member,
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/instructor/sections/7/documents/42/members/student-id",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({}) }),
    );
    await expect(
      removeSectionDocumentMember(7, 42, member.id),
    ).resolves.toEqual([member]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/instructor/sections/7/documents/42/members/student-id",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
