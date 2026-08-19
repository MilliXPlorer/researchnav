import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import CatalogPage from "./CatalogPage";
import Dashboard from "./Dashboard";
import RoleWorkspace from "./RoleWorkspaces";
import { ApiError, type RoleDashboard } from "./api";
import { defaultUserSession } from "./data";
import { type InitialState } from "./ssr";
import type { ResearchRecord, Role } from "./types";

const reviewedRecord: ResearchRecord = {
  id: "900",
  title: "API ARCHIVED STUDY",
  authors: "First API Author, Second API Author",
  year: 2026,
  institutionName: "API College",
  institutionLocation: "Tangub City",
  academicUnit: "API Academic Unit",
  degreeProgram: "API Program",
  institute: "API Academic Unit",
  program: "API Program",
  category: "API Category",
  abstract: "A public repository response.",
  keywords: ["api", "repository"],
  researchStage: "Completed",
  manuscriptDate: "June 2026",
  abstractProvenance: "Imported public metadata.",
};

const repositoryResource = {
  id: 900,
  title: reviewedRecord.title,
  authors: [
    {
      author_name: "Second API Author",
      author_order: 2,
      is_corresponding_author: false,
    },
    {
      author_name: "First API Author",
      author_order: 1,
      is_corresponding_author: true,
    },
  ],
  publication_year: 2026,
  institution_name: "API College",
  institution_location: "Tangub City",
  academic_unit: "API Academic Unit",
  degree_program: "API Program",
  category: { name: "API Category" },
  abstract: "A public repository response.",
  keywords: "api, repository",
  manuscript_date_label: "June 2026",
  abstract_provenance: "Imported public metadata.",
  research_stage: "completed",
};

beforeAll(() => {
  window.scrollTo = vi.fn();
});

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/auth/session") {
        return new Response(
          JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (String(input) === "/api/repository?per_page=50") {
        return new Response(
          JSON.stringify({ data: [repositoryResource], links: { next: null } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    }),
  );
});

describe("public catalog", () => {
  it("displays API metadata using the Laravel author resource shape", async () => {
    window.history.replaceState({}, "", "/catalog");
    render(<App />);
    expect(
      await screen.findByRole("heading", { name: reviewedRecord.title }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View full metadata/ }));
    expect(
      screen.getByText("First API Author, Second API Author"),
    ).toBeInTheDocument();
    expect(screen.getByText("Final binding date")).toBeInTheDocument();
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getAllByText("Search to calculate")).toHaveLength(2);
    expect(screen.queryByText("Research stage")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Imported public metadata."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/source file/i)).not.toBeInTheDocument();
  });

  it("shows no catalog studies when the API returns an empty collection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/auth/session")
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            { status: 401 },
          );
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    render(<App />);
    expect(
      await screen.findByText("No public catalog records are available."),
    ).toBeInTheDocument();
    expect(screen.queryByText("API ARCHIVED STUDY")).not.toBeInTheDocument();
  });

  it("shows an unavailable message instead of a fallback when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/auth/session")
          return new Response(
            JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
            { status: 401 },
          );
        return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "public catalog is unavailable",
    );
    expect(screen.queryByText("API ARCHIVED STUDY")).not.toBeInTheDocument();
  });

  it("requires direct catalog callers to provide reviewed record fixtures", () => {
    render(
      <CatalogPage
        onSignIn={vi.fn()}
        navigate={vi.fn()}
        records={[reviewedRecord]}
      />,
    );
    expect(
      screen.getByRole("heading", { name: reviewedRecord.title }),
    ).toBeInTheDocument();
  });
});

describe("role workspaces", () => {
  const cases: Array<[Exclude<Role, "researcher">, RegExp, string, string]> = [
    ["admin", /System access overview/, "recent_research", "Recent research"],
    ["adviser", /Pending reviews/, "assigned_reviews", "Assigned reviews"],
    ["instructor", /Title proposals/, "title_proposals", "Title proposals"],
    [
      "panel",
      /Proposal defense brief/,
      "repository_references",
      "Repository references",
    ],
    [
      "statistician",
      /Methodology review/,
      "completed_references",
      "Completed references",
    ],
    [
      "coordinator",
      /Research program at a glance/,
      "active_instructors",
      "Active instructors",
    ],
    [
      "librarian",
      /Archiving queue/,
      "repository_records",
      "Repository records",
    ],
    [
      "research-office",
      /Institutional research oversight/,
      "submission_queue",
      "Submission queue",
    ],
    [
      "academics",
      /Your research reading room/,
      "repository_references",
      "Repository references",
    ],
  ];

  const unavailableKey: Record<Exclude<Role, "researcher">, string> = {
    admin: "audit_events",
    adviser: "revision_requests",
    instructor: "pending_reviews",
    panel: "assigned_manuscripts",
    statistician: "methodology_reviews",
    coordinator: "schedules",
    librarian: "archiving_queue",
    "research-office": "pending_archiving",
    academics: "saved_library",
  };

  const dashboardFor = (
    role: Exclude<Role, "researcher">,
    readyKey: string,
  ): RoleDashboard => ({
    schema_version: 1,
    role,
    sections: [
      {
        key: readyKey,
        state: "ready",
        total: 7,
        reason: null,
        items: [
          {
            research_document_id: 77,
            title: `${role} API RECORD`,
            research_stage: "title_proposal",
            submission_status: "under_review",
            archive_status: "pending_archiving",
            visibility: "private",
            publication_year: 2026,
            updated_at: "2026-08-18T12:00:00.000000Z",
          },
        ],
      },
      {
        key: unavailableKey[role],
        state: "unavailable",
        total: null,
        reason: "not_modeled",
        items: [],
      },
    ],
  });

  const dashboardScopeFor = (role: Role) => `${role}:fixture@example.test`;

  const readyProps = (role: Exclude<Role, "researcher">, key: string) => ({
    role,
    selectNav: vi.fn(),
    navigate: vi.fn(),
    dashboardScope: dashboardScopeFor(role),
    dashboardState: {
      scope: dashboardScopeFor(role),
      status: "ready" as const,
      dashboard: dashboardFor(role, key),
    },
    onRetry: vi.fn(),
  });

  it.each(cases)(
    "renders live %s workspace counts, unavailable sections, and records",
    (role, heading, readyKey, sectionHeading) => {
      render(<RoleWorkspace {...readyProps(role, readyKey)} />);
      expect(
        screen.getByRole("heading", { level: 1, name: heading }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { level: 2, name: sectionHeading }),
      ).toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
      expect(screen.getByText(`${role} API RECORD`)).toBeInTheDocument();
      expect(screen.getByText("Unavailable")).toBeInTheDocument();
      expect(
        screen.getByText(
          "This information is not modeled in the current workspace.",
        ),
      ).toBeInTheDocument();
    },
  );

  it("renders every administrator dashboard section and opens internal records", () => {
    const navigate = vi.fn();
    const adminSections = [
      ["active_accounts", "Active accounts"],
      ["pending_accounts", "Pending accounts"],
      ["audit_events", "Audit events"],
      ["draft_research", "Draft research"],
      ["submission_queue", "Submission queue"],
      ["revision_required", "Revision required"],
      ["pending_title_validations", "Pending title validations"],
      ["flagged_similarity", "Flagged similarity"],
      ["approved_for_archiving", "Approved for archiving"],
      ["archived_repository", "Archived repository"],
      ["recent_research", "Recent research"],
    ];
    render(
      <RoleWorkspace
        {...readyProps("admin", "recent_research")}
        navigate={navigate}
        dashboardState={{
          scope: dashboardScopeFor("admin"),
          status: "ready",
          dashboard: {
            schema_version: 1,
            role: "admin",
            sections: adminSections.map(([key], index) => ({
              key,
              state: "ready" as const,
              total: 1,
              reason: null,
              items: [
                {
                  research_document_id: index + 1,
                  title: `ADMIN RECORD ${index + 1}`,
                  research_stage: "ongoing",
                  submission_status: "submitted",
                  archive_status: "not_archived",
                  visibility: "private",
                  publication_year: null,
                  updated_at: null,
                },
              ],
            })),
          },
        }}
      />,
    );

    adminSections.forEach(([, label]) => {
      expect(
        screen.getByRole("heading", { level: 2, name: label }),
      ).toBeInTheDocument();
    });
    expect(screen.getAllByText("1")).toHaveLength(adminSections.length);
    fireEvent.click(
      screen.getAllByRole("button", { name: "Open internal record" })[0],
    );
    expect(navigate).toHaveBeenCalledWith("/research/4");
  });

  it("uses loading and retry states without a statistician checklist", () => {
    const retry = vi.fn();
    render(
      <RoleWorkspace
        role="statistician"
        selectNav={vi.fn()}
        navigate={vi.fn()}
        dashboardScope={dashboardScopeFor("statistician")}
        dashboardState={{
          scope: dashboardScopeFor("statistician"),
          status: "loading",
        }}
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("region", { busy: true })).toBeInTheDocument();
    expect(screen.queryByText("Methodology checklist")).not.toBeInTheDocument();
    expect(screen.queryByText("Issue sign-off")).not.toBeInTheDocument();

    render(
      <RoleWorkspace
        role="statistician"
        selectNav={vi.fn()}
        navigate={vi.fn()}
        dashboardScope={dashboardScopeFor("statistician")}
        dashboardState={{
          scope: dashboardScopeFor("statistician"),
          status: "error",
          error: new ApiError(500, "DASHBOARD_UNAVAILABLE"),
        }}
        onRetry={retry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows a ready zero count as an empty workspace", () => {
    render(
      <RoleWorkspace
        {...readyProps("adviser", "assigned_reviews")}
        dashboardState={{
          scope: dashboardScopeFor("adviser"),
          status: "ready",
          dashboard: {
            schema_version: 1,
            role: "adviser",
            sections: [
              {
                key: "assigned_reviews",
                state: "ready",
                total: 0,
                reason: null,
                items: [],
              },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(
      screen.getByText("No records are currently available."),
    ).toBeInTheDocument();
  });

  it("links public repository previews to a catalog title search", () => {
    const navigate = vi.fn();
    render(
      <RoleWorkspace
        {...readyProps("panel", "repository_references")}
        navigate={navigate}
        dashboardState={{
          scope: dashboardScopeFor("panel"),
          status: "ready",
          dashboard: {
            ...dashboardFor("panel", "repository_references"),
            sections: [
              {
                ...dashboardFor("panel", "repository_references").sections[0],
                items: [
                  {
                    ...dashboardFor("panel", "repository_references")
                      .sections[0].items[0],
                    title: "Public research & testing",
                    visibility: "public",
                  },
                ],
              },
            ],
          },
        }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Open public catalog" }),
    );
    expect(navigate).toHaveBeenCalledWith(
      "/catalog?q=Public%20research%20%26%20testing",
    );
    expect(screen.getByText("Public catalog")).toBeInTheDocument();
  });

  it("bounds Unicode catalog queries to 200 code points", () => {
    const navigate = vi.fn();
    const longTitle = "🧪".repeat(250);
    render(
      <RoleWorkspace
        {...readyProps("panel", "repository_references")}
        navigate={navigate}
        dashboardState={{
          scope: dashboardScopeFor("panel"),
          status: "ready",
          dashboard: {
            ...dashboardFor("panel", "repository_references"),
            sections: [
              {
                ...dashboardFor("panel", "repository_references").sections[0],
                items: [
                  {
                    ...dashboardFor("panel", "repository_references")
                      .sections[0].items[0],
                    title: longTitle,
                    visibility: "public",
                  },
                ],
              },
            ],
          },
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open public catalog" }),
    );

    const query = new URL(
      navigate.mock.calls[0][0],
      "https://researchnav.test",
    ).searchParams.get("q");
    expect(query).toBe(Array.from(longTitle).slice(0, 200).join(""));
    expect(Array.from(query ?? "")).toHaveLength(200);
  });

  it("does not link registered repository or internal queue previews", () => {
    const { unmount } = render(
      <RoleWorkspace
        {...readyProps("panel", "repository_references")}
        dashboardState={{
          scope: dashboardScopeFor("panel"),
          status: "ready",
          dashboard: dashboardFor("panel", "repository_references"),
        }}
      />,
    );
    expect(screen.getByText("Registered workspace")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open public catalog" }),
    ).not.toBeInTheDocument();
    unmount();

    render(<RoleWorkspace {...readyProps("adviser", "assigned_reviews")} />);
    expect(screen.getByText("Internal workspace")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Open (record|public catalog)/ }),
    ).not.toBeInTheDocument();
  });

  it("routes librarian and academics catalog actions to the public catalog", () => {
    const librarianNavigate = vi.fn();
    render(
      <RoleWorkspace
        {...readyProps("librarian", "repository_records")}
        navigate={librarianNavigate}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Open catalog" })[0]);
    expect(librarianNavigate).toHaveBeenCalledWith("/catalog");

    const academicsNavigate = vi.fn();
    render(
      <RoleWorkspace
        {...readyProps("academics", "repository_references")}
        navigate={academicsNavigate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Browse catalog" }));
    expect(academicsNavigate).toHaveBeenCalledWith("/catalog");
  });

  it("renders live researcher sections from dashboard data", () => {
    const selectNav = vi.fn();
    render(
      <RoleWorkspace
        role="researcher"
        selectNav={selectNav}
        navigate={vi.fn()}
        dashboardScope={dashboardScopeFor("researcher")}
        dashboardState={{
          scope: dashboardScopeFor("researcher"),
          status: "ready",
          dashboard: {
            schema_version: 1,
            role: "researcher",
            sections: [
              {
                key: "my_revision_required",
                state: "ready",
                total: 1,
                reason: null,
                items: [
                  {
                    research_document_id: 12,
                    title: "Returned study",
                    research_stage: "ongoing",
                    submission_status: "revision_required",
                    archive_status: "not_archived",
                    visibility: "registered_only",
                    publication_year: 2026,
                    updated_at: "2026-05-02T00:00:00.000Z",
                  },
                ],
              },
            ],
          },
        }}
        onRetry={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /My research/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Returned study")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Revision required" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New submission/ }));
    expect(selectNav).toHaveBeenCalledWith("New Submission");
  });
});

describe("staff access gate", () => {
  it("blocks a new account until a coordinator assigns access", () => {
    render(<Dashboard session={defaultUserSession} navigate={vi.fn()} />);
    expect(
      screen.getByRole("heading", {
        name: "Your account is awaiting approval.",
      }),
    ).toBeInTheDocument();
  });
});

describe("authenticated notifications", () => {
  const activeSession = {
    email: "researcher@example.test",
    role: "researcher" as const,
    accessStatus: "active" as const,
    isAdmin: false,
  };
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
  const adviserDashboardResponse = (title: string, id: number) =>
    new Response(
      JSON.stringify({
        data: {
          schema_version: 1,
          role: "adviser",
          sections: [
            {
              key: "assigned_reviews",
              state: "ready",
              total: 1,
              reason: null,
              items: [
                {
                  research_document_id: id,
                  title,
                  research_stage: "title_proposal",
                  submission_status: "under_review",
                  archive_status: "pending_archiving",
                  visibility: "private",
                  publication_year: null,
                  updated_at: null,
                },
              ],
            },
          ],
        },
      }),
    );

  it("keeps the selected workspace when notifications open, retries loading, and blocks external actions", async () => {
    let notificationAttempts = 0;
    const externalNotification = {
      ...notification,
      action_url: "https://outside.example.test/redirect",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/notifications") {
          notificationAttempts += 1;
          return notificationAttempts === 1
            ? new Response(JSON.stringify({ error: "NOTIFICATIONS_DOWN" }), {
                status: 500,
              })
            : new Response(
                JSON.stringify({
                  data: [externalNotification],
                  links: { next: null },
                }),
              );
        }
        if (String(input).endsWith("/read")) {
          return new Response(
            JSON.stringify({
              data: {
                ...externalNotification,
                read_at: "2026-08-10T12:01:00.000000Z",
              },
            }),
          );
        }
        if (String(input) === "/api/dashboard") {
          return new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "researcher", sections: [] },
            }),
          );
        }
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      }),
    );
    const navigate = vi.fn();
    render(<Dashboard session={activeSession} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Notifications are unavailable (NOTIFICATIONS_DOWN).",
    );
    expect(
      screen.queryByText("This shelf is being cataloged."),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText(externalNotification.title),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(externalNotification.title));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Notifications" }),
      ).not.toBeInTheDocument(),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("distinguishes expired sessions from retryable dashboard server failures", async () => {
    const adviser = { ...activeSession, role: "adviser" as const };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications")
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      return new Response(
        JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
        {
          status: 401,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <Dashboard session={adviser} navigate={vi.fn()} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session expired. Sign out and sign in again.",
    );
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input) === "/api/notifications"
          ? new Response(JSON.stringify({ data: [], links: { next: null } }))
          : new Response(JSON.stringify({ error: "DASHBOARD_UNAVAILABLE" }), {
              status: 500,
            }),
      ),
    );
    rerender(
      <Dashboard
        session={{ ...adviser, email: "new@example.test" }}
        navigate={vi.fn()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Role workspace data is unavailable (DASHBOARD_UNAVAILABLE).",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("applies successful mark-all responses while reporting partial failures", async () => {
    const second = {
      ...notification,
      id: "34b52180-1b2a-4a06-9f9f-b4c6678ed72c",
      title: "Second activity",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/notifications")
          return new Response(
            JSON.stringify({
              data: [notification, second],
              links: { next: null },
            }),
          );
        if (String(input).includes(notification.id))
          return new Response(
            JSON.stringify({
              data: {
                ...notification,
                read_at: "2026-08-10T12:01:00.000000Z",
              },
            }),
          );
        if (String(input) === "/api/dashboard")
          return new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "researcher", sections: [] },
            }),
          );
        return new Response(JSON.stringify({ error: "MARK_FAILED" }), {
          status: 500,
        });
      }),
    );
    render(<Dashboard session={activeSession} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(await screen.findByText(second.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "1 notification could not be marked as read.",
    );
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).toHaveTextContent("1");
  });

  it("shows an active user no fabricated alerts when the API collection is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input) === "/api/notifications") {
          return new Response(
            JSON.stringify({ data: [], links: { next: null } }),
          );
        }
        return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
          status: 404,
        });
      }),
    );

    render(<Dashboard session={activeSession} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(await screen.findByText("No notifications.")).toBeInTheDocument();
    expect(
      screen.queryByText("Revision feedback received"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Similarity check complete"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Defense schedule updated"),
    ).not.toBeInTheDocument();
  });

  it("requests a role dashboard for a researcher", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      }
      if (String(input) === "/api/dashboard") {
        return new Response(
          JSON.stringify({
            data: {
              schema_version: 1,
              role: "researcher",
              sections: [
                {
                  key: "my_drafts",
                  state: "ready",
                  total: 0,
                  reason: null,
                  items: [],
                },
              ],
            },
          }),
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Dashboard session={activeSession} navigate={vi.fn()} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications",
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input]) => String(input) === "/api/dashboard",
        ),
      ).toBe(true);
    });
  });

  it("loads notifications independently while a staff dashboard is loading", async () => {
    const staffSession = { ...activeSession, role: "adviser" as const };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Response(
          JSON.stringify({ data: [notification], links: { next: null } }),
        );
      }
      if (String(input) === "/api/dashboard") {
        return new Response(
          JSON.stringify({
            data: {
              schema_version: 1,
              role: "adviser",
              sections: [],
            },
          }),
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Dashboard session={staffSession} navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(await screen.findByText(notification.title)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("fails closed for notifications when the active account changes", async () => {
    const adviserA = {
      ...activeSession,
      email: "adviser.a@example.test",
      role: "adviser" as const,
    };
    const adviserB = {
      ...activeSession,
      email: "adviser.b@example.test",
      role: "adviser" as const,
    };
    const sensitiveNotification = {
      ...notification,
      title: "ADVISER A SENSITIVE NOTIFICATION",
      message: "Only adviser A may view this message.",
    };
    let notificationRequests = 0;
    let resolveAdviserBNotifications!: (response: Response) => void;
    const adviserBNotifications = new Promise<Response>((resolve) => {
      resolveAdviserBNotifications = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        notificationRequests += 1;
        return notificationRequests === 1
          ? Promise.resolve(
              new Response(
                JSON.stringify({
                  data: [sensitiveNotification],
                  links: { next: null },
                }),
              ),
            )
          : adviserBNotifications;
      }
      if (String(input) === "/api/dashboard") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "adviser", sections: [] },
            }),
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserA} navigate={vi.fn()} />,
    );
    const notificationButton = screen.getByRole("button", {
      name: "Open notifications",
    });
    await waitFor(() => expect(notificationButton).toHaveTextContent("1"));
    fireEvent.click(notificationButton);
    expect(
      await screen.findByText(sensitiveNotification.title),
    ).toBeInTheDocument();
    expect(screen.getByText(sensitiveNotification.message)).toBeInTheDocument();

    rerender(<Dashboard session={adviserB} navigate={vi.fn()} />);

    expect(
      screen.queryByText(sensitiveNotification.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(sensitiveNotification.message),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Notifications" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).not.toHaveTextContent("1");

    await waitFor(() => expect(notificationRequests).toBe(2));
    resolveAdviserBNotifications(
      new Response(JSON.stringify({ data: [], links: { next: null } })),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open notifications" }),
      ).not.toHaveTextContent("1"),
    );
    expect(
      screen.queryByText(sensitiveNotification.title),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(sensitiveNotification.message),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Notifications" }),
    ).not.toBeInTheDocument();
  });

  it("does not apply a stale mark-read response to the next account", async () => {
    const adviserA = {
      ...activeSession,
      email: "adviser.a@example.test",
      role: "adviser" as const,
    };
    const adviserB = {
      ...activeSession,
      email: "adviser.b@example.test",
      role: "adviser" as const,
    };
    const adviserANotification = {
      ...notification,
      title: "ADVISER A NOTIFICATION",
      message: "Adviser A message",
    };
    const adviserBNotification = {
      ...notification,
      title: "ADVISER B NOTIFICATION",
      message: "Adviser B message",
    };
    let notificationRequests = 0;
    let resolveMarked!: (response: Response) => void;
    const marked = new Promise<Response>((resolve) => {
      resolveMarked = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        notificationRequests += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data:
                notificationRequests === 1
                  ? [adviserANotification]
                  : [adviserBNotification],
              links: { next: null },
            }),
          ),
        );
      }
      if (String(input) === `/api/notifications/${notification.id}/read`) {
        return marked;
      }
      if (String(input) === "/api/dashboard") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { schema_version: 1, role: "adviser", sections: [] },
            }),
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const navigate = vi.fn();
    const { rerender } = render(
      <Dashboard session={adviserA} navigate={navigate} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(
      await screen.findByText(adviserANotification.title),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText(adviserANotification.title));

    rerender(<Dashboard session={adviserB} navigate={vi.fn()} />);
    await waitFor(() => expect(notificationRequests).toBe(2));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Open notifications" }),
      ).toHaveTextContent("1"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));
    expect(
      await screen.findByText(adviserBNotification.title),
    ).toBeInTheDocument();

    await act(async () => {
      resolveMarked(
        new Response(
          JSON.stringify({
            data: {
              ...adviserANotification,
              read_at: "2026-08-10T12:01:00Z",
            },
          }),
        ),
      );
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    });
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).toHaveTextContent("1");
    expect(navigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("fails closed while loading a dashboard for a changed role", async () => {
    const adviserSession = { ...activeSession, role: "adviser" as const };
    const instructorSession = {
      ...activeSession,
      role: "instructor" as const,
    };
    let dashboardRequests = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Promise<Response>(() => undefined);
      }
      if (String(input) === "/api/dashboard") {
        dashboardRequests += 1;
        if (dashboardRequests === 1) {
          return new Response(
            JSON.stringify({
              data: {
                schema_version: 1,
                role: "adviser",
                sections: [
                  {
                    key: "assigned_reviews",
                    state: "ready",
                    total: 1,
                    reason: null,
                    items: [
                      {
                        research_document_id: 77,
                        title: "ADVISER ASSIGNMENT",
                        research_stage: "title_proposal",
                        submission_status: "under_review",
                        archive_status: "pending_archiving",
                        visibility: "private",
                        publication_year: null,
                        updated_at: null,
                      },
                    ],
                  },
                ],
              },
            }),
          );
        }
        return new Promise<Response>(() => undefined);
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserSession} navigate={vi.fn()} />,
    );
    expect(await screen.findByText("ADVISER ASSIGNMENT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "My Advisees" }));

    rerender(<Dashboard session={instructorSession} navigate={vi.fn()} />);

    expect(screen.queryByText("ADVISER ASSIGNMENT")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Loading role workspace",
        busy: true,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Title Proposals" })).toHaveClass(
      "active",
    );
  });

  it("ignores stale dashboard responses after role changes", async () => {
    const adviserSession = { ...activeSession, role: "adviser" as const };
    const instructorSession = {
      ...activeSession,
      role: "instructor" as const,
    };
    let resolveAdviserDashboard!: (response: Response) => void;
    let resolveInstructorDashboard!: (response: Response) => void;
    const adviserDashboard = new Promise<Response>((resolve) => {
      resolveAdviserDashboard = resolve;
    });
    const instructorDashboard = new Promise<Response>((resolve) => {
      resolveInstructorDashboard = resolve;
    });
    let dashboardRequests = 0;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [], links: { next: null } })),
        );
      }
      if (String(input) === "/api/dashboard") {
        dashboardRequests += 1;
        return dashboardRequests === 1 ? adviserDashboard : instructorDashboard;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserSession} navigate={vi.fn()} />,
    );
    await waitFor(() => expect(dashboardRequests).toBe(1));

    rerender(<Dashboard session={instructorSession} navigate={vi.fn()} />);
    await waitFor(() => expect(dashboardRequests).toBe(2));

    resolveAdviserDashboard(
      new Response(
        JSON.stringify({
          data: {
            schema_version: 1,
            role: "adviser",
            sections: [
              {
                key: "assigned_reviews",
                state: "ready",
                total: 1,
                reason: null,
                items: [
                  {
                    research_document_id: 77,
                    title: "STALE ADVISER ASSIGNMENT",
                    research_stage: "title_proposal",
                    submission_status: "under_review",
                    archive_status: "pending_archiving",
                    visibility: "private",
                    publication_year: null,
                    updated_at: null,
                  },
                ],
              },
            ],
          },
        }),
      ),
    );
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    await waitFor(() =>
      expect(
        screen.queryByText("STALE ADVISER ASSIGNMENT"),
      ).not.toBeInTheDocument(),
    );

    resolveInstructorDashboard(
      new Response(
        JSON.stringify({
          data: {
            schema_version: 1,
            role: "instructor",
            sections: [
              {
                key: "title_proposals",
                state: "ready",
                total: 1,
                reason: null,
                items: [
                  {
                    research_document_id: 88,
                    title: "CURRENT INSTRUCTOR PROPOSAL",
                    research_stage: "title_proposal",
                    submission_status: "under_review",
                    archive_status: "pending_archiving",
                    visibility: "private",
                    publication_year: null,
                    updated_at: null,
                  },
                ],
              },
            ],
          },
        }),
      ),
    );

    expect(
      await screen.findByText("CURRENT INSTRUCTOR PROPOSAL"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("STALE ADVISER ASSIGNMENT"),
    ).not.toBeInTheDocument();
  });

  it("fails closed while loading a dashboard for a different account in the same role", async () => {
    const adviserA = {
      ...activeSession,
      email: " Adviser.A@Example.Test ",
      role: "adviser" as const,
    };
    const adviserB = {
      ...activeSession,
      email: "adviser.b@example.test",
      role: "adviser" as const,
    };
    let dashboardRequests = 0;
    let resolveAdviserB!: (response: Response) => void;
    const adviserBDashboard = new Promise<Response>((resolve) => {
      resolveAdviserB = resolve;
    });
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [], links: { next: null } })),
        );
      }
      if (String(input) === "/api/dashboard") {
        dashboardRequests += 1;
        return dashboardRequests === 1
          ? Promise.resolve(
              adviserDashboardResponse("ADVISER A ASSIGNMENT", 77),
            )
          : adviserBDashboard;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserA} navigate={vi.fn()} />,
    );
    expect(await screen.findByText("ADVISER A ASSIGNMENT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "My Advisees" }));

    rerender(<Dashboard session={adviserB} navigate={vi.fn()} />);

    expect(screen.queryByText("ADVISER A ASSIGNMENT")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Loading role workspace",
        busy: true,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending Reviews" })).toHaveClass(
      "active",
    );
    await waitFor(() => expect(dashboardRequests).toBe(2));

    resolveAdviserB(adviserDashboardResponse("ADVISER B ASSIGNMENT", 88));
    expect(await screen.findByText("ADVISER B ASSIGNMENT")).toBeInTheDocument();
    expect(screen.queryByText("ADVISER A ASSIGNMENT")).not.toBeInTheDocument();
  });

  it("ignores a stale same-role dashboard response after the account changes", async () => {
    const adviserA = {
      ...activeSession,
      email: "adviser.a@example.test",
      role: "adviser" as const,
    };
    const adviserB = {
      ...activeSession,
      email: "adviser.b@example.test",
      role: "adviser" as const,
    };
    let resolveAdviserA!: (response: Response) => void;
    let resolveAdviserB!: (response: Response) => void;
    const adviserADashboard = new Promise<Response>((resolve) => {
      resolveAdviserA = resolve;
    });
    const adviserBDashboard = new Promise<Response>((resolve) => {
      resolveAdviserB = resolve;
    });
    let dashboardRequests = 0;
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [], links: { next: null } })),
        );
      }
      if (String(input) === "/api/dashboard") {
        dashboardRequests += 1;
        return dashboardRequests === 1 ? adviserADashboard : adviserBDashboard;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <Dashboard session={adviserA} navigate={vi.fn()} />,
    );
    await waitFor(() => expect(dashboardRequests).toBe(1));

    rerender(<Dashboard session={adviserB} navigate={vi.fn()} />);
    await waitFor(() => expect(dashboardRequests).toBe(2));

    resolveAdviserA(adviserDashboardResponse("STALE ADVISER A ASSIGNMENT", 77));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(
      screen.queryByText("STALE ADVISER A ASSIGNMENT"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Loading role workspace",
        busy: true,
      }),
    ).toBeInTheDocument();

    resolveAdviserB(adviserDashboardResponse("ADVISER B ASSIGNMENT", 88));
    expect(await screen.findByText("ADVISER B ASSIGNMENT")).toBeInTheDocument();
    expect(
      screen.queryByText("STALE ADVISER A ASSIGNMENT"),
    ).not.toBeInTheDocument();
  });

  it("renders and reads the exact Laravel notification fields", async () => {
    const readNotification = {
      ...notification,
      read_at: "2026-08-10T12:01:00.000000Z",
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/notifications") {
        return new Response(
          JSON.stringify({ data: [notification], links: { next: null } }),
        );
      }
      if (String(input) === `/api/notifications/${notification.id}/read`) {
        return new Response(JSON.stringify({ data: readNotification }));
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();

    render(<Dashboard session={activeSession} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(await screen.findByText(notification.title)).toBeInTheDocument();
    expect(screen.getByText(notification.message)).toBeInTheDocument();
    expect(screen.getByText(notification.created_at)).toBeInTheDocument();
    expect(screen.getByText(notification.action_url)).toBeInTheDocument();
    expect(
      screen.getByText(String(notification.research_document_id)),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).toHaveTextContent("1");

    fireEvent.click(screen.getByText(notification.title));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(notification.action_url);
    });
    expect(
      screen.getByRole("button", { name: "Open notifications" }),
    ).not.toHaveTextContent("1");
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/notifications/${notification.id}/read`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});

describe("sign out middleware", () => {
  const authenticatedAppState: InitialState = {
    version: 1,
    url: { pathname: "/app", search: "" },
    session: {
      status: "authenticated",
      user: {
        email: "researcher@example.test",
        role: "researcher",
        accessStatus: "active",
        isAdmin: false,
      },
    },
    repository: { status: "unresolved", records: [] },
  };
  const signOutFetchMock = (logoutStatus: number) =>
    vi.fn(async (input: string | URL | Request) => {
      const path = String(input);
      if (path === "/api/auth/session") {
        return new Response(
          JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }),
          { status: 401 },
        );
      }
      if (path === "/api/auth/logout") {
        return logoutStatus === 204
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ error: "SESSION_EXPIRED" }), {
              status: logoutStatus,
            });
      }
      if (path === "/api/repository?per_page=50") {
        return new Response(
          JSON.stringify({ data: [], links: { next: null } }),
        );
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
        status: 404,
      });
    });

  it("signs out to the landing page", async () => {
    window.history.replaceState({}, "", "/app");
    vi.stubGlobal("fetch", signOutFetchMock(204));
    render(<App initialState={authenticatedAppState} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Open account details" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(
      screen.getByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open account details" }),
    ).not.toBeInTheDocument();
  });

  it("signs out to the landing page even when the logout request fails", async () => {
    window.history.replaceState({}, "", "/app");
    vi.stubGlobal("fetch", signOutFetchMock(401));
    render(<App initialState={authenticatedAppState} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Open account details" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(
      screen.getByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
  });

  it("redirects to the landing page when the session is gone on a protected route", async () => {
    window.history.replaceState({}, "", "/research/900");
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(
      screen.getByRole("heading", { name: /Find the study/ }),
    ).toBeInTheDocument();
  });
});
