import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoleSidebarPage from "./RoleSidebarPages";

type Handler = (input: string, init?: RequestInit) => Response;

const pageResponse = (data: unknown[] = []) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: {
    current_page: 1,
    from: data.length ? 1 : null,
    last_page: 1,
    links: [],
    path: "/api/records",
    per_page: 25,
    to: data.length || null,
    total: data.length,
  },
});

beforeEach(() => vi.unstubAllGlobals());

function stubFetch(routes: Array<[RegExp, Handler]>) {
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      for (const [pattern, handler] of routes) {
        if (pattern.test(path)) return handler(path, init);
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const emptyData = () => new Response(JSON.stringify({ data: [] }));
const emptyPage = () => new Response(JSON.stringify(pageResponse()));
const listData = (data: unknown[]) => new Response(JSON.stringify({ data }));
const draftResource = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  submitted_by: "member@example.test",
  category_id: 2,
  title: "My study title",
  normalized_title: null,
  abstract: "A study about learning.",
  keywords: "learning, education",
  publication_year: 2026,
  institution_name: null,
  institution_location: null,
  academic_unit: null,
  degree_program: null,
  manuscript_date_label: null,
  abstract_provenance: null,
  research_stage: "title_proposal",
  submission_status: "draft",
  archive_status: "not_archived",
  visibility: "private",
  submitted_at: null,
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
  ...overrides,
});

const institutionalReport = () =>
  new Response(
    JSON.stringify({
      data: {
        schema_version: 1,
        counts: {
          total_users: 0,
          active_users: 0,
          pending_archiving: 0,
          archived: 0,
          flagged_similarity: 0,
          audit_events: 0,
          evaluations_submitted: 0,
          methodology_signed_off: 0,
        },
        by_academic_unit: [],
        by_status: [],
      },
    }),
  );

const programReport = () =>
  new Response(
    JSON.stringify({
      data: {
        schema_version: 1,
        counts: {
          active_instructors: 0,
          active_advisers: 0,
          active_researchers: 0,
          draft: 0,
          submitted: 0,
          under_review: 0,
          revision_required: 0,
          approved: 0,
          archived: 0,
          flagged_similarity: 0,
          defenses_scheduled: 0,
          defenses_completed: 0,
          evaluations_submitted: 0,
          methodology_signed_off: 0,
        },
        by_section: [],
        adviser_load: [],
      },
    }),
  );

function roleRoutes(): Array<[RegExp, Handler]> {
  return [
    [
      /\/api\/adviser\/(advisees|similarity-alerts|feedback-history)$/,
      emptyData,
    ],
    [
      /\/api\/instructor\/(sections|submissions|similarity-overview|class-reports)$/,
      emptyData,
    ],
    [/\/api\/panel\/(schedule|assignments|history)$/, emptyData],
    [/\/api\/statistician\/(queue|signoffs)$/, emptyData],
    [/\/api\/coordinator\/schedules(\?|$)/, emptyData],
    [/\/api\/coordinator\/duplicate-flags$/, emptyData],
    [/\/api\/coordinator\/adviser-load$/, emptyData],
    [/\/api\/coordinator\/reports$/, programReport],
    [
      /\/api\/coordinator\/instructors$/,
      () => new Response(JSON.stringify({ users: [] })),
    ],
    [/\/api\/librarian\/catalog(\?|$)/, emptyPage],
    [/\/api\/librarian\/metadata-standards$/, emptyData],
    [/\/api\/librarian\/retention-logs$/, emptyData],
    [/\/api\/office\/reports$/, institutionalReport],
    [/\/api\/office\/users(\?|$)/, emptyPage],
    [/\/api\/office\/privacy-logs$/, emptyData],
    [/\/api\/office\/compliance$/, emptyData],
    [/\/api\/academics\/(categories|recommendations)$/, emptyData],
    [/\/api\/academics\/library$/, emptyData],
    [/\/api\/repository\?per_page=50/, emptyPage],
    [/\/api\/research\?/, emptyPage],
    [/\/api\/categories$/, emptyData],
  ];
}

describe("role workspace pages", () => {
  it("opens adviser reviews and matched studies from adviser pages", async () => {
    const navigate = vi.fn();
    stubFetch([
      [
        /\/api\/adviser\/similarity-alerts$/,
        () =>
          listData([
            {
              id: 4,
              research_document_id: 7,
              matched_research_id: 8,
              title: "Proposed title",
              submission_status: "under_review",
              matched_title: "Existing study",
              overall_similarity_score: "0.81",
              classification: "high",
              adviser_review_required: true,
              analyzed_at: "2026-09-04T08:00:00Z",
            },
          ]),
      ],
    ]);

    render(
      <RoleSidebarPage
        role="adviser"
        selectedNav="Similarity Alerts"
        navigate={navigate}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open review" }));
    expect(navigate).toHaveBeenCalledWith("/research/7");
    fireEvent.click(screen.getByRole("button", { name: "View matched study" }));
    expect(navigate).toHaveBeenCalledWith("/catalog?q=Existing%20study");
  });

  it.each([
    {
      role: "adviser",
      destinations: [
        ["My Advisees", "My advisees"],
        ["Similarity Alerts", "Similarity alerts"],
        ["Feedback History", "Feedback history"],
      ],
    },
    {
      role: "instructor",
      destinations: [
        ["My Sections", "My sections"],
        ["Assigned Submissions", "Assigned submissions"],
        ["Similarity Overview", "Similarity overview"],
        ["Class Reports", "Class reports"],
      ],
    },
    {
      role: "panel",
      destinations: [
        ["Defense Schedule", "Defense schedule"],
        ["Evaluation Form", "Evaluation form"],
        ["Panel History", "Panel history"],
      ],
    },
    {
      role: "statistician",
      destinations: [
        ["Methodology Checklist", "Methodology checklist"],
        ["Sign-offs Issued", "Sign-offs issued"],
      ],
    },
    {
      role: "coordinator",
      destinations: [
        ["Schedules", "Defense schedules"],
        ["Duplicate Flags", "Duplicate flags"],
        ["Adviser Load", "Adviser load"],
        ["Account Roles", "Account roles"],
        ["Reports", "Program reports"],
      ],
    },
    {
      role: "librarian",
      destinations: [
        ["Repository Catalog", "Repository catalog"],
        ["Metadata Standards", "Metadata standards"],
        ["Retention & Compliance", "Retention & compliance"],
      ],
    },
    {
      role: "research-office",
      destinations: [
        ["Institutional Overview", "Institutional overview"],
        ["Import Manuscript", "Import Manuscript"],
        ["User & Role Management", "User & role management"],
        ["Reports & Exports", "Reports & exports"],
        ["Data Privacy Log", "Data privacy log"],
      ],
    },
    {
      role: "academics",
      destinations: [
        ["Search", "Search"],
        ["Browse by Category", "Browse by category"],
      ],
    },
    {
      role: "researcher",
      destinations: [
        ["My Research", "My submissions"],
        ["Similarity Check", "Similarity check"],
        ["Related Studies", "Related studies"],
      ],
    },
  ] as Array<{
    role: Parameters<typeof RoleSidebarPage>[0]["role"];
    destinations: Array<[string, string]>;
  }>)(
    "renders each $role sidebar destination from its live endpoint",
    async ({ role, destinations }) => {
      stubFetch(roleRoutes());
      for (const [selectedNav, heading] of destinations) {
        const { unmount } = render(
          <RoleSidebarPage
            role={role}
            selectedNav={selectedNav}
            navigate={vi.fn()}
          />,
        );
        expect(
          await screen.findByRole("heading", { name: heading }),
        ).toBeInTheDocument();
        unmount();
      }
    },
  );

  it("filters assigned instructor submissions by workflow status", async () => {
    stubFetch([
      [
        /\/api\/instructor\/submissions$/,
        () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  research_document_id: 1,
                  title: "Submitted title",
                  research_stage: "title_proposal",
                  submission_status: "submitted",
                  submitter: "Student One",
                  updated_at: null,
                },
                {
                  research_document_id: 2,
                  title: "Reviewing title",
                  research_stage: "ongoing",
                  submission_status: "under_review",
                  submitter: "Student Two",
                  updated_at: null,
                },
              ],
            }),
          ),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="Assigned Submissions"
        navigate={vi.fn()}
      />,
    );

    expect(await screen.findByText("Submitted title")).toBeInTheDocument();
    expect(screen.getByText("Reviewing title")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Submission status"), {
      target: { value: "under_review" },
    });
    expect(screen.queryByText("Submitted title")).not.toBeInTheDocument();
    expect(screen.getByText("Reviewing title")).toBeInTheDocument();
  });

  it("creates a research draft through the researcher endpoint", async () => {
    const draft = {
      id: 7,
      submitted_by: "member@example.test",
      category_id: 2,
      title: "My study title",
      normalized_title: null,
      abstract: "A study about learning.",
      keywords: "learning, education",
      publication_year: 2026,
      institution_name: null,
      institution_location: null,
      academic_unit: null,
      degree_program: null,
      manuscript_date_label: null,
      abstract_provenance: null,
      research_stage: "title_proposal",
      submission_status: "draft",
      archive_status: "not_archived",
      visibility: "private",
      submitted_at: null,
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
    const fetchMock = stubFetch([
      [/\/api\/research\?/, emptyPage],
      [
        /\/api\/categories$/,
        () =>
          listData([
            {
              id: 2,
              name: "Education",
              slug: "education",
              description: null,
              is_active: true,
            },
          ]),
      ],
      [
        /^\/api\/research$/,
        (_input, init) =>
          init?.method === "POST"
            ? new Response(JSON.stringify({ data: draft }), { status: 201 })
            : emptyPage(),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "My submissions" });
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New submission" }));
    expect(
      await screen.findByRole("heading", { name: "New submission" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Research submission" }),
    ).toHaveClass("submission-form");
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My study title" },
    });
    fireEvent.change(screen.getByLabelText("Abstract"), {
      target: { value: "A study about learning." },
    });
    fireEvent.change(screen.getByLabelText("Keywords"), {
      target: { value: "learning, education" },
    });
    fireEvent.change(screen.getByLabelText("Publication year"), {
      target: { value: "2026" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Author name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText('Draft "My study title" has been created.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          category_id: 2,
          title: "My study title",
          abstract: "A study about learning.",
          keywords: "learning, education",
          publication_year: 2026,
          research_stage: "title_proposal",
          authors: [
            {
              author_name: "Ada Lovelace",
              user_id: null,
              is_corresponding_author: false,
            },
          ],
        }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "New submission" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("creates a draft, uploads its manuscript, and submits it in order", async () => {
    const draft = draftResource();
    const submitted = draftResource({
      submission_status: "submitted",
      submitted_at: "2026-08-18T10:00:00.000000Z",
    });
    const fetchMock = stubFetch([
      [/\/api\/research\?/, emptyPage],
      [/\/api\/categories$/, () => listData([draft.category])],
      [
        /^\/api\/research$/,
        (_input, init) =>
          init?.method === "POST"
            ? new Response(JSON.stringify({ data: draft }), { status: 201 })
            : emptyPage(),
      ],
      [
        /^\/api\/research\/7\/files$/,
        (_input, init) => {
          expect(init?.method).toBe("POST");
          expect(init?.body).toBeInstanceOf(FormData);
          expect((init?.body as FormData).get("document_type")).toBe(
            "title_proposal",
          );
          expect((init?.body as FormData).get("file")).toBeInstanceOf(File);
          return new Response(
            JSON.stringify({
              data: {
                id: 9,
                research_document_id: 7,
                document_type: "title_proposal",
                version_number: 1,
                original_filename: "proposal.pdf",
                file_extension: "pdf",
                mime_type: "application/pdf",
                file_size: 9,
                is_current: true,
                uploaded_at: "2026-08-18T10:00:00.000000Z",
              },
            }),
            { status: 201 },
          );
        },
      ],
      [
        /^\/api\/research\/7\/submit$/,
        (_input, init) => {
          expect(init?.method).toBe("POST");
          return new Response(JSON.stringify({ data: submitted }));
        },
      ],
    ]);

    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "My submissions" });
    fireEvent.click(screen.getByRole("button", { name: "New submission" }));
    await screen.findByRole("heading", { name: "New submission" });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My study title" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Author name"), {
      target: { value: "Ada Lovelace" },
    });
    const manuscript = new File(["%PDF test"], "proposal.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("PDF or DOCX (maximum 25 MB)"), {
      target: { files: [manuscript] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and submit" }));

    expect(
      await screen.findByText('"My study title" has been submitted.'),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter(
          (path) =>
            path !== "/api/categories" && !path.includes("/api/research?"),
        ),
    ).toEqual([
      "/api/research",
      "/api/research/7/files",
      "/api/research/7/submit",
    ]);
  });

  it("edits an existing draft from My Submissions and reloads the row", async () => {
    const draft = draftResource();
    const updated = draftResource({ title: "Updated study title" });
    let listRequests = 0;
    const fetchMock = stubFetch([
      [/\/api\/categories$/, () => listData([draft.category])],
      [
        /\/api\/research\?/,
        () => {
          listRequests += 1;
          return new Response(
            JSON.stringify(
              pageResponse([listRequests === 1 ? draft : updated]),
            ),
          );
        },
      ],
      [
        /^\/api\/research\/7$/,
        (_input, init) =>
          init?.method === "PATCH"
            ? new Response(JSON.stringify({ data: updated }))
            : new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
                status: 405,
              }),
      ],
    ]);

    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(
      await screen.findByRole("heading", { name: "Edit submission" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Updated study title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update draft" }));

    expect(
      await screen.findByText('Draft "Updated study title" has been updated.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(listRequests).toBeGreaterThan(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research/7",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"title":"Updated study title"'),
      }),
    );
    expect(
      screen.queryByRole("heading", { name: "Edit submission" }),
    ).not.toBeInTheDocument();
  });

  it("rejects unsupported manuscript files before creating a draft", async () => {
    const fetchMock = stubFetch([
      [/\/api\/research\?/, emptyPage],
      [/\/api\/categories$/, () => listData([])],
      [/^\/api\/research$/, () => new Response(JSON.stringify({ data: {} }))],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "My submissions" });
    fireEvent.click(screen.getByRole("button", { name: "New submission" }));
    await screen.findByRole("heading", { name: "New submission" });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Unsafe upload" },
    });
    fireEvent.change(screen.getByLabelText("Author name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("PDF or DOCX (maximum 25 MB)"), {
      target: { files: [new File(["bad"], "payload.exe")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await screen.findByText("The manuscript must be a PDF or DOCX file."),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([input]) => String(input) === "/api/research",
      ),
    ).toHaveLength(0);
  });

  it("submits a draft from My Submissions and refetches the authoritative row", async () => {
    const draft = {
      id: 7,
      submitted_by: "member@example.test",
      category_id: 2,
      title: "My study title",
      normalized_title: null,
      abstract: null,
      keywords: null,
      publication_year: null,
      institution_name: null,
      institution_location: null,
      academic_unit: null,
      degree_program: null,
      manuscript_date_label: null,
      abstract_provenance: null,
      research_stage: "title_proposal",
      submission_status: "draft",
      archive_status: "not_archived",
      visibility: "private",
      submitted_at: null,
      approved_at: null,
      archived_at: null,
      authors: [],
      category: null,
    };
    const submitted = {
      ...draft,
      submission_status: "submitted",
      submitted_at: "2026-08-18T10:00:00.000000Z",
    };
    let listRequests = 0;
    stubFetch([
      [
        /^\/api\/research\/7\/submit$/,
        () => new Response(JSON.stringify({ data: submitted })),
      ],
      [
        /\/api\/research\?/,
        () => {
          listRequests += 1;
          return new Response(
            JSON.stringify(
              pageResponse([listRequests === 1 ? draft : submitted]),
            ),
          );
        },
      ],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "My submissions" }),
    ).toBeInTheDocument();
    const submitButton = await screen.findByRole("button", { name: "Submit" });
    fireEvent.click(submitButton);
    expect(
      await screen.findByText('"My study title" has been submitted.'),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/research/7/submit",
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    await waitFor(() => expect(listRequests).toBeGreaterThan(1));
    expect(
      screen.queryByRole("button", { name: "Submit" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Submitted")).toHaveLength(3);
  });

  it("opens and edits a revision-required submission without offering the draft submit action", async () => {
    const revision = draftResource({ submission_status: "revision_required" });
    const navigate = vi.fn();
    stubFetch([
      [
        /\/api\/research\?/,
        () => new Response(JSON.stringify(pageResponse([revision]))),
      ],
      [/\/api\/categories$/, () => listData([revision.category])],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={navigate}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Open record" }));
    expect(navigate).toHaveBeenCalledWith("/research/7");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      await screen.findByRole("heading", { name: "Edit submission" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save and submit" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Document type")).toHaveValue(
      "revised_manuscript",
    );
  });

  it("retries a failed category load and recovers with a second GET", async () => {
    let categoryRequests = 0;
    const fetchMock = stubFetch([
      [/\/api\/research\?/, emptyPage],
      [
        /\/api\/categories$/,
        () => {
          categoryRequests += 1;
          return categoryRequests === 1
            ? new Response(JSON.stringify({ error: "UNAVAILABLE" }), {
                status: 503,
              })
            : listData([draftResource().category]);
        },
      ],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "New submission" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Category")).toBeInTheDocument();
    await waitFor(() => expect(categoryRequests).toBe(2));
    expect(
      fetchMock.mock.calls.filter(
        ([path]) => String(path) === "/api/categories",
      ),
    ).toHaveLength(2);
  });

  it("scopes related studies to owned submissions and opens matched catalog titles", async () => {
    const owned = draftResource();
    const navigate = vi.fn();
    const fetchMock = stubFetch([
      [
        /\/api\/research\?mine=1&page=1&per_page=10$/,
        () => new Response(JSON.stringify(pageResponse([owned]))),
      ],
      [
        /\/api\/research\/7\/similarity$/,
        () =>
          listData([
            {
              id: 1,
              source_research_id: 7,
              matched_research_id: 8,
              source_title: owned.title,
              matched_title: "Catalog match",
              tfidf_score: "0.5",
              title_similarity_score: "0.5",
              content_similarity_score: "0.5",
              cosine_score: "0.5",
              fasttext_score: "0.5",
              final_similarity_score: "0.5",
              score_status: "scored",
              threshold: "0.7",
              contextual_analysis: null,
              matched_terms: [],
              analysis_type: "document",
              algorithm_version: "v1",
              analyzed_at: null,
            },
          ]),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="Related Studies"
        navigate={navigate}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Select a record" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/research?mine=1&page=1&per_page=10",
      expect.anything(),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Open workspace" }),
    );
    expect(navigate).toHaveBeenCalledWith("/research/7");
    fireEvent.click(
      await screen.findByRole("button", { name: "Search catalog" }),
    );
    expect(navigate).toHaveBeenCalledWith("/catalog?q=Catalog%20match");
  });

  it("shows an error instead of mock submissions after a failed Researcher list request", async () => {
    const fetchMock = stubFetch([
      [
        /\/api\/research\?/,
        () =>
          new Response(
            JSON.stringify({ error: "RESEARCH_TABLE_UNAVAILABLE" }),
            {
              status: 500,
            },
          ),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your submissions are unavailable",
    );
    expect(
      screen.queryByText(/ResearchNAV: A Web-Based Research Repository System/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open record" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New submission" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Submit" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("labels one-cent rounded similarity contributions as an approximate displayed equation", async () => {
    stubFetch([
      [
        /\/api\/similarity\/query$/,
        () =>
          listData([
            {
              id: 42,
              title: "Rounded match",
              authors: [],
              publication_year: 2026,
              institution_name: null,
              institution_location: null,
              academic_unit: null,
              degree_program: null,
              category: { name: "Education" },
              abstract: null,
              keywords: [],
              research_stage: "completed",
              title_similarity_score: "0.292100",
              title_similarity_percentage: "29.210000",
              content_similarity_score: "0.234400",
              content_similarity_percentage: "23.440000",
              title_weight: "0.300000000000",
              content_weight: "0.700000000000",
              title_weighted_contribution: "8.765000",
              content_weighted_contribution: "16.405000",
              overall_similarity_score: "0.251700",
              overall_similarity_percentage: "25.170000",
              classification: "low",
              overall_flagged: false,
              title_match_alert: false,
              adviser_review_required: false,
              flag_reason: "not_flagged",
              algorithm_version: "weighted-v1",
              score_status: "scored",
            },
          ]),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="Similarity Check"
        navigate={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "rounded" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Check for duplicates" }),
    );

    expect(
      await screen.findByText("Displayed overall ≈ 8.77 + 16.41 ≈ 25.17%"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Overall =/)).not.toBeInTheDocument();
  });

  it("searches the repository and saves a match to the academics library", async () => {
    const fetchMock = stubFetch([
      [
        /\/api\/repository\/similarity$/,
        (_input, init) =>
          init?.method === "POST"
            ? new Response(
                JSON.stringify({
                  data: [
                    {
                      id: 42,
                      title: "Related work",
                      authors: [
                        { author_name: "Ada Lovelace", author_order: 1 },
                        { author_name: "Grace Hopper", author_order: 2 },
                      ],
                      publication_year: 2025,
                      query_similarity_score: "0.785",
                      academic_unit: "College of Education",
                      degree_program: null,
                      institution_name: null,
                      institution_location: null,
                      category: "Education",
                      abstract: null,
                      keywords: ["related", "work"],
                      research_stage: "completed",
                      manuscript_date_label: null,
                      abstract_provenance: null,
                    },
                  ],
                }),
              )
            : emptyPage(),
      ],
      [
        /\/api\/academics\/library$/,
        (_input, init) =>
          init?.method === "POST"
            ? new Response(
                JSON.stringify({
                  data: {
                    id: 5,
                    research_document_id: 42,
                    title: "Related work",
                    publication_year: 2025,
                    saved_at: "2026-08-18T10:00:00.000000Z",
                  },
                }),
                { status: 201 },
              )
            : emptyData(),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="academics"
        selectedNav="Search"
        navigate={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Search query"), {
      target: { value: "related" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search repository" }));
    expect(
      await screen.findByText("Ada Lovelace, Grace Hopper"),
    ).toBeInTheDocument();
    expect(screen.getByText("78.50%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save to library" }));
    expect(
      await screen.findByText("Saved to your library."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/academics/library",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ research_document_id: 42 }),
      }),
    );
  });

  it("saves the statistician methodology checklist through the live endpoint", async () => {
    const fetchMock = stubFetch([
      [
        /\/api\/statistician\/queue$/,
        () =>
          listData([
            {
              research_document_id: 7,
              title: "Sample study",
              authors: "Ada Lovelace",
              research_stage: "ongoing",
              submission_status: "under_review",
              methodology_review: null,
            },
          ]),
      ],
      [
        /\/api\/statistician\/methodology\/7$/,
        () =>
          new Response(
            JSON.stringify({
              data: {
                id: 1,
                research_document_id: 7,
                title: "Sample study",
                design_fit: true,
                sample_size: null,
                instrument_validity: null,
                analysis_plan: null,
                remarks: null,
                review_status: "in_progress",
                signed_off_at: null,
              },
            }),
          ),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="statistician"
        selectedNav="Methodology Checklist"
        navigate={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Sample study/ }),
    );
    fireEvent.click(screen.getByLabelText("Design fit"));
    fireEvent.click(screen.getByRole("button", { name: "Save checklist" }));
    expect(await screen.findByText("Checklist saved.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/statistician/methodology/7",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          design_fit: true,
          sample_size: null,
          instrument_validity: null,
          analysis_plan: null,
          remarks: null,
        }),
      }),
    );
  });

  it("records a retention action and renders the refreshed log", async () => {
    const logEntry = {
      id: 1,
      action: "final_archived",
      research_document_id: 42,
      title: "My study title",
      remarks: "Archived",
      performed_by: "librarian@example.test",
      activity_date: "2026-08-18T10:00:00.000000Z",
    };
    let listRequests = 0;
    const fetchMock = stubFetch([
      [
        /\/api\/librarian\/retention-logs$/,
        (_input, init) =>
          init?.method === "POST"
            ? new Response(JSON.stringify({ data: logEntry }), { status: 201 })
            : (() => {
                listRequests += 1;
                return listData(listRequests === 1 ? [] : [logEntry]);
              })(),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="librarian"
        selectedNav="Retention & Compliance"
        navigate={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Research document ID"), {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByLabelText("Action"), {
      target: { value: "final_archived" },
    });
    fireEvent.change(screen.getByLabelText("Remarks"), {
      target: { value: "Archived" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record action" }));
    expect(
      await screen.findByText("Retention action recorded."),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/librarian/retention-logs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          research_document_id: 42,
          action: "final_archived",
          remarks: "Archived",
        }),
      }),
    );
    await waitFor(() => expect(listRequests).toBeGreaterThan(1));
    expect(
      (await screen.findAllByText("Final Archived")).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("clears a failed schedules load while retrying and renders the authoritative response", async () => {
    let requests = 0;
    stubFetch([
      [
        /\/api\/coordinator\/schedules(\?|$)/,
        () => {
          requests += 1;
          return requests === 1
            ? new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE" }), {
                status: 503,
              })
            : listData([
                {
                  id: 1,
                  research_document_id: 7,
                  title: "Panel defense",
                  scheduled_at: "2026-08-20T09:00:00.000000Z",
                  room: "Room 204",
                  status: "scheduled",
                  created_by: { id: "coordinator-id", name: "Coordinator" },
                },
              ]);
        },
      ],
    ]);
    const { unmount } = render(
      <RoleSidebarPage
        role="coordinator"
        selectedNav="Schedules"
        navigate={vi.fn()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Panel defense")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unmount();
  });

  it("enrolls and removes student researchers in a class section", async () => {
    const sections = [
      {
        id: 7,
        name: "CS-101",
        academic_year: "2025-2026",
        is_active: true,
        documents_count: 0,
        members_count: 0,
        created_at: null,
      },
    ];
    const member = {
      id: "member-id",
      email: "juan@example.edu",
      student_employee_id: "2023-0001",
      first_name: "Juan",
      middle_name: null,
      last_name: "Dela Cruz",
      added_at: "2026-08-18T00:00:00.000000Z",
    };
    const candidate = {
      id: "candidate-id",
      email: "maria@example.edu",
      student_employee_id: "2023-0002",
      first_name: "Maria",
      middle_name: null,
      last_name: "Santos",
      added_at: null,
    };
    const memberList: Array<typeof member | typeof candidate> = [member];
    let members = memberList;
    const fetchMock = stubFetch([
      [/\/api\/instructor\/sections$/, () => listData(sections)],
      [
        /\/api\/instructor\/sections\/7\/members(\?|\/|$)/,
        (input, init) => {
          if (init?.method === "PUT") {
            members = [member, candidate];
            return new Response(
              JSON.stringify({
                data: { ...sections[0], members_count: members.length },
              }),
            );
          }
          if (init?.method === "DELETE") {
            members = [member];
            return new Response(
              JSON.stringify({
                data: { ...sections[0], members_count: 1 },
              }),
            );
          }
          return listData(members);
        },
      ],
      [
        /\/api\/instructor\/students(\?|$)/,
        (input) =>
          listData(
            String(input).includes("search=mar")
              ? [candidate]
              : [candidate, member],
          ),
      ],
    ]);
    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="My Sections"
        navigate={vi.fn()}
      />,
    );
    expect(await screen.findByText("CS-101")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(await screen.findByText("juan@example.edu")).toBeInTheDocument();
    expect(screen.getByText("2023-0001")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add a student researcher" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Manage enrolled researchers and the studies connected to this section.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search students"), {
      target: { value: "mar" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("search=mar"),
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(
      await screen.findByText("Student researcher added to the section."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByText("maria@example.edu")).toHaveLength(1),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[1]);
    expect(
      await screen.findByRole("button", { name: "Remove student" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove student" }));
    expect(
      await screen.findByText("Student researcher removed from the section."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("maria@example.edu")).not.toBeInTheDocument(),
    );
  });

  it("filters office users live as search text changes without submitting", async () => {
    let requests = 0;
    stubFetch([
      [
        /\/api\/office\/users(\?|$)/,
        (input) => {
          requests += 1;
          const hasSearch = String(input).includes("search=");
          return new Response(
            JSON.stringify({
              data: {
                ...pageResponse(
                  hasSearch
                    ? []
                    : [
                        {
                          id: "user-id",
                          email: "member@example.test",
                          first_name: "Member",
                          middle_name: null,
                          last_name: "Example",
                          role: "researcher",
                          access_status: "active",
                          created_at: null,
                          updated_at: null,
                        },
                      ],
                ).meta,
                data: hasSearch
                  ? []
                  : [
                      {
                        id: "user-id",
                        email: "member@example.test",
                        first_name: "Member",
                        middle_name: null,
                        last_name: "Example",
                        role: "researcher",
                        access_status: "active",
                        created_at: null,
                        updated_at: null,
                      },
                    ],
                first_page_url: null,
                last_page_url: null,
                prev_page_url: null,
                next_page_url: null,
              },
            }),
          );
        },
      ],
    ]);
    render(
      <RoleSidebarPage
        role="research-office"
        selectedNav="User & Role Management"
        navigate={vi.fn()}
      />,
    );
    expect(await screen.findByText("member@example.test")).toBeInTheDocument();
    const initialRequests = requests;
    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "zzz" },
    });
    expect(
      await screen.findByText("No users match these filters."),
    ).toBeInTheDocument();
    await waitFor(() => expect(requests).toBeGreaterThan(initialRequests));
    expect(screen.queryByText("member@example.test")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply filters" })).toBeNull();
  });
});
