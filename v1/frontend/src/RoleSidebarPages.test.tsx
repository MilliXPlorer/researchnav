import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  institute: null,
  degree_program: null,
  manuscript_date_label: null,
  abstract_provenance: null,
  research_stage: "title_proposal",
  submission_status: "draft",
  archive_status: "not_archived",
  visibility: "private",
  submitted_at: null,
  updated_at: "2026-09-18T10:00:00.000Z",
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
        by_institute: [],
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
      /\/api\/instructor\/(sections|submissions|similarity-overview|class-reports)(\?|$)/,
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
    [/\/api\/office\/compliance$/, emptyData],
    [/\/api\/repository\?per_page=50/, emptyPage],
    [/\/api\/research\?/, emptyPage],
    [/\/api\/categories$/, emptyData],
  ];
}

describe("role workspace pages", () => {
  it("separates the Instructor research workspace from the review queue", async () => {
    const fetchMock = stubFetch([
      [/\/api\/monitoring\/research$/, () => listData([])],
      [/\/api\/instructor\/submissions\?stage=manuscript$/, () => listData([])],
    ]);

    const { rerender } = render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="Assigned Research"
        navigate={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Assigned Research" }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/monitoring/research",
      expect.objectContaining({ credentials: "include" }),
    );

    rerender(
      <RoleSidebarPage
        role="instructor"
        selectedNav="Manuscript Review"
        navigate={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Manuscript review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/review assigned manuscript submissions/i),
    ).toBeInTheDocument();
  });

  it("renders personal user logs from the shared endpoint", async () => {
    const fetchMock = stubFetch([
      [
        /^\/api\/user-logs$/,
        () =>
          new Response(
            JSON.stringify(
              pageResponse([
                {
                  id: 1,
                  user: {
                    id: "user-1",
                    email: "instructor@example.test",
                  },
                  action: "CLASS_SECTION_CREATED",
                  entity_type: "class_section",
                  entity_id: "7",
                  description: "Created a research section.",
                  ip_address: "127.0.0.1",
                  user_agent: "Vitest",
                  created_at: "2026-09-17T10:00:00+08:00",
                },
              ]),
            ),
          ),
      ],
    ]);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="User Logs"
        navigate={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "User Logs" }),
    ).toBeInTheDocument();

    expect(screen.getByText("CLASS SECTION CREATED")).toBeInTheDocument();
    expect(screen.getByText("Created a research section.")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith("/api/user-logs", expect.anything());
  });

  it("paginates user logs", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === "/api/user-logs") {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 1,
                user: {
                  id: "user-1",
                  email: "instructor@example.test",
                },
                action: "PAGE_ONE_EVENT",
                entity_type: "research_document",
                entity_id: "1",
                description: "First page activity.",
                ip_address: "127.0.0.1",
                user_agent: "Vitest",
                created_at: "2026-09-19T08:00:00+08:00",
              },
            ],
            links: {
              first: "/api/user-logs?page=1",
              last: "/api/user-logs?page=2",
              prev: null,
              next: "/api/user-logs?page=2",
            },
            meta: {
              current_page: 1,
              from: 1,
              last_page: 2,
              links: [],
              path: "/api/user-logs",
              per_page: 25,
              to: 25,
              total: 26,
            },
          }),
        );
      }

      if (url === "/api/user-logs?page=2") {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 26,
                user: {
                  id: "user-1",
                  email: "instructor@example.test",
                },
                action: "PAGE_TWO_EVENT",
                entity_type: "research_document",
                entity_id: "26",
                description: "Second page activity.",
                ip_address: "127.0.0.1",
                user_agent: "Vitest",
                created_at: "2026-09-18T08:00:00+08:00",
              },
            ],
            links: {
              first: "/api/user-logs?page=1",
              last: "/api/user-logs?page=2",
              prev: "/api/user-logs?page=1",
              next: null,
            },
            meta: {
              current_page: 2,
              from: 26,
              last_page: 2,
              links: [],
              path: "/api/user-logs",
              per_page: 25,
              to: 26,
              total: 26,
            },
          }),
        );
      }

      return new Response(null, { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="User Logs"
        navigate={vi.fn()}
      />,
    );

    expect(await screen.findByText("PAGE ONE EVENT")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("PAGE TWO EVENT")).toBeInTheDocument();
    expect(screen.getByText("Showing 26–26 of 26 logs")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user-logs?page=2",
      expect.anything(),
    );
  });

  it("searches and filters user logs while preserving filters across pages", async () => {
    const log = (action: string) => ({
      id: action,
      action,
      actor: null,
      subject: { type: "research_document", id: "101" },
      description: "Proposal review activity.",
      created_at: "2026-09-10T08:00:00+08:00",
    });
    const response = (action: string, page: number) => ({
      data: [log(action)],
      links: { first: null, last: null, prev: null, next: null },
      meta: {
        current_page: page,
        from: page,
        last_page: 2,
        links: [],
        path: "/api/user-logs",
        per_page: 25,
        to: page,
        total: 2,
      },
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "/api/user-logs") {
        return new Response(JSON.stringify(response("PAGE_ONE_EVENT", 1)));
      }
      if (url === "/api/user-logs?page=2") {
        return new Response(JSON.stringify(response("PAGE_TWO_EVENT", 2)));
      }
      if (
        url ===
        "/api/user-logs?search=proposal&created_from=2026-09-10&created_to=2026-09-10"
      ) {
        return new Response(JSON.stringify(response("FILTERED_PAGE_ONE", 1)));
      }
      if (
        url ===
        "/api/user-logs?search=proposal&created_from=2026-09-10&created_to=2026-09-10&page=2"
      ) {
        return new Response(JSON.stringify(response("FILTERED_PAGE_TWO", 2)));
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="User Logs"
        navigate={vi.fn()}
      />,
    );

    expect(await screen.findByText("PAGE ONE EVENT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("PAGE TWO EVENT")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search logs"), {
      target: { value: "proposal" },
    });
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-09-10" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-09-10" },
    });

    expect(await screen.findByText("FILTERED PAGE ONE")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–1 of 2 logs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("FILTERED PAGE TWO")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user-logs?search=proposal&created_from=2026-09-10&created_to=2026-09-10&page=2",
      expect.anything(),
    );
  });

  it("resets user-log pagination and preserves filters when server sorting changes", async () => {
    const fetchMock = vi.fn<
      (input: string | URL | Request) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify(
            pageResponse([
              {
                id: 1,
                action: "PROPOSAL_REVIEWED",
                actor: null,
                subject: { type: "research_document", id: "101" },
                description: "Proposal review activity.",
                created_at: "2026-09-10T08:00:00+08:00",
              },
            ]),
          ),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="User Logs"
        navigate={vi.fn()}
      />,
    );

    await screen.findByText("PROPOSAL REVIEWED");
    fireEvent.change(screen.getByLabelText("Search logs"), {
      target: { value: "proposal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Action" }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calls).toContain(
        "/api/user-logs?search=proposal&sort=action&direction=asc",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Action" }));
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(calls).toContain(
        "/api/user-logs?search=proposal&sort=action&direction=desc",
      );
    });
  });

  it("reloads Assigned Research when the active account changes", async () => {
    let monitoringRequests = 0;

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === "/api/monitoring/research") {
        monitoringRequests += 1;

        return new Response(
          JSON.stringify({
            data:
              monitoringRequests === 1
                ? [
                    {
                      id: 101,
                      title: "Adviser A Folder",
                      institute: "Institute of Computing",
                      researchers: ["Researcher A"],
                    },
                  ]
                : [
                    {
                      id: 202,
                      title: "Adviser B Folder",
                      institute: "Institute of Computing",
                      researchers: ["Researcher B"],
                    },
                  ],
          }),
        );
      }

      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <RoleSidebarPage
        role="adviser"
        selectedNav="Assigned Research"
        navigate={vi.fn()}
        actorKey="adviser-a@example.test"
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Open research folder Adviser A Folder",
      }),
    ).toBeInTheDocument();

    rerender(
      <RoleSidebarPage
        role="adviser"
        selectedNav="Assigned Research"
        navigate={vi.fn()}
        actorKey="adviser-b@example.test"
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Open research folder Adviser B Folder",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Open research folder Adviser A Folder",
      }),
    ).not.toBeInTheDocument();

    expect(monitoringRequests).toBe(2);
  });

  it("opens Editor dashboard sections from the summary cards", async () => {
    stubFetch([
      [
        /\/api\/support-assignments\/inbox$/,
        () =>
          listData([
            {
              id: 4,
              research_document_id: 7,
              research_title: "Requested editorial review",
              researchers: ["Student One"],
              user_id: "editor@example.test",
              name: "Editor",
              assignment_role: "research_editor",
              status: "pending",
              created_at: "2026-09-04T08:00:00Z",
            },
          ]),
      ],
      [
        /\/api\/editor\/assigned-research$/,
        () =>
          listData([
            {
              research_document_id: 8,
              title: "Accepted editorial review",
              researchers: ["Student Two"],
              program: null,
              category: null,
              academic_year: 2026,
              research_stage: "ongoing",
              submission_status: "under_review",
              latest_manuscript: null,
              updated_at: null,
            },
          ]),
      ],
    ]);

    render(
      <RoleSidebarPage
        role="research_editor"
        selectedNav="Dashboard"
        navigate={vi.fn()}
      />,
    );

    const requestsCard = await screen.findByRole("button", {
      name: "View pending requests",
    });
    expect(
      screen.queryByText("Requested editorial review"),
    ).not.toBeInTheDocument();
    fireEvent.click(requestsCard);
    expect(screen.getByText("Requested editorial review")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Close Pending requests" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "View assigned research" }),
    );
    expect(screen.getByText("Accepted editorial review")).toBeInTheDocument();
  });

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
        ["Manuscript Review", "Manuscript review"],
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
        ["Similarity Check", "Title checker"],
        ["Upload Manuscript", "Upload Manuscript"],
        ["User & Role Management", "User & role management"],
        ["Reports & Exports", "Reports & exports"],
      ],
    },
    {
      role: "researcher",
      destinations: [
        ["My Research", "My research"],
        ["Similarity Check", "Title checker"],
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

  it("clears visible user logs without deleting audit history", async () => {
    let cleared = false;

    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/user-logs/clear" && init?.method === "POST") {
          cleared = true;
          return new Response(null, { status: 204 });
        }

        if (url === "/api/user-logs") {
          return new Response(
            JSON.stringify(
              pageResponse(
                cleared
                  ? []
                  : [
                      {
                        id: 1,
                        user: {
                          id: "user-1",
                          email: "instructor@example.test",
                        },
                        action: "VISIBLE_EVENT",
                        entity_type: "research_document",
                        entity_id: "1",
                        description: "Visible activity.",
                        ip_address: "127.0.0.1",
                        user_agent: "Vitest",
                        created_at: "2026-09-19T08:00:00+08:00",
                      },
                    ],
              ),
            ),
          );
        }

        return new Response(null, { status: 404 });
      },
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="User Logs"
        navigate={vi.fn()}
      />,
    );

    expect(await screen.findByText("VISIBLE EVENT")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear Logs" }));

    expect(screen.getByText("Are you sure to clear logs?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear logs" }));

    await waitFor(() => {
      expect(screen.queryByText("VISIBLE EVENT")).not.toBeInTheDocument();
    });

    expect(
      await screen.findByText("No activity has been recorded yet."),
    ).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user-logs/clear",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uses the manuscript queue and filters its returned submissions by status", async () => {
    stubFetch([
      [
        /\/api\/instructor\/submissions\?stage=manuscript$/,
        () =>
          new Response(
            JSON.stringify({
              data: [
                {
                  research_document_id: 1,
                  title: "Submitted manuscript",
                  research_stage: "ongoing",
                  submission_status: "submitted",
                  submitter: "Student One",
                  updated_at: null,
                },
                {
                  research_document_id: 2,
                  title: "Reviewing manuscript",
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
        selectedNav="Manuscript Review"
        navigate={vi.fn()}
      />,
    );

    expect(await screen.findByText("Submitted manuscript")).toBeInTheDocument();
    expect(screen.getByText("Reviewing manuscript")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Submission status"), {
      target: { value: "under_review" },
    });
    expect(screen.queryByText("Submitted manuscript")).not.toBeInTheDocument();
    expect(screen.getByText("Reviewing manuscript")).toBeInTheDocument();
  });

  it("shows only instructor-assigned research folders without creation controls", async () => {
    const fetchMock = stubFetch([[/\/api\/research\?/, emptyPage]]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "My research" });
    expect(
      screen.getByRole("heading", { name: "One folder, two kinds of updates" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/do not submit your manuscript for review/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "No assigned research folders" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /new|create submission/i }),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/research",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("updates an assigned draft, uploads its manuscript, and submits it in order", async () => {
    const draft = draftResource();
    const submitted = draftResource({
      submission_status: "submitted",
      submitted_at: "2026-08-18T10:00:00.000000Z",
    });
    const fetchMock = stubFetch([
      [
        /\/api\/research\?/,
        () => new Response(JSON.stringify(pageResponse([draft]))),
      ],
      [/\/api\/categories$/, () => listData([draft.category])],
      [
        /^\/api\/research\/7$/,
        (_input, init) =>
          init?.method === "PATCH"
            ? new Response(JSON.stringify({ data: draft }))
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

    await screen.findByText("My study title");
    expect(
      screen.getByRole("button", { name: "Manage folder" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("heading", { name: "Edit submission" });
    expect(screen.queryByLabelText(/User ID/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "My study title" },
    });
    fireEvent.change(screen.getByLabelText("Institute"), {
      target: { value: "Institute of Teacher Education" },
    });
    fireEvent.change(screen.getByLabelText("Program"), {
      target: { value: "Bachelor of Secondary Education major in English" },
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
      "/api/research/7",
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
    expect(screen.queryByText("Corresponding")).not.toBeInTheDocument();
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

  it("rejects unsupported manuscript files before updating an assigned draft", async () => {
    const draft = draftResource();
    const fetchMock = stubFetch([
      [
        /\/api\/research\?/,
        () => new Response(JSON.stringify(pageResponse([draft]))),
      ],
      [/\/api\/categories$/, () => listData([draft.category])],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByRole("heading", { name: "Edit submission" });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Unsafe upload" },
    });
    fireEvent.change(screen.getByLabelText("Author name"), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByLabelText("PDF or DOCX (maximum 25 MB)"), {
      target: { files: [new File(["bad"], "payload.exe")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update draft" }));

    expect(
      await screen.findByText("The manuscript must be a PDF or DOCX file."),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) === "/api/research/7" && init?.method === "PATCH",
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
      institute: null,
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
      await screen.findByRole("heading", { name: "My research" }),
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
    expect(screen.getAllByText("Submitted")).toHaveLength(1);
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

    fireEvent.click(
      await screen.findByRole("button", { name: "Manage folder" }),
    );
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

  it("limits programs while editing an assigned research folder", async () => {
    const draft = draftResource({ institute: null, degree_program: null });
    const fetchMock = stubFetch([
      [
        /\/api\/research\?/,
        () => new Response(JSON.stringify(pageResponse([draft]))),
      ],
      [/\/api\/categories$/, () => listData([draft.category])],
    ]);
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="My Submissions"
        navigate={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const institute = await screen.findByLabelText("Institute");
    const program = screen.getByLabelText("Program");
    expect(program).toBeDisabled();
    fireEvent.change(institute, {
      target: { value: "Institute of Teacher Education" },
    });
    expect(program).toBeEnabled();
    fireEvent.change(program, {
      target: { value: "Bachelor of Secondary Education major in English" },
    });
    fireEvent.change(institute, {
      target: { value: "Institute of Computer Studies" },
    });
    expect(program).toHaveValue("");
    expect(
      fetchMock.mock.calls.filter(
        ([path]) => String(path) === "/api/categories",
      ),
    ).toHaveLength(0);
  });

  it("scopes related studies to owned submissions and opens matched research", async () => {
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
      await screen.findByRole("button", {
        name: "Open metadata for Catalog match",
      }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalledWith(
      expect.stringContaining("/catalog"),
    );
    expect(screen.getByText(/9\/18\/2026/)).toBeInTheDocument();
  });

  it("sorts related studies on the server and resets to the first page", async () => {
    const owned = draftResource();
    const fetchMock = stubFetch([
      [
        /\/api\/research\?/,
        (path) => {
          const page = path.includes("page=2") ? 2 : 1;
          return new Response(
            JSON.stringify({
              ...pageResponse([owned]),
              meta: {
                ...pageResponse([owned]).meta,
                current_page: page,
                from: page === 1 ? 1 : 11,
                last_page: 2,
                to: page === 1 ? 10 : 11,
                total: 11,
              },
            }),
          );
        },
      ],
      [/\/api\/research\/7\/similarity$/, () => listData([])],
    ]);

    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="Related Studies"
        navigate={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Select a record" });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research?mine=1&page=2&per_page=10",
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Sort by Title" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research?mine=1&sort=title&direction=asc&page=1&per_page=10",
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Sort by Title" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/research?mine=1&sort=title&direction=desc&page=1&per_page=10",
        expect.anything(),
      );
    });
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
      screen.queryByRole("button", { name: "New submission" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows only the title score on the researcher title checker page", async () => {
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
              institute: null,
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
    const navigate = vi.fn();
    render(
      <RoleSidebarPage
        role="researcher"
        selectedNav="Similarity Check"
        navigate={navigate}
      />,
    );

    fireEvent.change(screen.getByLabelText("Proposed title or keywords"), {
      target: { value: "rounded" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Title" }));

    expect(await screen.findByText("Title similarity")).toBeInTheDocument();
    expect(screen.queryByText(/Displayed overall/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Content similarity/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open metadata for Rounded match" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
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
        instructorSectionId="7"
      />,
    );
    expect(await screen.findByText("CS-101")).toBeInTheDocument();
    expect(await screen.findByText("juan@example.edu")).toBeInTheDocument();
    expect(screen.getByText("2023-0001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add student" }));
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
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Maria Santos" }),
    );
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

  it("renders section folder cards and navigates to the route-backed section page", async () => {
    const navigate = vi.fn();
    stubFetch([
      [
        /\/api\/instructor\/sections$/,
        () =>
          listData([
            {
              id: 7,
              name: "CS-101",
              section_code: "BSCS-4A",
              academic_year: "2025-2026",
              is_active: true,
              documents_count: 2,
              members_count: 4,
              created_at: null,
            },
          ]),
      ],
    ]);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="My Sections"
        navigate={navigate}
      />,
    );

    const card = await screen.findByRole("button", {
      name: "Open section CS-101",
    });
    expect(screen.queryByLabelText("Section name")).not.toBeInTheDocument();
    fireEvent.click(card);
    expect(navigate).toHaveBeenCalledWith("/app/instructor/sections/7");
    fireEvent.click(screen.getByRole("button", { name: "Add Section" }));
    const dialog = screen.getByRole("dialog", { name: "Create class section" });
    expect(within(dialog).getByLabelText("Section name")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Section code")).toBeRequired();
    expect(within(dialog).getByLabelText("Academic year")).toBeInTheDocument();
  });

  it("searches and filters section cards using the loaded section metadata", async () => {
    stubFetch([
      [
        /\/api\/instructor\/sections$/,
        () =>
          listData([
            {
              id: 7,
              name: "Computer Science 4A",
              section_code: "BSCS-4A",
              academic_year: "2025-2026",
              is_active: true,
              documents_count: 2,
              members_count: 4,
              created_at: null,
            },
            {
              id: 8,
              name: "Information Systems 3B",
              section_code: "BSIS-3B",
              academic_year: "2024-2025",
              is_active: false,
              documents_count: 1,
              members_count: 3,
              created_at: null,
            },
          ]),
      ],
    ]);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="My Sections"
        navigate={vi.fn()}
      />,
    );

    const search = await screen.findByLabelText("Search sections or studies");
    fireEvent.change(search, { target: { value: "  bscs-4a  " } });
    expect(
      screen.getByRole("button", { name: "Open section Computer Science 4A" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open section Information Systems 3B",
      }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    expect(
      screen.getByRole("button", {
        name: "Open section Information Systems 3B",
      }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Academic year filter"), {
      target: { value: "2025-2026" },
    });
    fireEvent.change(screen.getByLabelText("Section status filter"), {
      target: { value: "inactive" },
    });
    expect(
      screen.getByText("No sections or studies match your search."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      screen.getByRole("button", {
        name: "Open section Information Systems 3B",
      }),
    ).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "missing section" } });
    expect(
      screen.getByText("No sections or studies match your search."),
    ).toBeInTheDocument();
  });

  it("searches loaded studies and researchers and combines study filters", async () => {
    const student = {
      id: "student-1",
      email: "maria@example.edu",
      student_employee_id: "2023-0001",
      first_name: "Maria",
      middle_name: null,
      last_name: "Santos",
      added_at: null,
    };
    stubFetch([
      [
        /\/api\/instructor\/sections$/,
        () =>
          listData([
            {
              id: 7,
              name: "CS-101",
              section_code: "BSCS-4A",
              academic_year: "2025-2026",
              is_active: true,
              documents_count: 2,
              members_count: 1,
              created_at: null,
            },
          ]),
      ],
      [
        /\/api\/instructor\/sections\/7\/documents$/,
        () =>
          listData([
            {
              research_document_id: 11,
              title: "Coastal Resilience",
              research_stage: "proposal",
              submission_status: "draft",
              updated_at: null,
            },
            {
              research_document_id: 12,
              title: "Mountain Agriculture",
              research_stage: "final",
              submission_status: "approved",
              updated_at: null,
            },
          ]),
      ],
      [/\/api\/instructor\/sections\/7\/members$/, () => listData([student])],
      [/\/api\/instructor\/students(\?|$)/, () => listData([student])],
    ]);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="My Sections"
        navigate={vi.fn()}
        instructorSectionId="7"
      />,
    );

    const search = await screen.findByLabelText(
      "Search studies or researchers",
    );
    await screen.findByRole("button", {
      name: "Open research project Coastal Resilience",
    });
    fireEvent.change(search, { target: { value: "  mountain  " } });
    expect(
      screen.getByRole("button", {
        name: "Open research project Mountain Agriculture",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open research project Coastal Resilience",
      }),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Maria Santos" } });
    expect(screen.getByText("maria@example.edu")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "coastal" } });
    fireEvent.change(screen.getByLabelText("Research stage filter"), {
      target: { value: "proposal" },
    });
    fireEvent.change(screen.getByLabelText("Submission status filter"), {
      target: { value: "approved" },
    });
    expect(
      screen.getByText("No studies match your search and filters."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Submission status filter"), {
      target: { value: "draft" },
    });
    expect(
      screen.getByRole("button", {
        name: "Open research project Coastal Resilience",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(search, { target: { value: "" } });
    expect(
      screen.getByRole("button", {
        name: "Open research project Mountain Agriculture",
      }),
    ).toBeInTheDocument();
  });

  it("does not retain section cards when the Instructor account context changes", async () => {
    let requestCount = 0;
    stubFetch([
      [
        /\/api\/instructor\/sections$/,
        () => {
          requestCount += 1;
          return listData([
            {
              id: requestCount,
              name:
                requestCount === 1
                  ? "Instructor A Section"
                  : "Instructor B Section",
              section_code: requestCount === 1 ? "A-1" : "B-1",
              academic_year: "2025-2026",
              is_active: true,
              documents_count: 0,
              members_count: 0,
              created_at: null,
            },
          ]);
        },
      ],
    ]);

    const { rerender } = render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="My Sections"
        navigate={vi.fn()}
        actorKey="instructor-a@example.test"
      />,
    );
    expect(
      await screen.findByRole("button", {
        name: "Open section Instructor A Section",
      }),
    ).toBeInTheDocument();

    rerender(
      <RoleSidebarPage
        role="instructor"
        selectedNav="My Sections"
        navigate={vi.fn()}
        actorKey="instructor-b@example.test"
      />,
    );
    expect(
      await screen.findByRole("button", {
        name: "Open section Instructor B Section",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Open section Instructor A Section",
      }),
    ).not.toBeInTheDocument();
    expect(requestCount).toBe(2);
  });

  it("loads the project route with independent assignment disclosures and confirmations", async () => {
    const navigate = vi.fn();
    const student = {
      id: "student-1",
      email: "student@example.edu",
      student_employee_id: "2023-0001",
      first_name: "Student",
      middle_name: null,
      last_name: "One",
      added_at: null,
    };
    const adviser = {
      user_id: "adviser-1",
      name: "Adviser One",
      email: "adviser@example.edu",
      team_role: "adviser",
    };
    stubFetch([
      [
        /\/api\/instructor\/sections$/,
        () =>
          listData([
            {
              id: 7,
              name: "CS-101",
              academic_year: "2025-2026",
              is_active: true,
              documents_count: 1,
              members_count: 1,
              created_at: null,
            },
          ]),
      ],
      [
        /\/api\/instructor\/sections\/7\/documents$/,
        () =>
          listData([
            {
              research_document_id: 11,
              title: "Project Alpha",
              research_stage: "title_proposal",
              submission_status: "draft",
              updated_at: null,
            },
          ]),
      ],
      [/\/api\/instructor\/sections\/7\/members$/, () => listData([student])],
      [/\/api\/instructor\/students(\?|$)/, () => listData([student])],
      [
        /\/api\/instructor\/sections\/7\/documents\/11\/members$/,
        () => listData([student]),
      ],
      [
        /\/api\/instructor\/sections\/7\/documents\/11\/team$/,
        () =>
          new Response(
            JSON.stringify({
              data: {
                section_id: 7,
                research_document_id: 11,
                instructor: null,
                adviser,
                research_office_representative: null,
                chair: null,
                panel_members: [],
                support_assignments: {
                  editor: null,
                  statistician: null,
                  librarian: null,
                },
                pre_defense_ready: false,
                post_defense_ready: false,
                complete: false,
              },
            }),
          ),
      ],
      [
        /\/api\/instructor\/sections\/7\/documents\/11\/team\/candidates/,
        () => listData([adviser]),
      ],
      [/\/api\/research\/11\/(files|folders|feedback)$/, emptyData],
    ]);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="My Sections"
        navigate={navigate}
        instructorSectionId="7"
        instructorProjectDocumentId="11"
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Back to Research Projects" }),
    ).toBeInTheDocument();
    const workspace = await screen.findByTestId("study-workspace");
    expect(
      [
        "Overview",
        "Research actors",
        "Documents",
        "Feedback",
        "Defense Monitoring Forms",
      ].map((name) => within(workspace).getByRole("button", { name })),
    ).toHaveLength(5);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete research project" }),
    );
    expect(
      screen.getByRole("heading", { name: "Delete research project" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove Student One" }),
    );
    expect(
      screen.getByRole("button", { name: "Remove student" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Research actors" }));
    fireEvent.click(screen.getByRole("button", { name: "Manage assignments" }));
    expect(
      screen.getByRole("dialog", { name: "Manage project assignments" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add students" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Assign research adviser" }),
    ).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Add students" }));
    expect(screen.getByLabelText("Search students")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Close Manage project assignments" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage assignments" }));
    await waitFor(() =>
      expect(
        screen.queryByText("Loading current project assignments…"),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Assign research adviser" }),
    );
    expect(screen.getAllByText("Adviser One").length).toBeGreaterThan(0);
    const adviserSearch = screen.getByLabelText(
      "Search and select research adviser",
    );
    fireEvent.change(adviserSearch, { target: { value: "missing account" } });
    fireEvent.change(adviserSearch, {
      target: { value: "Adviser One" },
    });
    const adviserOption = screen.getByRole("radio", {
      name: "Adviser One adviser@example.edu",
    });
    expect(adviserOption).toBeChecked();
    fireEvent.click(
      screen.getByRole("radio", {
        name: "No assignment Leave this project role unassigned.",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove research adviser" }),
    );
    expect(
      screen.getByRole("heading", { name: "Confirm assignment change" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Back to Research Projects" }),
    );
    expect(navigate).toHaveBeenCalledWith("/app/instructor/sections/7");
    expect(
      screen.queryByLabelText("Research project: Project Alpha"),
    ).not.toBeInTheDocument();
  });

  it("creates a research project from the section page and assigns roles on the project page", async () => {
    const navigate = vi.fn();
    const document = {
      research_document_id: 11,
      title: "Project Alpha",
      research_stage: "title_proposal",
      submission_status: "draft",
      updated_at: null,
    };
    const adviser = {
      user_id: "adviser-1",
      name: "Adviser One",
      email: "adviser@example.edu",
      team_role: "adviser",
    };
    let documents: Array<typeof document> = [];
    stubFetch([
      [
        /\/api\/instructor\/sections$/,
        () =>
          listData([
            {
              id: 7,
              name: "CS-101",
              academic_year: "2025-2026",
              is_active: true,
              documents_count: documents.length,
              members_count: 0,
              created_at: null,
            },
          ]),
      ],
      [
        /\/api\/instructor\/sections\/7\/documents$/,
        (input, init) => {
          if (init?.method === "POST") {
            documents = [document];
            return new Response(JSON.stringify({ data: document }), {
              status: 201,
            });
          }
          return listData(documents);
        },
      ],
      [/\/api\/instructor\/sections\/7\/members$/, emptyData],
      [/\/api\/instructor\/students(\?|$)/, emptyData],
      [
        /\/api\/instructor\/sections\/7\/documents\/11\/team\/candidates/,
        () => listData([adviser]),
      ],
      [
        /\/api\/instructor\/sections\/7\/documents\/11\/team$/,
        (input, init) => {
          if (init?.method === "PUT") {
            return new Response(
              JSON.stringify({
                data: {
                  section_id: 7,
                  research_document_id: 11,
                  adviser,
                  research_office_representative: null,
                  chair: null,
                  panel_members: [],
                  complete: false,
                },
              }),
            );
          }
          return new Response(
            JSON.stringify({
              data: {
                section_id: 7,
                research_document_id: 11,
                adviser: null,
                research_office_representative: null,
                chair: null,
                panel_members: [],
                complete: false,
              },
            }),
          );
        },
      ],
      [/\/api\/instructor\/sections\/7\/documents\/11\/members$/, emptyData],
    ]);

    render(
      <RoleSidebarPage
        role="instructor"
        selectedNav="My Sections"
        navigate={navigate}
        instructorSectionId="7"
      />,
    );

    expect(await screen.findByText("CS-101")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Attach existing research" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search studies or researchers"), {
      target: { value: "Project Alpha" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Add Research Project" }),
    );
    fireEvent.change(screen.getByLabelText("Research title"), {
      target: { value: "Project Alpha" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(
      await screen.findByText("Research project created."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Project Alpha")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open research project Project Alpha",
      }),
    );
    expect(navigate).toHaveBeenCalledWith(
      "/app/instructor/sections/7/projects/11",
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

  it("uses admin-style office user actions while only editing access", async () => {
    let accessUpdate: { url: string; body: string } | null = null;
    const officeUser = {
      id: "user-id",
      email: "member@example.test",
      first_name: "Member",
      middle_name: null,
      last_name: "Example",
      role: "researcher",
      access_status: "active",
      created_at: null,
      updated_at: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          accessUpdate = {
            url: String(input),
            body: String(init.body),
          };
          return new Response(JSON.stringify({ data: officeUser }));
        }
        return new Response(JSON.stringify(pageResponse([officeUser])));
      }),
    );

    render(
      <RoleSidebarPage
        role="research-office"
        selectedNav="User & Role Management"
        navigate={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Users" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Refresh users" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit member@example.test" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Edit member@example.test",
    });
    expect(within(dialog).queryByLabelText("Role")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Access status"), {
      target: { value: "blocked" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(accessUpdate).toEqual({
        url: "/api/office/users/user-id",
        body: JSON.stringify({ access_status: "blocked" }),
      }),
    );
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add user/i }),
    ).not.toBeInTheDocument();
  });

  it("filters office users locally when the API returns an unfiltered page", async () => {
    const users = [
      {
        id: "researcher-id",
        email: "researcher@example.test",
        first_name: "Alice",
        middle_name: null,
        last_name: "Researcher",
        role: "researcher",
        access_status: "active",
        created_at: null,
        updated_at: null,
      },
      {
        id: "panel-id",
        email: "panel@example.test",
        first_name: "Bob",
        middle_name: null,
        last_name: "Panelist",
        role: "panel",
        access_status: "blocked",
        created_at: null,
        updated_at: null,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(pageResponse(users)))),
    );

    render(
      <RoleSidebarPage
        role="research-office"
        selectedNav="User & Role Management"
        navigate={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("researcher@example.test"),
    ).toBeInTheDocument();
    expect(screen.getByText("panel@example.test")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "Alice" },
    });
    expect(
      await screen.findByText("researcher@example.test"),
    ).toBeInTheDocument();
    expect(screen.queryByText("panel@example.test")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "panel" },
    });
    expect(await screen.findByText("panel@example.test")).toBeInTheDocument();
    expect(
      screen.queryByText("researcher@example.test"),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Access status"), {
      target: { value: "active" },
    });
    expect(
      await screen.findByText("researcher@example.test"),
    ).toBeInTheDocument();
    expect(screen.queryByText("panel@example.test")).not.toBeInTheDocument();
  });
});
